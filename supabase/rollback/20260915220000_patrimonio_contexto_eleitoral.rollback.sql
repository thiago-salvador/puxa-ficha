-- Rollback fechado somente da migration 20260915220000.
-- Recusa se qualquer coluna de contexto já tiver valor ou se houver mais de uma
-- linha por candidato e ano em patrimonio ou patrimonio_ausencia_oficial: a
-- chave antiga não cabe sem apagar declaração ou prova oficial.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio_ausencia_oficial IN SHARE ROW EXCLUSIVE MODE;
DO $guard$ BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260915220000' THEN
    RAISE EXCEPTION 'patrimonio_contexto_eleitoral rollback: ledger divergiu';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.patrimonio
    WHERE ano_arquivo IS NOT NULL OR sq_candidato IS NOT NULL OR uf_candidatura IS NOT NULL
       OR cargo_candidatura IS NOT NULL OR data_eleicao IS NOT NULL OR tipo_eleicao IS NOT NULL
  ) OR EXISTS (
    SELECT 1 FROM public.patrimonio_ausencia_oficial
    WHERE ano_arquivo IS NOT NULL OR uf_candidatura IS NOT NULL
       OR cargo_candidatura IS NOT NULL OR data_eleicao IS NOT NULL OR tipo_eleicao IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'patrimonio_contexto_eleitoral rollback recusado: há contexto eleitoral preenchido; fazer rollback curado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.patrimonio GROUP BY candidato_id, ano_eleicao HAVING count(*) > 1)
     OR EXISTS (SELECT 1 FROM public.patrimonio_ausencia_oficial GROUP BY candidato_id, ano_eleicao HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'patrimonio_contexto_eleitoral rollback recusado: há mais de uma candidatura por candidato e ano; fazer rollback curado';
  END IF;
END $guard$;

ALTER TABLE public.patrimonio_ausencia_oficial
  DROP CONSTRAINT patrimonio_ausencia_oficial_contexto_unique;
ALTER TABLE public.patrimonio_ausencia_oficial
  ADD CONSTRAINT patrimonio_ausencia_oficial_candidato_id_ano_eleicao_key
  UNIQUE (candidato_id, ano_eleicao);
ALTER TABLE public.patrimonio_ausencia_oficial
  DROP COLUMN ano_arquivo RESTRICT,
  DROP COLUMN uf_candidatura RESTRICT,
  DROP COLUMN cargo_candidatura RESTRICT,
  DROP COLUMN data_eleicao RESTRICT,
  DROP COLUMN tipo_eleicao RESTRICT;

DROP INDEX public.uq_patrimonio_contexto_eleitoral;
CREATE UNIQUE INDEX uq_patrimonio_candidato_ano_eleicao
  ON public.patrimonio (candidato_id, ano_eleicao);
ALTER TABLE public.patrimonio
  DROP COLUMN ano_arquivo RESTRICT,
  DROP COLUMN sq_candidato RESTRICT,
  DROP COLUMN uf_candidatura RESTRICT,
  DROP COLUMN cargo_candidatura RESTRICT,
  DROP COLUMN data_eleicao RESTRICT,
  DROP COLUMN tipo_eleicao RESTRICT;
COMMENT ON COLUMN public.patrimonio.ano_eleicao IS NULL;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260915220000';
COMMIT;
