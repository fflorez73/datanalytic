-- ============================================================
-- 004_grants.sql
-- Grants de Postgres sobre el schema "analytics" para los roles
-- que usa PostgREST/Supabase: anon, authenticated, service_role.
--
-- POR QUÉ HACE FALTA:
-- Un schema custom (a diferencia de "public") NO recibe automáticamente
-- los grants que Supabase configura por defecto. El rol service_role
-- tiene el atributo BYPASSRLS (por eso salta las policies de RLS),
-- pero BYPASSRLS NO salta los GRANT — sigue necesitando permiso
-- explícito de INSERT/UPDATE/SELECT sobre cada tabla. Sin esto, un
-- UPDATE desde el cliente admin (service_role) falla con
-- "permission denied for table analyses" (code 42501), lo cual en
-- la Server Action se traduce en un throw no controlado → 500.
--
-- NOTA: este archivo NO se ejecuta automáticamente. Córrelo
-- manualmente en el SQL editor de Supabase. Es seguro re-ejecutarlo
-- (GRANT no falla si el permiso ya existe).
-- ============================================================

grant usage on schema analytics to anon, authenticated, service_role;

grant all privileges on all tables in schema analytics to service_role;
grant all privileges on all sequences in schema analytics to service_role;
grant all privileges on all routines in schema analytics to service_role;

-- Para que las tablas que se creen después también queden con el grant,
-- sin tener que repetir esto en cada migración futura.
alter default privileges in schema analytics
  grant all privileges on tables to service_role;
alter default privileges in schema analytics
  grant all privileges on sequences to service_role;
alter default privileges in schema analytics
  grant all privileges on routines to service_role;

-- El middleware (middleware.ts) y las páginas de cliente leen
-- analytics.profiles con la sesión del propio usuario (rol Postgres
-- "authenticated", sujeto a RLS) — sin este grant, ni con una policy
-- RLS correcta podrían leer nada.
grant select on analytics.profiles to authenticated;
grant select on analytics.companies to authenticated;
grant select on analytics.analysis_types to authenticated;
grant select on analytics.analyses to authenticated;

-- ============================================================
-- Nota sobre RLS y service_role
-- ============================================================
-- service_role bypasea RLS por defecto (BYPASSRLS), así que para el
-- UPDATE de analytics.analyses desde el panel de super admin NO hace
-- falta ninguna policy — el problema real, si lo hay, son los GRANT
-- de arriba. Las policies de abajo son solo para cuando el usuario
-- final (rol "client") accede a sus propios datos con su sesión
-- (no con service_role):
--
-- alter table analytics.profiles enable row level security;
-- create policy "profiles_select_own" on analytics.profiles
--   for select using (auth.uid() = id);
--
-- alter table analytics.analyses enable row level security;
-- create policy "analyses_select_own_company_published" on analytics.analyses
--   for select using (
--     status = 'published'
--     and deleted_at is null
--     and company_id = (select company_id from analytics.profiles where id = auth.uid())
--   );
