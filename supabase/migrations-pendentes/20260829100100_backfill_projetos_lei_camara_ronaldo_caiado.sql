-- Issue #138, backfill estrito e allowlisted, preparado para aplicacao manual.
-- NAO aplicar em producao sem autorizacao nomeada e readback desta mesma rodada.
-- A migration DDL que habilita a chave nova esta em
-- 20260829100000_projetos_lei_chave_por_fonte.sql.
--
-- Alvo: somente Ronaldo Caiado (UUID fixo) e os quatro EMC da Camara que
-- colidem numericamente com quatro materias Senado de 2015. Nenhuma linha
-- Senado e atualizada. O ON CONFLICT e DO NOTHING de proposito: rerodar nao
-- pode transformar ou sobrescrever uma linha ja presente.

DO $precondition$
DECLARE
  camara_total integer;
  alvo_camara integer;
  senado_total integer;
  alvo_senado integer;
BEGIN
  PERFORM set_config('pf.issue_138_backfill_apply', 'false', true);
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
      AND slug = 'ronaldo-caiado'
  ) THEN
    RAISE NOTICE 'issue_138 backfill: Ronaldo Caiado ausente no replay; nada aplicado';
    RETURN;
  END IF;

  SELECT count(*) INTO alvo_senado
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');
  IF alvo_senado <> 4 THEN
    RAISE EXCEPTION 'issue_138 backfill: esperadas 4 linhas Senado preservadas, encontradas %', alvo_senado;
  END IF;

  SELECT count(*) INTO senado_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado';
  IF senado_total < 4 THEN
    RAISE EXCEPTION 'issue_138 backfill: acervo Senado menor que as 4 linhas protegidas (%), abortando', senado_total;
  END IF;

  SELECT count(*) INTO alvo_camara
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');

  IF alvo_camara NOT IN (0, 4) THEN
    RAISE EXCEPTION 'issue_138 backfill: estado parcial dos 4 alvos Camara (%), abortando', alvo_camara;
  END IF;

  SELECT count(*) INTO camara_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara';
  IF alvo_camara = 0 AND camara_total <> 1845 THEN
    RAISE EXCEPTION 'issue_138 backfill: esperado baseline de 1845 Camara, encontrado %', camara_total;
  END IF;
  IF alvo_camara = 4 AND camara_total <> 1849 THEN
    RAISE EXCEPTION 'issue_138 backfill: 4 alvos ja existem, mas total Camara e % em vez de 1849', camara_total;
  END IF;
  PERFORM set_config('pf.issue_138_backfill_apply', 'true', true);
END
$precondition$;

-- @write tabela=projetos_lei ref=123202 campos=candidato_id,tipo,numero,ano,ementa,situacao,url_inteiro_teor,fonte,proposicao_id_api,metadata
INSERT INTO public.projetos_lei (
  candidato_id, tipo, numero, ano, ementa, situacao, url_inteiro_teor,
  fonte, proposicao_id_api, metadata
)
SELECT
  '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid, 'EMC', '188', 2003,
  'Adita o art. 1º da PEC dando nova redação ao § 9º do art. 201 da Constituição Federal.',
  NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145667',
  'Camara', '123202',
  jsonb_build_object('source', 'Camara Dados Abertos', 'proposicao_id_api', '123202',
    'detalhe_endpoint', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123202',
    'autores_endpoint', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123202/autores',
    'public_url', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123202',
    'autoria_principal_verificada', false, 'backfill_issue', 138)
WHERE NOT EXISTS (
  SELECT 1 FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara' AND proposicao_id_api = '123202'
)
  AND current_setting('pf.issue_138_backfill_apply', true) = 'true'
ON CONFLICT (candidato_id, fonte, proposicao_id_api) DO NOTHING;

