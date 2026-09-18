-- Issue #383: a ficha gustavo-henrique (PI, Governador, AVANTE) continua
-- publicada como "indeferido com recurso" depois de o recurso fechar contra
-- ela no TSE.
--
-- Fonte: DivulgaCandContas, detalhe da candidatura SQ 180002550421, lido ao vivo
-- em 18/09/2026 em
-- https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/PI/20322002026/candidato/180002550421
-- e coletado antes pelo workflow "Atualizacao e completude dos dados" (run
-- 35360441081, artefato data-freshness-35360441081/diff.json, 17/09 14:59). Os
-- dois lados concordam. O detalhe diz:
--
--   descricaoSituacao           "Indeferido"
--   isCandidatoInapto           true
--   descricaoSituacaoCandidato  "Nao consta da urna"   (codigoSituacaoCandidato 14)
--   motivoSituacao              "Indeferimento do DRAP do partido politico/
--                                federacao/coligacao"
--   descricaoSituacaoPartido    "Indeferido"
--   descricaoTotalizacao        "Concorrendo"
--
-- `descricaoTotalizacao` = "Concorrendo" e a armadilha deste caso: parece dizer
-- que o candidato segue na disputa, mas e o balde de totalizacao do TSE, nao
-- presenca na urna. Quem responde sobre a urna e
-- `descricaoSituacaoCandidato`, e ele diz "Nao consta da urna". O indeferimento
-- nao e pessoal: caiu o DRAP da coligacao, o que derruba a chapa inteira.
--
-- O classificador do repositorio (classifyOfficialCandidacy) ja lia isso como
-- "terminal" pelo `isCandidatoInapto`, e a auditoria registrou as duas
-- consequencias:
--   public_profile_status_changes: indeferido com recurso -> Indeferido; terminal
--   publication_integrity.stale_public: gustavo-henrique (Governador, PI)
--
-- A trajetoria bate com o noticiario ja indexado na propria ficha: o TRE-PI
-- indeferiu o registro, ele recorreu ao TSE, e o detalhe oficial de hoje nao
-- traz mais o recurso em aberto.
--
-- Duas escritas, nao uma. Trocar so `situacao_candidatura` fecha
-- `public_profile_status_changes` e deixa `stale_public` aberto, porque
-- `stale_public` compara ficha publicada com registro oficial ATIVO e nao le o
-- texto da situacao: enquanto a ficha estiver publicavel, a auditoria continua
-- em review_required e a issue #383 reabre no proximo cron.
--
-- A despublicacao segue a convencao ja aplicada a carlos-jararaca em
-- 20260916140000 (candidatura terminal => publicavel=false, status='removido'),
-- e aqui ela coincide com o que a fonte diz literalmente: candidatura que nao
-- consta da urna nao e candidatura publicavel. A ficha nao e apagada: sai do ar
-- e continua reversivel pelo rollback versionado.
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
  fonte text := 'https://divulgacandcontas.tse.jus.br/ (detalhe SQ 180002550421)';
  verificado_em timestamptz := timestamptz '2026-09-17T17:59:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'issue-383: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'issue-383: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'gustavo-henrique'
         AND c.sq_candidato_2026 = '180002550421'
         AND c.situacao_candidatura = 'indeferido com recurso'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE) <> 1
  THEN
    RAISE EXCEPTION 'issue-383: preimagem de gustavo-henrique divergiu';
  END IF;

  -- Snapshot ANTES da escrita, no mesmo padrao de 20260916140000.
  -- @write tabela=identidade_timeline_quarentena_snapshot ref=issue-383-gustavo-henrique-terminal campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'issue-383-gustavo-henrique-terminal','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'situacao_candidatura','indeferido',
           'status','removido',
           'publicavel', false,
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
         ),
         verificado_em
  FROM public.candidatos c
  WHERE c.slug = 'gustavo-henrique'
    AND c.sq_candidato_2026 = '180002550421'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=gustavo-henrique campos=situacao_candidatura,status,publicavel,ultima_atualizacao
  UPDATE public.candidatos c
  SET situacao_candidatura = s.postimage->>'situacao_candidatura',
      status = s.postimage->>'status',
      publicavel = (s.postimage->>'publicavel')::boolean,
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-383-gustavo-henrique-terminal'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug = 'gustavo-henrique'
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'issue-383: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260918120100 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.situacao_candidatura,candidatos.status,candidatos.publicavel',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Issue #383: candidatura SQ 180002550421 terminal (Indeferido, inapto) no detalhe do DivulgaCandContas de 2026-09-17 14:59; ficha gustavo-henrique reconciliada para situacao_candidatura=indeferido e retirada do ar (publicavel=false, status=removido), mesma convencao de carlos-jararaca em 20260916140000.',
           'before', s.preimage,
           'after', (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.id = s.row_id)
         )::text,
         fonte,'migration:20260918120100','escrita'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'issue-383-gustavo-henrique-terminal'
    AND NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'migration:20260918120100');

  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug = 'gustavo-henrique'
      AND situacao_candidatura = 'indeferido'
      AND status = 'removido'
      AND publicavel IS FALSE
  ) THEN
    RAISE EXCEPTION 'issue-383: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
