-- Operação separadamente autorizada: restaura o acesso anterior, inclusive o
-- risco MR-01. Não usar como rotina. Aborta se a barreira sofreu alteração.
BEGIN;
DO $$
DECLARE tabela text; p record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260905220000') THEN
    RAISE EXCEPTION 'publicacao: versão ausente no ledger';
  END IF;
  FOREACH tabela IN ARRAY ARRAY['mudancas_partido','patrimonio','pontos_atencao'] LOOP
    SELECT * INTO p FROM pg_policies WHERE schemaname='public' AND tablename=tabela
      AND policyname='publicacao_sem_despublicados';
    IF NOT FOUND OR p.permissive <> 'RESTRICTIVE' OR p.cmd <> 'SELECT'
      OR p.roles <> ARRAY['anon','authenticated']::name[] OR p.qual <> '(despublicado_em IS NULL)'
      OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=tabela AND cmd IN ('SELECT','ALL')) <> 2 THEN
      RAISE EXCEPTION 'publicacao: drift da barreira em %; rollback recusado', tabela;
    END IF;
    EXECUTE format('DROP POLICY publicacao_sem_despublicados ON public.%I', tabela);
  END LOOP;
END $$;
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260905220000';
COMMIT;
