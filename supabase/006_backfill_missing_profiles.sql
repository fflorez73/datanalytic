-- ============================================================
-- 006_backfill_missing_profiles.sql
--
-- CAUSA RAÍZ (bugs "dashboard cliente vacío" y "lista de usuarios
-- vacía"): createCompanyUser() (actions.ts) hacía un UPDATE sobre
-- analytics.profiles asumiendo que el trigger on_auth_user_created
-- (002_handle_new_user.sql) ya había insertado la fila al crear el
-- usuario en auth.users. Ese trigger nunca se instaló en esta base
-- de datos (su propio archivo advierte "NO se ejecuta automáticamente").
-- Resultado: el UPDATE afectaba 0 filas sin lanzar error — el usuario
-- quedaba creado en auth.users pero SIN fila en analytics.profiles,
-- por lo tanto invisible en cualquier query por company_id (dashboard
-- cliente, listado de usuarios de la empresa).
--
-- El código ya se corrigió (createCompanyUser ahora hace upsert, no
-- depende del trigger para usuarios nuevos). Este archivo:
--   1) Backfill genérico e idempotente: crea la fila de profiles para
--      CUALQUIER auth.users que no tenga una — no solo el caso
--      conocido — como red de seguridad ante el mismo problema.
--   2) Asigna la empresa correcta al usuario fflorezosorio@gmail.com
--      (único caso conocido a la fecha de este archivo), ya que el
--      backfill genérico no puede inferir company_id.
--
-- NOTA: este archivo NO se ejecuta automáticamente. Córrelo
-- manualmente en el SQL editor de Supabase. Es seguro re-ejecutarlo
-- (el INSERT usa ON CONFLICT DO NOTHING; el UPDATE es idempotente).
-- ============================================================

-- 1) Backfill genérico: profiles faltantes para cualquier auth.users existente.
insert into analytics.profiles (id, email, role)
select u.id, u.email, 'client'
from auth.users u
left join analytics.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 2) Caso conocido: fflorezosorio@gmail.com debía quedar asignado a
--    Mindaxis (única empresa existente a la fecha de este backfill).
update analytics.profiles
set company_id = (select id from analytics.companies where name = 'Mindaxis' limit 1),
    role = 'client'
where email = 'fflorezosorio@gmail.com'
  and company_id is null;
