-- ============================================================
-- 005_narrative_jsonb.sql
-- analytics.analyses.narrative es actualmente `text` — se confirmó
-- por introspección directa (un UPDATE con un objeto JS lo devolvió
-- como string JSON en vez de objeto deserializado). El motor de
-- narrativa ejecutiva (lib/generate-narrative.ts) guarda un objeto
-- estructurado ahí, así que necesita ser jsonb.
--
-- narrative está en null en todas las filas existentes a la fecha de
-- este archivo, así que el cast es seguro (NULL::jsonb = NULL). Si en
-- el futuro hay valores no-JSON ahí, este ALTER fallaría — revisar
-- antes de correr si ese es el caso.
--
-- NOTA: este archivo NO se ejecuta automáticamente. Córrelo
-- manualmente en el SQL editor de Supabase.
-- ============================================================

alter table analytics.analyses
  alter column narrative type jsonb using narrative::jsonb;
