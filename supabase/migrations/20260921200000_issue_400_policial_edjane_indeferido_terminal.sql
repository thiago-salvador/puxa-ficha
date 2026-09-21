-- Issue #400 (e o cron #406 que a espelha): a ficha policial-edjane (SP,
-- Governador, AGIR) continua publicada como "indeferido com recurso" depois de
-- a candidatura ficar terminal no TSE.
--
-- Fonte: DivulgaCandContas, detalhe da candidatura SQ 250002548080, em
-- https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/SP/20322002026/candidato/250002548080
-- coletado pelo workflow "Atualizacao e completude dos dados" (run
-- 35630296002, artefato data-freshness-35630296002/diff.json, checked_at
-- 19/09 16:11). O detalhe diz:
--
--   descricaoSituacao    "Indeferido"   (lista tambem "Indeferido")
--   isCandidatoInapto    true
--   substituido          false
--   descricaoTotalizacao "Concorrendo"
--
-- `descricaoTotalizacao` = "Concorrendo" e a mesma armadilha da issue #383: e o
-- balde de totalizacao do TSE, nao presenca na urna. O classificador do
-- repositorio (classifyOfficialCandidacy) le a candidatura como "terminal" pelo
-- `isCandidatoInapto`, e a auditoria registrou as duas consequencias:
--   public_profile_status_changes: indeferido com recurso -> Indeferido; terminal
--   publication_integrity.stale_public: policial-edjane (Governador, SP)
--
-- A leitura ao vivo do endpoint em 21/09 nao devolveu JSON (bloqueio do
-- servidor ao cliente sem navegador); a prova e a coleta do proprio workflow,
-- que e a mesma fonte que reabre a issue a cada cron.
--
-- Duas escritas, nao uma, pelo mesmo motivo da #383: trocar so
-- `situacao_candidatura` fecha `public_profile_status_changes` e deixa
-- `stale_public` aberto, porque `stale_public` compara ficha publicada com
-- registro oficial ATIVO e nao le o texto da situacao.
--
-- A despublicacao segue a convencao de carlos-jararaca (20260916140000) e de
-- gustavo-henrique (20260918120100): candidatura terminal => publicavel=false,
-- status='removido'. A ficha nao e apagada: sai do ar e continua reversivel
-- pelo rollback versionado.
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow de aplicacao autorizado.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  fonte text := 'https://divulgacandcontas.tse.jus.br/ (detalhe SQ 250002548080)';
  verificado_em timestamptz := timestamptz '2026-09-19T19:11:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'issue-400: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'issue-400: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'policial-edjane'
         AND c.sq_candidato_2026 = '250002548080'
         AND c.situacao_candidatura = 'indeferido com recurso'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE) <> 1
  THEN
    RAISE EXCEPTION 'issue-400: preimagem de policial-edjane divergiu';
  END IF;

  -- Snapshot ANTES da escrita, no mesmo padrao de 20260916140000.
  -- @write tabela=identidade_timeline_quarentena_snapshot ref=issue-400-policial-edjane-terminal campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'issue-400-policial-edjane-terminal','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'situacao_candidatura','indeferido',
           'status','removido',
           'publicavel', false,
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ),
         verificado_em
  FROM public.candidatos c
  WHERE c.slug = 'policial-edjane'
    AND c.sq_candidato_2026 = '250002548080'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=policial-edjane campos=situacao_candidatura,status,publicavel,ultima_atualizacao
  UPDATE public.candidatos c
  SET situacao_candidatura = s.postimage->>'situacao_candidatura',
      status = s.postimage->>'status',
      publicavel = (s.postimage->>'publicavel')::boolean,
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-400-policial-edjane-terminal'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug = 'policial-edjane'
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'issue-400: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260921200000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.situacao_candidatura,candidatos.status,candidatos.publicavel',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Issue #400: candidatura SQ 250002548080 terminal (Indeferido, inapto) no detalhe do DivulgaCandContas coletado em 2026-09-19 16:11 (run 35630296002); ficha policial-edjane reconciliada para situacao_candidatura=indeferido e retirada do ar (publicavel=false, status=removido), mesma convencao de carlos-jararaca em 20260916140000 e gustavo-henrique em 20260918120100.',
           'before', s.preimage,
           'after', (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.id = s.row_id)
         )::text,
         fonte,'migration:20260921200000','escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-400-policial-edjane-terminal'
    AND NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260921200000');

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'policial-edjane'
      AND situacao_candidatura = 'indeferido'
      AND status = 'removido'
      AND publicavel IS FALSE
  ) THEN
    RAISE EXCEPTION 'issue-400: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
