-- Reverte 20260922130000: remove view, função e tabela de vínculo compromisso x evidência.
-- Descarta as linhas da tabela; exportar antes se houver revisão feita.
BEGIN;
DROP VIEW IF EXISTS public.compromisso_evidencia_publica;
DROP FUNCTION IF EXISTS public.is_public_compromisso_evidencia(uuid);
DROP TABLE IF EXISTS public.compromisso_evidencia;
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260922130000';
COMMIT;
