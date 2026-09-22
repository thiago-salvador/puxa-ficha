-- Preservador: devolve dimas-cassimiro a 'indeferido com recurso', com CAS da
-- postimagem integral gravada no recibo `migration:20260922150000`. A ficha
-- nunca saiu do ar (status e publicavel nao mudaram), entao o rollback so
-- desfaz situacao_candidatura e ultima_atualizacao.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260922150000' THEN
    RAISE EXCEPTION 'issue-433 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  -- Unicidade total do recibo antes de ler `detalhe`: conta todas as linhas
  -- da execucao e so depois confere os atributos da unica linha.
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260922150000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260922150000' AND volume = 1 AND resultado = 'encontrado')
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260922150000') THEN
    RAISE EXCEPTION 'issue-433 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260922150000';

  IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'dimas-cassimiro')
       IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-433 rollback: estado atual nao e a postimagem da migration';
  END IF;

  UPDATE public.candidatos c
  SET situacao_candidatura = r->'before'->>'situacao_candidatura',
      ultima_atualizacao = (r->'before'->>'ultima_atualizacao')::timestamptz
  WHERE c.slug = 'dimas-cassimiro';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'issue-433 rollback: escrita esperada=1 atual=%', afetadas;
  END IF;

  -- Cardinalidade conferida: a chave e (migration_version,tabela,row_id), entao
  -- 'issue-433-dimas-cassimiro-deferido' pode ter zero ou varias linhas. Zero
  -- significa que a migration nao gravou o snapshot; mais de uma, que alguem
  -- escreveu por outro caminho. Nos dois casos o rollback pararia aqui em vez
  -- de gravar recibo e derrubar o ledger em cima de um estado que nao conhece.
  DELETE FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-433-dimas-cassimiro-deferido'
    AND s.tabela = 'candidatos'
    AND s.row_id = (SELECT c.id FROM public.candidatos c
                    WHERE c.slug = 'dimas-cassimiro' AND c.sq_candidato_2026 = '100002552700');
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'issue-433 rollback: snapshot esperado=1 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.situacao_candidatura,candidatos.ultima_atualizacao',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Rollback da migration 20260922150000: ficha dimas-cassimiro volta a "indeferido com recurso".',
           'candidato', (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'dimas-cassimiro')
         )::text,
         'https://divulgacandcontas.tse.jus.br/ (detalhe SQ 100002552700)',
         'rollback:20260922150000','escrita';

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'dimas-cassimiro'
      AND situacao_candidatura = 'indeferido com recurso'
      AND status = 'candidato'
      AND publicavel IS TRUE
  ) THEN
    RAISE EXCEPTION 'issue-433 rollback: ficha nao voltou ao estado anterior';
  END IF;

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260922150000';
END
$rollback$;
COMMIT;