-- @write tabela=projetos_lei ref=123149 campos=candidato_id,tipo,numero,ano,ementa,situacao,url_inteiro_teor,fonte,proposicao_id_api,metadata
INSERT INTO public.projetos_lei (
  candidato_id, tipo, numero, ano, ementa, situacao, url_inteiro_teor,
  fonte, proposicao_id_api, metadata
)
SELECT
  '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid, 'EMC', '163', 2003,
  'Acrescentem-se, no art. 1º da PEC, as seguintes disposições aos arts. 40 e 42 da Constituição Federal, promovendo-se, em conseqüência, as seguintes modificações no art. 2º da PEC, relativamente ao caput do art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998:',
  NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145577',
  'Camara', '123149',
  jsonb_build_object('source', 'Camara Dados Abertos', 'proposicao_id_api', '123149',
    'detalhe_endpoint', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123149',
    'autores_endpoint', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123149/autores',
    'public_url', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123149',
    'autoria_principal_verificada', false, 'backfill_issue', 138)
WHERE NOT EXISTS (
  SELECT 1 FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara' AND proposicao_id_api = '123149'
)
  AND current_setting('pf.issue_138_backfill_apply', true) = 'true'
ON CONFLICT (candidato_id, fonte, proposicao_id_api) DO NOTHING;

-- @write tabela=projetos_lei ref=123094 campos=candidato_id,tipo,numero,ano,ementa,situacao,url_inteiro_teor,fonte,proposicao_id_api,metadata
INSERT INTO public.projetos_lei (
  candidato_id, tipo, numero, ano, ementa, situacao, url_inteiro_teor,
  fonte, proposicao_id_api, metadata
)
SELECT
  '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid, 'EMC', '143', 2003,
  'Modifica os arts. 37, 40, 42, 48, 96, 142 e 149 da Constituição Federal, o art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998, e dá outras providências.',
  NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145483',
  'Camara', '123094',
  jsonb_build_object('source', 'Camara Dados Abertos', 'proposicao_id_api', '123094',
    'detalhe_endpoint', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123094',
    'autores_endpoint', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123094/autores',
    'public_url', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/123094',
    'autoria_principal_verificada', false, 'backfill_issue', 138)
WHERE NOT EXISTS (
  SELECT 1 FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara' AND proposicao_id_api = '123094'
)
  AND current_setting('pf.issue_138_backfill_apply', true) = 'true'
ON CONFLICT (candidato_id, fonte, proposicao_id_api) DO NOTHING;

-- @write tabela=projetos_lei ref=121483 campos=candidato_id,tipo,numero,ano,ementa,situacao,url_inteiro_teor,fonte,proposicao_id_api,metadata
INSERT INTO public.projetos_lei (
  candidato_id, tipo, numero, ano, ementa, situacao, url_inteiro_teor,
  fonte, proposicao_id_api, metadata
)
SELECT
  '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid, 'EMC', '89', 2003,
  'Altera o Sistema Tributário Nacional e dá outras providências.',
  NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=143048',
  'Camara', '121483',
  jsonb_build_object('source', 'Camara Dados Abertos', 'proposicao_id_api', '121483',
    'detalhe_endpoint', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/121483',
    'autores_endpoint', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/121483/autores',
    'public_url', 'https://dadosabertos.camara.leg.br/api/v2/proposicoes/121483',
    'autoria_principal_verificada', false, 'backfill_issue', 138)
WHERE NOT EXISTS (
  SELECT 1 FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara' AND proposicao_id_api = '121483'
)
  AND current_setting('pf.issue_138_backfill_apply', true) = 'true'
ON CONFLICT (candidato_id, fonte, proposicao_id_api) DO NOTHING;

DO $postcondition$
DECLARE
  camara_total integer;
  alvo_camara integer;
  senado_total integer;
BEGIN
  IF current_setting('pf.issue_138_backfill_apply', true) IS DISTINCT FROM 'true' THEN
    RETURN;
  END IF;
  SELECT count(*) INTO alvo_camara
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');
  SELECT count(*) INTO camara_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara';
  SELECT count(*) INTO senado_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');
  IF alvo_camara <> 4 OR camara_total <> 1849 OR senado_total <> 4 THEN
    RAISE EXCEPTION 'issue_138 backfill: readback interno falhou (Camara alvos=%, Camara total=%, Senado protegidas=%)', alvo_camara, camara_total, senado_total;
  END IF;
END
$postcondition$;
