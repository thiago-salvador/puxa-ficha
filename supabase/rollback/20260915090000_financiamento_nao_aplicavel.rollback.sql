BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.financiamento_verificacoes IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260915090000' THEN
    RAISE EXCEPTION 'rollback nao_aplicavel: ledger divergiu';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.financiamento_verificacoes WHERE resultado = 'nao_aplicavel'
  ) THEN
    RAISE EXCEPTION 'rollback nao_aplicavel bloqueado: remova primeiro as linhas desse estado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.financiamento_verificacoes WHERE fonte_sha256 IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'rollback nao_aplicavel bloqueado: fonte_sha256 preenchido seria apagado';
  END IF;
END
$$;

ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT IF EXISTS financiamento_verificacoes_nao_aplicavel_check;
ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT IF EXISTS financiamento_verificacoes_fonte_sha256_check;
ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT IF EXISTS financiamento_verificacoes_resultado_check;
ALTER TABLE public.financiamento_verificacoes
  ADD CONSTRAINT financiamento_verificacoes_resultado_check
  CHECK (resultado IN ('ausencia_oficial', 'nao_coletado', 'erro'));
ALTER TABLE public.financiamento_verificacoes DROP COLUMN IF EXISTS fonte_sha256;

COMMENT ON TABLE public.financiamento_verificacoes IS
  'Desfecho por pleito sem linha financeira. Erro e nao coletado nunca afirmam ausencia.';

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260915090000';
COMMIT;
