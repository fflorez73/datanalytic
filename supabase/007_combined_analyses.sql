-- ============================================================
-- 007_combined_analyses.sql
-- Módulo de Análisis Combinado: síntesis por IA de 2+ análisis
-- ya publicados de una misma empresa (cualquier tipo/período).
-- No es un motor de cálculo nuevo — combined_analyses NO tiene
-- columna "results": los indicadores ya viven en analytics.analyses
-- (vía las filas referenciadas en combined_analysis_sources); esta
-- tabla solo guarda la síntesis generada por IA en "narrative".
--
-- NOTA: este archivo NO se ejecuta automáticamente. Córrelo
-- manualmente en el SQL editor de Supabase. Es idempotente
-- (create table/index if not exists, grants repetibles).
-- ============================================================

-- ── Análisis combinado ───────────────────────────────────────
create table if not exists analytics.combined_analyses (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references analytics.companies(id),
  title        text not null,
  narrative    jsonb,
  status       text not null default 'draft' check (status in ('draft', 'published')),
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- ── Análisis fuente que componen cada combinado (2+) ─────────
create table if not exists analytics.combined_analysis_sources (
  id                   uuid primary key default gen_random_uuid(),
  combined_analysis_id uuid not null references analytics.combined_analyses(id) on delete cascade,
  analysis_id          uuid not null references analytics.analyses(id),
  created_at           timestamptz not null default now(),
  unique (combined_analysis_id, analysis_id)
);

create index if not exists combined_analyses_company_id_idx on analytics.combined_analyses(company_id);
create index if not exists combined_analysis_sources_combined_id_idx on analytics.combined_analysis_sources(combined_analysis_id);
create index if not exists combined_analysis_sources_analysis_id_idx on analytics.combined_analysis_sources(analysis_id);

-- ============================================================
-- Grants
-- ============================================================
-- service_role ya recibe grants automáticos sobre tablas nuevas por
-- el "alter default privileges" de 004_grants.sql — no hace falta
-- repetirlo aquí. Sí hace falta el SELECT explícito para
-- "authenticated" (dashboard de cliente, mismo patrón que
-- analytics.analyses en 004_grants.sql línea 43).
grant select on analytics.combined_analyses to authenticated;
grant select on analytics.combined_analysis_sources to authenticated;

-- ============================================================
-- RLS — mismo patrón documentado (comentado) para analytics.analyses
-- en 004_grants.sql: service_role bypassa RLS (CRUD total del panel
-- de super admin, sin policy adicional); el cliente final solo puede
-- leer combinados publicados de su propia empresa. La app además
-- filtra explícitamente por company_id/status en cada query, como ya
-- hace con analyses — esto es una segunda capa, no la única.
-- ============================================================
alter table analytics.combined_analyses enable row level security;
alter table analytics.combined_analysis_sources enable row level security;

drop policy if exists "combined_analyses_select_own_company_published" on analytics.combined_analyses;
create policy "combined_analyses_select_own_company_published"
  on analytics.combined_analyses
  for select
  using (
    status = 'published'
    and deleted_at is null
    and company_id = (select company_id from analytics.profiles where id = auth.uid())
  );

drop policy if exists "combined_analysis_sources_select_via_parent" on analytics.combined_analysis_sources;
create policy "combined_analysis_sources_select_via_parent"
  on analytics.combined_analysis_sources
  for select
  using (
    exists (
      select 1 from analytics.combined_analyses ca
      where ca.id = combined_analysis_sources.combined_analysis_id
        and ca.status = 'published'
        and ca.deleted_at is null
        and ca.company_id = (select company_id from analytics.profiles where id = auth.uid())
    )
  );
