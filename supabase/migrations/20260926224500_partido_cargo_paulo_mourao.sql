-- Partido e cargo_atual de tse-2026-270002544629 (PAULO MOURÃO, Senador TO)
-- voltam ao registro oficial depois de uma sobrescrita pela ingestão da Câmara.
--
-- A auditoria diária de candidaturas (run 36274354865, 2026-09-26T21:52Z)
-- reprovou por uma divergência: partido_sigla publicado PSDB, diferente do TSE.
--
-- Fonte: pacote consulta_cand do TSE, arquivo consulta_cand_2026_TO.csv,
--   https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip
--   SQ_CANDIDATO 270002544629, NM_URNA_CANDIDATO "PAULO MOURÃO", DS_CARGO SENADOR:
--   SG_PARTIDO "PT", NR_PARTIDO 13, NR_CANDIDATO 133, TP_AGREMIACAO "COLIGAÇÃO",
--   federação "FEDERAÇÃO BRASIL DA ESPERANÇA - FE BRASIL" (13-PT/65-PC do B/43-PV).
--   Revisão gerada em 25/09/2026 16:30:36, zip sha256
--   0b7bcdb2d625f14957ded62a7258ca4bfa578d382701e1bfb8f7a3e20ce9497a;
--   a revisão de 24/09/2026 12:30:29 (zip sha256
--   6a1d1b173edba2b88eb5de128c7e976c704d48c9904dc80ec7a2c74c49a6ac1c) traz o
--   mesmo SG_PARTIDO. O número de urna 133 tem o prefixo 13 do PT; a revisão que
--   a auditoria leu às 21:52Z (sha256 a82c1094...) marcou PSDB como divergente.
--   Federação não vira sigla: as fichas de partidos federados guardam a sigla
--   do próprio partido (SG_PARTIDO), como as demais fichas do PT.
--
-- Causa: a ingestão da Câmara de 26/09 (coleta_log execucao local:51422,
-- 19:06Z) leu /api/v2/deputados/74192, cujo ultimoStatus é o da legislatura 51
-- (1999-2003) com situacao "Exercício" e siglaPartido "PSDB", e tratou isso
-- como mandato atual: gravou partido_sigla, partido_atual e cargo_atual
-- "Deputado(a) Federal". A legislatura vigente é a 57; o guard da ingestão
-- passa a exigir idLegislatura vigente (mandatoCamaraVigente). Antes dessa
-- ingestão a ficha tinha partido PT/PT e nenhum cargo_atual, e o histórico de
-- mudancas_partido já registra PSDB -> PT em 2004.
--
-- Escrita: partido_sigla -> 'PT', partido_atual -> 'PT', cargo_atual -> NULL e
-- ultima_atualizacao, só nesta ficha, que continua no ar. formacao,
-- naturalidade e data_nascimento gravados pela mesma ingestão vêm do cadastro
-- oficial do deputado e ficam como estão. Snapshot de preimagem em
-- identidade_timeline_quarentena_snapshot e recibo em coleta_log com
-- before/after. Fail-closed: aceita somente a preimagem medida em 2026-09-26.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-partido-paulo-mourao-production.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
LOCK TABLE public.candidatos IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.identidade_timeline_quarentena_snapshot IN SHARE ROW EXCLUSIVE MODE;

