-- ============================================================
-- 002_handle_new_user.sql
-- Trigger: al crear un usuario en auth.users, insertar
-- automáticamente su perfil en analytics.profiles con role='client'.
--
-- NOTA: este archivo NO se ejecuta automáticamente. Debe correrse
-- manualmente en el SQL editor de Supabase (o vía CLI) cuando la
-- tabla analytics.profiles ya exista.
-- ============================================================

create or replace function analytics.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into analytics.profiles (id, email, role)
  values (new.id, new.email, 'client')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function analytics.handle_new_user();
