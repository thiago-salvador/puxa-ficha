-- Desfaz somente a quarentena ampliada (20260925221042): devolve à leitura pública
-- as 68 linhas marcadas com o motivo desta migration. Não toca a quarentena
-- da 20260925163543 nem o ledger. Remover também as entradas de
-- GASTOS_PARLAMENTARES_EM_REVISAO_UNIVERSO no app, senão a ficha segue oculta.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));
DO $rollback$
DECLARE
  afetadas integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260925221042') THEN
    RAISE EXCEPTION 'gastos-universo rollback: migration não consta do ledger';
  END IF;
  UPDATE public.gastos_parlamentares
  SET despublicado_em = NULL,
      despublicacao_motivo = NULL
  WHERE despublicacao_motivo = 'gastos-universo: Total CEAP/CEAPS fora da tolerância da fonte oficial (1% ou R$ 50) ou sem id oficial verificado; varredura 2026-09-25'
    AND despublicado_em IS NOT NULL;
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 68 THEN
    RAISE EXCEPTION 'gastos-universo rollback: esperado 68, atual %', afetadas;
  END IF;
END $rollback$;
COMMIT;