DO $apply$
DECLARE
  quantidade integer;
  verificado_em timestamptz := timestamptz '2026-09-26T22:45:00Z';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos) THEN
    RAISE NOTICE 'partido-mourao-20260926: coorte ausente; correcao ignorada (replay)';
    RETURN;
  END IF;

  IF current_setting('pf.replay', true) = 'true' THEN
    RAISE NOTICE 'partido-mourao-20260926: correcao ignorada apenas no replay descartavel';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'tse-2026-270002544629'
         AND c.id = '25c2ea11-3f6b-4124-8b5c-bcfa08c121ab'
         AND c.sq_candidato_2026 = '270002544629'
         AND c.estado = 'TO'
         AND c.cargo_disputado = 'Senador'
         AND c.partido_sigla = 'PSDB'
         AND c.partido_atual = 'PSDB'
         AND c.cargo_atual = 'Deputado(a) Federal'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE) <> 1
  THEN
    RAISE EXCEPTION 'partido-mourao-20260926: preimagem da ficha divergiu';
  END IF;

  -- @write tabela=identidade_timeline_quarentena_snapshot ref=partido-mourao-20260926 campos=migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em
  INSERT INTO public.identidade_timeline_quarentena_snapshot
    (migration_version,tabela,row_id,candidato_id,preimage,postimage,registrado_em)
  SELECT 'partido-mourao-20260926','candidatos',c.id,c.id,to_jsonb(c),
         to_jsonb(c) || jsonb_build_object(
           'partido_sigla','PT',
           'partido_atual','PT',
           'cargo_atual', NULL,
           'ultima_atualizacao', to_char(verificado_em, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
         verificado_em
  FROM public.candidatos c
  WHERE c.slug = 'tse-2026-270002544629' AND c.sq_candidato_2026 = '270002544629'
  ON CONFLICT (migration_version,tabela,row_id) DO NOTHING;

  -- @write tabela=candidatos slug=tse-2026-270002544629 campos=partido_sigla,partido_atual,cargo_atual,ultima_atualizacao
  UPDATE public.candidatos c
  SET partido_sigla = s.postimage->>'partido_sigla',
      partido_atual = s.postimage->>'partido_atual',
      cargo_atual = s.postimage->>'cargo_atual',
      ultima_atualizacao = (s.postimage->>'ultima_atualizacao')::timestamptz
  FROM public.identidade_timeline_quarentena_snapshot s
  WHERE s.migration_version = 'partido-mourao-20260926'
    AND s.tabela = 'candidatos'
    AND s.row_id = c.id
    AND c.slug = 'tse-2026-270002544629'
    AND to_jsonb(c) = s.preimage;

  GET DIAGNOSTICS quantidade = ROW_COUNT;
  IF quantidade <> 1 THEN
    RAISE EXCEPTION 'partido-mourao-20260926: escrita esperada=1 atual=%', quantidade;
  END IF;

  -- @write tabela=coleta_log ref=migration:20260926224500 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'tse-consulta-cand-2026','global',
         'candidatos.partido_sigla',
         'encontrado', 1,
         jsonb_build_object(
           'resumo','Partido de tse-2026-270002544629 (SQ 270002544629, Senador TO) reconciliado com o pacote consulta_cand do TSE: SG_PARTIDO PT, NR_CANDIDATO 133. A ingestao da Camara de 26/09 tinha gravado PSDB e cargo_atual Deputado(a) Federal a partir do ultimoStatus da legislatura 51 (1999-2003); cargo_atual volta a nulo.',
           'fontes', jsonb_build_array(
             jsonb_build_object('url','https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','arquivo','consulta_cand_2026_TO.csv','dt_geracao','25/09/2026 16:30:36','sha256','0b7bcdb2d625f14957ded62a7258ca4bfa578d382701e1bfb8f7a3e20ce9497a','sg_partido','PT','nr_candidato','133'),
             jsonb_build_object('url','https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip','arquivo','consulta_cand_2026_TO.csv','dt_geracao','24/09/2026 12:30:29','sha256','6a1d1b173edba2b88eb5de128c7e976c704d48c9904dc80ec7a2c74c49a6ac1c','sg_partido','PT','nr_candidato','133'),
             jsonb_build_object('url','https://dadosabertos.camara.leg.br/api/v2/deputados/74192','id_legislatura','51','situacao','Exercicio','sigla_partido','PSDB','uso','status do ultimo mandato na Camara, nao vigente')),
           'linhas', jsonb_agg(jsonb_build_object(
             'slug', c.slug,
             'before', s.preimage,
             'after', to_jsonb(c)) ORDER BY c.slug)
         )::text,
         'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
         'migration:20260926224500','escrita'
  FROM public.candidatos c
  JOIN public.identidade_timeline_quarentena_snapshot s
    ON s.migration_version = 'partido-mourao-20260926' AND s.tabela = 'candidatos' AND s.row_id = c.id;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'tse-2026-270002544629'
         AND c.partido_sigla = 'PT'
         AND c.partido_atual = 'PT'
         AND c.cargo_atual IS NULL
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE
         AND c.ultima_atualizacao = verificado_em) <> 1
  THEN
    RAISE EXCEPTION 'partido-mourao-20260926: pos-condicao falhou';
  END IF;
END
$apply$;

COMMIT;
