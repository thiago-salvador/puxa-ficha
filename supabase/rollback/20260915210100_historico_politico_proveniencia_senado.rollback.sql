-- Rollback fechado somente da migration 20260915210100.
-- Recusa se alguma row já tiver proveniencia = 'senado': o CHECK anterior não
-- aceita esse valor e reescrever a origem apagaria proveniência verificada.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.historico_politico IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260915210100' THEN
    RAISE EXCEPTION 'historico_politico_proveniencia_senado rollback: ledger divergiu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.historico_politico WHERE proveniencia = 'senado') THEN
    RAISE EXCEPTION 'historico_politico_proveniencia_senado rollback recusado: há rows com proveniencia senado; fazer rollback curado';
  END IF;
END $guard$;

ALTER TABLE public.historico_politico
  DROP CONSTRAINT historico_politico_proveniencia_check;
ALTER TABLE public.historico_politico
  ADD CONSTRAINT historico_politico_proveniencia_check
  CHECK (
    proveniencia IS NULL
    OR proveniencia IN ('tse', 'wikidata', 'manual', 'misto', 'unknown')
  );

COMMENT ON COLUMN public.historico_politico.proveniencia IS
  'Origem da row: tse | wikidata | manual | misto (várias fontes) | unknown. NULL = usar inferência legada em observacoes.';

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260915210100';
COMMIT;
