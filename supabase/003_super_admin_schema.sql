-- ============================================================
-- 003_super_admin_schema.sql
-- Schema requerido por el panel de super admin (empresas,
-- usuarios y análisis).
--
-- analytics.companies, analytics.analysis_types, analytics.analyses
-- y las columnas full_name/company_id de analytics.profiles ya
-- fueron creadas por la migración 001. Este archivo es idempotente
-- (create table / add column / create index if not exists en todo)
-- y sirve como documentación del schema esperado y red de seguridad
-- por si se corre en un entorno donde 001 no se aplicó — no
-- modifica ni reemplaza estructuras existentes.
--
-- NOTA: este archivo NO se ejecuta automáticamente. Córrelo
-- manualmente en el SQL editor de Supabase si hace falta.
-- ============================================================

create extension if not exists "pgcrypto";

-- ── Empresas ──────────────────────────────────────────────
create table if not exists analytics.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  nit        text,
  sector     text,
  size       text not null check (size in ('micro', 'pequena', 'mediana', 'grande', 'corporativa')),
  logo_url   text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Perfiles: agregar relación a empresa y nombre completo ──
-- (la migración 001 ya incluye también una columna "active" boolean)
alter table analytics.profiles
  add column if not exists full_name text,
  add column if not exists company_id uuid references analytics.companies(id);

-- ── Tipos de análisis (catálogo) ─────────────────────────────
create table if not exists analytics.analysis_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- ── Análisis ──────────────────────────────────────────────
-- NOTA: la tabla real (migración 001) NO tiene columna published_at —
-- el estado "publicado" se rastrea únicamente con status='published'
-- (+ updated_at). El código de la app (actions.ts) ya está alineado
-- con esto; no agregar published_at de vuelta.
create table if not exists analytics.analyses (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references analytics.companies(id),
  analysis_type_id uuid not null references analytics.analysis_types(id),
  title            text not null,
  period_start     date not null,
  period_end       date not null,
  source_data      jsonb not null default '{}'::jsonb,
  results          jsonb not null default '{}'::jsonb,
  narrative        text,
  status           text not null default 'draft' check (status in ('draft', 'published')),
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists analyses_company_id_idx on analytics.analyses(company_id);
create index if not exists profiles_company_id_idx on analytics.profiles(company_id);
