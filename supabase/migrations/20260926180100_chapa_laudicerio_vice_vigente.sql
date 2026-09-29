-- Chapa de laudicerio-aguiar (MT, Governador): sai da quarentena de
-- duplicidade e passa a publicar a vice vigente.
--
-- A migration 20260829030000 resolveu substituições de vice promovendo a
-- chapa com a vice vigente a 'confirmada' e mantendo a outra como
-- 'duplicidade_oficial', e deixou Laudicério de fora porque, naquela data, as
-- duas inscrições dele estavam ativas. Isso deixou de ser verdade.
--
-- Fonte: DivulgaCandContas, detalhe de cada candidatura, relido por navegador
-- em 2026-09-26T17:39:58Z:
--   titular 110002554073, SARGENTO LAUDICÉRIO (coligação 110001801510):
--     https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073
--     descricaoSituacao "Deferido", isCandidatoInapto false, sha256 a8004297...2c4
--     (o mesmo corpo que a auditoria diária 36259044035 gravou às 17:27Z).
--     vices: SARGENTO KAREN FORTES (110002554503) situacaoVice 12,
--     candidatoApto true; ALEX PUCINELI (110002554099) situacaoVice 3,
--     candidatoApto false.
--   vice 110002554503, SARGENTO KAREN FORTES (KAREN DE ARRUDA FORTES, AGIR):
--     https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554503
--     descricaoSituacao "Deferido", isCandidatoInapto false, st_SUBSTITUIDO
--     false, sha256 496b508fd0fbf803825a72efa9798f61f7dd919ec8ffe5143bbce3e0638df04a
--   vice 110002554099, ALEX PUCINELI: descricaoSituacao "Renúncia",
--     isCandidatoInapto true, st_SUBSTITUIDO true (sha256 95aa3e64...1e1b).
--   titular 110002553937, SARGENTO LAUDICÉRIO (LAU) (coligação 110001801468,
--     vice ALEX PUCINELI 110002553938): descricaoSituacao "Indeferido",
--     isCandidatoInapto true (sha256 21b2d2f1...ff4).
--
-- Escrita, na mesma forma de 20260829030000: só identidade_status da chapa
-- 2026:MT:laudicerio-aguiar-machado:duplicidade:110002554073:110002554503
-- passa a 'confirmada'. A chapa da inscrição indeferida (110002553937 com
-- vice 110002553938) continua 'duplicidade_oficial' e fora da superfície
-- pública; nenhuma outra coluna muda. Snapshot de preimagem e recibo em
-- coleta_log com before/after. Fail-closed: aceita somente a preimagem medida
-- em 2026-09-26.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-situacao-godeiro-laudicerio-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.chapas_2026 IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-26T17:39:58Z';
  chave_vigente text := '2026:MT:laudicerio-aguiar-machado:duplicidade:110002554073:110002554503';
  chave_indeferida text := '2026:MT:laudicerio-aguiar-machado:duplicidade:110002553937:110002553938';
  titular uuid := '9f4c6003-20a5-486e-9c7a-90d48d4cdcd0';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chapas_2026) THEN
    RAISE NOTICE 'chapa-laudicerio-20260926: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'chapa-laudicerio-20260926: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026 ch
       WHERE ch.chave = chave_vigente
         AND ch.id = '5be60ab8-7a47-4a75-ac7e-6e159998ea7d'
         AND ch.identidade_status = 'duplicidade_oficial'
         AND ch.vinculo_titular_status = 'confirmado'
         AND ch.fonte_tipo = 'legado'
         AND ch.uf = 'MT' AND ch.cargo_titular = 'Governador'
         AND ch.sq_coligacao = '110001801510'
         AND ch.titular_candidato_id = titular
         AND ch.titular_sq_candidato = '110002554073'
         AND ch.vice_sq_candidato = '110002554503'
         AND ch.vice_nome_completo = 'KAREN DE ARRUDA FORTES'
         AND ch.vice_nome_urna = 'SARGENTO KAREN FORTES'
         AND ch.vice_partido_sigla = 'AGIR') <> 1
     OR (SELECT count(*) FROM public.chapas_2026 ch
       WHERE ch.chave = chave_indeferida
         AND ch.identidade_status = 'duplicidade_oficial'
         AND ch.sq_coligacao = '110001801468'
         AND ch.titular_candidato_id = titular
         AND ch.titular_sq_candidato = '110002553937'
         AND ch.vice_sq_candidato = '110002553938') <> 1
     OR (SELECT count(*) FROM public.chapas_2026 ch WHERE ch.titular_candidato_id = titular) <> 2
     OR EXISTS (SELECT 1 FROM public.chapas_2026 ch
       WHERE ch.titular_candidato_id = titular AND ch.identidade_status = 'confirmada')
     OR NOT EXISTS (SELECT 1 FROM public.candidatos c
       WHERE c.id = titular AND c.slug = 'laudicerio-aguiar' AND c.sq_candidato_2026 = '110002554073')
  THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926: preimagem das chapas divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=chapa-laudicerio-20260926 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'chapa-laudicerio-20260926','chapas_2026',ch.id,ch.titular_candidato_id,to_jsonb(ch),
         to_jsonb(ch) || jsonb_build_object('identidade_status','confirmada'),
         verificado_em
  FROM public.chapas_2026 ch
  WHERE ch.chave = chave_vigente
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=chapas_2026 ref=chapa-laudicerio-20260926 chave=2026:MT:laudicerio-aguiar-machado:duplicidade:110002554073:110002554503 campos=identidade_status
  UPDATE public.chapas_2026 ch
  SET identidade_status = s.postimage->>'identidade_status'
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'chapa-laudicerio-20260926'
    AND s.tabela = 'chapas_2026'
    AND s.row_id = ch.id
    AND ch.chave = '2026:MT:laudicerio-aguiar-machado:duplicidade:110002554073:110002554503'
    AND to_jsonb(ch) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260926180100 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'chapas_2026.identidade_status:laudicerio-aguiar',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Chapa de laudicerio-aguiar confirmada com a vice vigente SARGENTO KAREN FORTES (SQ 110002554503, Deferido e apta no DivulgaCandContas relido em 2026-09-26T17:39:58Z). A inscricao 110002553937 esta Indeferido e inapta; sua chapa com ALEX PUCINELI (110002553938) segue duplicidade_oficial.',
           'fontes', jsonb_build_array(
             jsonb_build_object('url','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073','sha256','a8004297b0a03c4c402ca9a39f84c3e26d5f46898f8b08925d6d26a62bd772c4','descricao_situacao','Deferido'),
             jsonb_build_object('url','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554503','sha256','496b508fd0fbf803825a72efa9798f61f7dd919ec8ffe5143bbce3e0638df04a','descricao_situacao','Deferido'),
             jsonb_build_object('url','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554099','sha256','95aa3e646f73d9a5f6a315963a16ead7a63f23bb3b5fdf13e8732cb905f81e1b','descricao_situacao','Renúncia'),
             jsonb_build_object('url','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002553937','sha256','21b2d2f1b68cc3110dc427e55fe439009af3161fa3a4df670012c24ef0969ff4','descricao_situacao','Indeferido')),
           'linhas', jsonb_agg(jsonb_build_object(
             'chave', ch.chave,
             'before', s.preimage,
             'after', to_jsonb(ch)))
         )::text,
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073',
         'migration:20260926180100','escrita'
  FROM public.chapas_2026 ch
  JOIN public.identidade_timeline_quarentena_snapshot s
    ON s.migration_version = 'chapa-laudicerio-20260926' AND s.tabela = 'chapas_2026' AND s.row_id = ch.id;

  IF (SELECT count(*) FROM public.chapas_2026 ch
       WHERE ch.titular_candidato_id = titular AND ch.identidade_status = 'confirmada'
         AND ch.chave = chave_vigente AND ch.vice_sq_candidato = '110002554503') <> 1
     OR (SELECT count(*) FROM public.chapas_2026 ch
       WHERE ch.chave = chave_indeferida AND ch.identidade_status = 'duplicidade_oficial') <> 1
  THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
