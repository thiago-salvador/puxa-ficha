-- Issue #138, backfill estrito e allowlisted, preparado para aplicacao manual.
-- NAO aplicar em producao sem autorizacao nomeada e readback desta mesma rodada.
-- A migration DDL que habilita a chave nova esta em
-- 20260829100000_projetos_lei_chave_por_fonte.sql.
--
-- Alvo: somente Ronaldo Caiado (UUID fixo) e os quatro EMC da Camara que
-- colidem numericamente com quatro materias Senado de 2015. Nenhuma linha
-- Senado e atualizada. O ON CONFLICT e DO NOTHING de proposito: rerodar nao
-- pode transformar ou sobrescrever uma linha ja presente.
-- O payload segue exatamente o writer canonico da Camara: metadata permanece
-- no default '{}' e autoria nao e inventada neste backfill.

BEGIN;

DO $precondition$
DECLARE
  camara_total integer;
  alvo_camara integer;
  camara_exato integer;
  senado_total integer;
  alvo_senado integer;
  total_candidato integer;
BEGIN
  -- O marcador atravessa o DO e os quatro INSERTs seguintes na mesma rodada.
  -- Com is_local=true ele morreria ao fim deste bloco e o backfill viraria no-op.
  PERFORM set_config('pf.issue_138_backfill_apply', 'false', false);
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
      AND slug = 'ronaldo-caiado'
  ) THEN
    RAISE NOTICE 'issue_138 backfill: Ronaldo Caiado ausente no replay; nada aplicado';
    RETURN;
  END IF;

  -- Snapshot literal dos quatro payloads que ja existem no Senado. O backfill
  -- so prossegue se todos os campos mutaveis do ingestor canonico continuarem
  -- iguais, e nao apenas se os quatro IDs ainda estiverem presentes.
  WITH expected(proposicao_id_api, tipo, numero, ano, ementa, situacao, url_inteiro_teor, tema, destaque, destaque_motivo, coverage_id, metadata) AS (
    VALUES
      ('123202', 'RDR', '41', 2015, 'Requer aditamento ao Requerimento (RDR) nº 33, de 2015, para convidar os Srs. José Alves Filho e Herculano Anghinetti, representantes da Associação Brasileira Pró-Desenvolvimento Regional Sustentável (ADIAL BRASIL), a comparecerem em audiência pública a ser realizada nesta Comissão.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123149', 'PLS', '611', 2015, 'Altera a Lei nº 5.172, de 25 de outubro de 1966 (Código Tributário Nacional), para estabelecer limitações à Fazenda Pública e reforçar garantias do contribuinte, e a Lei Complementar nº 87, de 13 de setembro de 1996, para incluir hipótese em que a saída interna de mercadoria é equiparada a operação de exportação.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123094', 'RRA', '64', 2015, 'Requer, nos termos do art. 93, inciso II do Regimento Interno do Senado Federal, a realização de audiência pública para debater a possível fraude no Processo Administrativo INCRA nº 54370000952/2006-48, da Superintendência de Sergipe. Para tanto, sugere que sejam convidados: Sra. Rosivan Machado da Silva, magistrada; Sr. José Fausto Santos, pescador; Sr. Manfredo Goes Martins, produtor rural.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('121483', 'RQS', '597', 2015, 'Requer, nos termos do art. 311 do RISF, preferência para votação do PLV - texto da Comissão,  em relação ao PLV - texto aprovado pela Câmara dos Deputados;', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb)
  )
  SELECT count(*) INTO alvo_senado
  FROM expected e
  JOIN public.projetos_lei p
    ON p.proposicao_id_api = e.proposicao_id_api
   AND p.tipo = e.tipo
   AND p.numero = e.numero
   AND p.ano = e.ano
   AND p.ementa = e.ementa
   AND p.situacao IS NOT DISTINCT FROM e.situacao
   AND p.url_inteiro_teor IS NOT DISTINCT FROM e.url_inteiro_teor
   AND p.tema IS NOT DISTINCT FROM e.tema
   AND p.destaque = e.destaque
   AND p.destaque_motivo IS NOT DISTINCT FROM e.destaque_motivo
   AND p.coverage_id IS NOT DISTINCT FROM e.coverage_id
   AND p.metadata IS NOT DISTINCT FROM e.metadata
  WHERE p.candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND p.fonte = 'Senado';
  IF alvo_senado <> 4 THEN
    RAISE EXCEPTION 'issue_138 backfill: payload exato das 4 linhas Senado divergente, encontradas %', alvo_senado;
  END IF;

  SELECT count(*) INTO senado_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado';
  IF senado_total <> 230 THEN
    RAISE EXCEPTION 'issue_138 backfill: esperado acervo Senado de 230 linhas, encontrado %, abortando', senado_total;
  END IF;

  SELECT count(*) INTO alvo_camara
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');
  WITH expected(proposicao_id_api, tipo, numero, ano, ementa, situacao, url_inteiro_teor, tema, destaque, destaque_motivo, coverage_id, metadata) AS (
    VALUES
      ('123202', 'EMC', '188', 2003, 'Adita o art. 1º da PEC dando nova redação ao § 9º do art. 201 da Constituição Federal.', NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145667', NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123149', 'EMC', '163', 2003, 'Acrescentem-se, no art. 1º da PEC, as seguintes disposições aos arts. 40 e 42 da Constituição Federal, promovendo-se, em conseqüência, as seguintes modificações no art. 2º da PEC, relativamente ao caput do art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998:', NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145577', NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123094', 'EMC', '143', 2003, 'Modifica os arts. 37, 40, 42, 48, 96, 142 e 149 da Constituição Federal, o art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998, e dá outras providências.', NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145483', NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('121483', 'EMC', '89', 2003, 'Altera o Sistema Tributário Nacional e dá outras providências.', NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=143048', NULL, FALSE, NULL, NULL, '{}'::jsonb)
  )
  SELECT count(*) INTO camara_exato
  FROM expected e
  JOIN public.projetos_lei p
    ON p.proposicao_id_api = e.proposicao_id_api
   AND p.tipo = e.tipo
   AND p.numero = e.numero
   AND p.ano = e.ano
   AND p.ementa = e.ementa
   AND p.situacao IS NOT DISTINCT FROM e.situacao
   AND p.url_inteiro_teor IS NOT DISTINCT FROM e.url_inteiro_teor
   AND p.tema IS NOT DISTINCT FROM e.tema
   AND p.destaque = e.destaque
   AND p.destaque_motivo IS NOT DISTINCT FROM e.destaque_motivo
   AND p.coverage_id IS NOT DISTINCT FROM e.coverage_id
   AND p.metadata IS NOT DISTINCT FROM e.metadata
  WHERE p.candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND p.fonte = 'Camara';

  IF alvo_camara NOT IN (0, 4) OR (alvo_camara = 4 AND camara_exato <> 4) THEN
    RAISE EXCEPTION 'issue_138 backfill: estado parcial dos 4 alvos Camara (%), abortando', alvo_camara;
  END IF;

  SELECT count(*) INTO camara_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara';
  SELECT count(*) INTO total_candidato
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid;
  IF alvo_camara = 0 AND camara_total <> 1845 THEN
    RAISE EXCEPTION 'issue_138 backfill: esperado baseline de 1845 Camara, encontrado %', camara_total;
  END IF;
  IF alvo_camara = 0 AND total_candidato <> 2075 THEN
    RAISE EXCEPTION 'issue_138 backfill: esperado baseline total de 2075, encontrado %', total_candidato;
  END IF;
  IF alvo_camara = 4 AND camara_total <> 1849 THEN
    RAISE EXCEPTION 'issue_138 backfill: 4 alvos ja existem, mas total Camara e % em vez de 1849', camara_total;
  END IF;
  IF alvo_camara = 4 AND total_candidato <> 2079 THEN
    RAISE EXCEPTION 'issue_138 backfill: 4 alvos ja existem, mas total e % em vez de 2079', total_candidato;
  END IF;
  PERFORM set_config('pf.issue_138_backfill_apply', 'true', false);
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
  '{}'::jsonb
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
  '{}'::jsonb
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
  '{}'::jsonb
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
  '{}'::jsonb
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
  camara_exato integer;
  senado_total integer;
  total_candidato integer;
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
  WITH expected(proposicao_id_api, tipo, numero, ano, ementa, situacao, url_inteiro_teor, tema, destaque, destaque_motivo, coverage_id, metadata) AS (
    VALUES
      ('123202', 'EMC', '188', 2003, 'Adita o art. 1º da PEC dando nova redação ao § 9º do art. 201 da Constituição Federal.', NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145667', NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123149', 'EMC', '163', 2003, 'Acrescentem-se, no art. 1º da PEC, as seguintes disposições aos arts. 40 e 42 da Constituição Federal, promovendo-se, em conseqüência, as seguintes modificações no art. 2º da PEC, relativamente ao caput do art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998:', NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145577', NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123094', 'EMC', '143', 2003, 'Modifica os arts. 37, 40, 42, 48, 96, 142 e 149 da Constituição Federal, o art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998, e dá outras providências.', NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145483', NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('121483', 'EMC', '89', 2003, 'Altera o Sistema Tributário Nacional e dá outras providências.', NULL, 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=143048', NULL, FALSE, NULL, NULL, '{}'::jsonb)
  )
  SELECT count(*) INTO camara_exato
  FROM expected e
  JOIN public.projetos_lei p
    ON p.proposicao_id_api = e.proposicao_id_api
   AND p.tipo = e.tipo
   AND p.numero = e.numero
   AND p.ano = e.ano
   AND p.ementa = e.ementa
   AND p.situacao IS NOT DISTINCT FROM e.situacao
   AND p.url_inteiro_teor IS NOT DISTINCT FROM e.url_inteiro_teor
   AND p.tema IS NOT DISTINCT FROM e.tema
   AND p.destaque = e.destaque
   AND p.destaque_motivo IS NOT DISTINCT FROM e.destaque_motivo
   AND p.coverage_id IS NOT DISTINCT FROM e.coverage_id
   AND p.metadata IS NOT DISTINCT FROM e.metadata
  WHERE p.candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND p.fonte = 'Camara';
  WITH expected(proposicao_id_api, tipo, numero, ano, ementa, situacao, url_inteiro_teor, tema, destaque, destaque_motivo, coverage_id, metadata) AS (
    VALUES
      ('123202', 'RDR', '41', 2015, 'Requer aditamento ao Requerimento (RDR) nº 33, de 2015, para convidar os Srs. José Alves Filho e Herculano Anghinetti, representantes da Associação Brasileira Pró-Desenvolvimento Regional Sustentável (ADIAL BRASIL), a comparecerem em audiência pública a ser realizada nesta Comissão.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123149', 'PLS', '611', 2015, 'Altera a Lei nº 5.172, de 25 de outubro de 1966 (Código Tributário Nacional), para estabelecer limitações à Fazenda Pública e reforçar garantias do contribuinte, e a Lei Complementar nº 87, de 13 de setembro de 1996, para incluir hipótese em que a saída interna de mercadoria é equiparada a operação de exportação.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123094', 'RRA', '64', 2015, 'Requer, nos termos do art. 93, inciso II do Regimento Interno do Senado Federal, a realização de audiência pública para debater a possível fraude no Processo Administrativo INCRA nº 54370000952/2006-48, da Superintendência de Sergipe. Para tanto, sugere que sejam convidados: Sra. Rosivan Machado da Silva, magistrada; Sr. José Fausto Santos, pescador; Sr. Manfredo Goes Martins, produtor rural.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('121483', 'RQS', '597', 2015, 'Requer, nos termos do art. 311 do RISF, preferência para votação do PLV - texto da Comissão,  em relação ao PLV - texto aprovado pela Câmara dos Deputados;', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb)
  )
  SELECT count(*) INTO senado_total
  FROM expected e
  JOIN public.projetos_lei p
    ON p.proposicao_id_api = e.proposicao_id_api
   AND p.tipo = e.tipo
   AND p.numero = e.numero
   AND p.ano = e.ano
   AND p.ementa = e.ementa
   AND p.situacao IS NOT DISTINCT FROM e.situacao
   AND p.url_inteiro_teor IS NOT DISTINCT FROM e.url_inteiro_teor
   AND p.tema IS NOT DISTINCT FROM e.tema
   AND p.destaque = e.destaque
   AND p.destaque_motivo IS NOT DISTINCT FROM e.destaque_motivo
   AND p.coverage_id IS NOT DISTINCT FROM e.coverage_id
   AND p.metadata IS NOT DISTINCT FROM e.metadata
  WHERE p.candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND p.fonte = 'Senado';
  SELECT count(*) INTO total_candidato
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid;
  IF alvo_camara <> 4 OR camara_exato <> 4 OR camara_total <> 1849 OR senado_total <> 4 OR total_candidato <> 2079 THEN
    RAISE EXCEPTION 'issue_138 backfill: readback interno falhou (Camara alvos=%, Camara exato=%, Camara total=%, Senado exato=%, total=%)', alvo_camara, camara_exato, camara_total, senado_total, total_candidato;
  END IF;
  PERFORM set_config('pf.issue_138_backfill_apply', 'false', false);
END
$postcondition$;

COMMIT;
