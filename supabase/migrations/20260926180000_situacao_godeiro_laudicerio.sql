-- Situação de candidatura de duas fichas de governador divergia do TSE.
--
-- A auditoria diária de candidaturas (run 36259044035, 2026-09-26T17:27Z)
-- reprovou em review_required por estas duas fichas: situação publicada
-- diferente do detalhe atual do DivulgaCandContas.
--
-- Fonte: DivulgaCandContas, detalhe de cada candidatura, relido por navegador
-- em 2026-09-26T17:39:58Z; o SHA-256 do corpo é o mesmo que a auditoria
-- gravou às 17:27Z:
--   https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RN/20322002026/candidato/200002554482
--     GODEIRO LINHARESS (RN, DC, 27): descricaoSituacao "Deferido",
--     isCandidatoInapto false, st_SUBSTITUIDO false, descricaoTotalizacao
--     "Concorrendo", dataUltimaAtualizacao "2026-09-25 14:44",
--     sha256 37195e099f37447665391923a65f8df7932d13c649a8f7a064315a8c011399f9
--   https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073
--     SARGENTO LAUDICÉRIO (MT, AGIR, 36): descricaoSituacao "Deferido",
--     isCandidatoInapto false, st_SUBSTITUIDO false, descricaoTotalizacao
--     "Concorrendo", dataUltimaAtualizacao "2026-09-25 19:09",
--     sha256 a8004297b0a03c4c402ca9a39f84c3e26d5f46898f8b08925d6d26a62bd772c4
--
-- Laudicério tem duas inscrições 2026 no pacote consulta_cand. A outra,
-- 110002553937 (SARGENTO LAUDICÉRIO (LAU)), está "Indeferido" e inapta no
-- mesmo DivulgaCand (sha256 21b2d2f1...ff4, dataUltimaAtualizacao
-- "2026-09-18 14:39"). A inscrição ativa é 110002554073, que já é o
-- sq_candidato_2026 da ficha e do seed; o SQ não muda.
--
-- Escrita: só situacao_candidatura -> 'deferido' e ultima_atualizacao, nas duas
-- fichas, que continuam no ar. Mesma forma de 20260925220000 (alexandre-curi).
-- Snapshot de preimagem em identidade_timeline_quarentena_snapshot e recibo em
-- coleta_log com before/after de cada linha. Fail-closed: aceita somente a
-- preimagem medida em 2026-09-26.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-situacao-godeiro-laudicerio-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-26T17:39:58Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'situacao-gov-20260926: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'situacao-gov-20260926: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE ((c.slug = 'godeiro-linharess' AND c.sq_candidato_2026 = '200002554482'
               AND c.estado = 'RN' AND c.situacao_candidatura = 'pendente de julgamento')
           OR (c.slug = 'laudicerio-aguiar' AND c.sq_candidato_2026 = '110002554073'
               AND c.estado = 'MT' AND c.situacao_candidatura = 'indeferido com recurso'))
         AND c.cargo_disputado = 'Governador'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE) <> 2
  THEN
    RAISE EXCEPTION 'situacao-gov-20260926: preimagem das duas fichas divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=situacao-gov-20260926 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'situacao-gov-20260926','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'situacao_candidatura','deferido',
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         verificado_em
  FROM public.candidatos c
  WHERE (c.slug = 'godeiro-linharess' AND c.sq_candidato_2026 = '200002554482')
     OR (c.slug = 'laudicerio-aguiar' AND c.sq_candidato_2026 = '110002554073')
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=godeiro-linharess campos=situacao_candidatura,ultima_atualizacao
  -- @write tabela=candidatos slug=laudicerio-aguiar campos=situacao_candidatura,ultima_atualizacao
  UPDATE public.candidatos c
  SET situacao_candidatura = s.postimage->>'situacao_candidatura',
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'situacao-gov-20260926'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug IN ('godeiro-linharess','laudicerio-aguiar')
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 2 THEN
    RAISE EXCEPTION 'situacao-gov-20260926: escrita esperada=2 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260926180000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-divulgacand-detalhe-2026','global',
         'candidatos.situacao_candidatura',
         'encontrado', 2,
         jsonb_build_object(
           'resumo','Situacao de duas candidaturas a governador reconciliada com o DivulgaCandContas relido em 2026-09-26T17:39:58Z: godeiro-linharess (SQ 200002554482) Deferido; laudicerio-aguiar (SQ 110002554073, inscricao ativa; 110002553937 Indeferido e inapta) Deferido.',
           'fontes', jsonb_build_array(
             jsonb_build_object('url','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/RN/20322002026/candidato/200002554482','sha256','37195e099f37447665391923a65f8df7932d13c649a8f7a064315a8c011399f9','descricao_situacao','Deferido'),
             jsonb_build_object('url','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073','sha256','a8004297b0a03c4c402ca9a39f84c3e26d5f46898f8b08925d6d26a62bd772c4','descricao_situacao','Deferido'),
             jsonb_build_object('url','https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002553937','sha256','21b2d2f1b68cc3110dc427e55fe439009af3161fa3a4df670012c24ef0969ff4','descricao_situacao','Indeferido')),
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', c.slug,
             'before', s.preimage,
             'after', to_jsonb(c)) ORDER BY c.slug)
         )::text,
         'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/MT/20322002026/candidato/110002554073',
         'migration:20260926180000','escrita'
  FROM public.candidatos c
  JOIN public.identidade_timeline_quarentena_snapshot s
    ON s.migration_version = 'situacao-gov-20260926' AND s.tabela = 'candidatos' AND s.row_id = c.id;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug IN ('godeiro-linharess','laudicerio-aguiar')
         AND c.situacao_candidatura = 'deferido'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE
         AND c.ultima_atualizacao = verificado_em) <> 2
  THEN
    RAISE EXCEPTION 'situacao-gov-20260926: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
