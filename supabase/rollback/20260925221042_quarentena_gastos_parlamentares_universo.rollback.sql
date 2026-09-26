-- Desfaz somente a quarentena ampliada (20260925221042): devolve à leitura pública
-- as 68 linhas marcadas com o motivo desta migration e tira a versão do ledger.
-- Não toca a quarentena da 20260925163543. Só vale com esta migration no topo
-- do ledger. Remover também as entradas de GASTOS_PARLAMENTARES_EM_REVISAO_UNIVERSO
-- no app, senão a ficha segue oculta.
-- Rodar pelo workflow rollback-gastos-parlamentares-quarentena-universo-production.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE
  afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260925221042' THEN
    RAISE EXCEPTION 'gastos-universo rollback: ledger divergiu (rollback só vale com esta migration no topo)';
  END IF;
  IF (SELECT count(*) FROM public.gastos_parlamentares
      WHERE despublicacao_motivo = 'gastos-universo: Total CEAP/CEAPS fora da tolerância da fonte oficial (1% ou R$ 50) ou sem id oficial verificado; varredura 2026-09-25'
        AND despublicado_em IS NOT NULL) <> 68 THEN
    RAISE EXCEPTION 'gastos-universo rollback: estado atual não é a postimagem da migration';
  END IF;
  -- @write tabela=gastos_parlamentares ref=gastos-universo campos=despublicado_em,despublicacao_motivo
  UPDATE public.gastos_parlamentares
  SET despublicado_em = NULL,
      despublicacao_motivo = NULL
  WHERE despublicacao_motivo = 'gastos-universo: Total CEAP/CEAPS fora da tolerância da fonte oficial (1% ou R$ 50) ou sem id oficial verificado; varredura 2026-09-25'
    AND despublicado_em IS NOT NULL;
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 68 THEN
    RAISE EXCEPTION 'gastos-universo rollback: esperado 68, atual %', afetadas;
  END IF;
  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260925221042';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'gastos-universo rollback: ledger esperado 1, atual %', afetadas;
  END IF;
END $rollback$;
COMMIT;
