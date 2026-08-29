-- Rollback somente de dados do backfill estrito da issue #138.
-- Remove somente as quatro linhas Camara cujo payload canonico completo abaixo coincide.
-- Nunca remove as quatro linhas Senado homonimas nem altera o schema scoped.
-- Um rollback de schema, se algum dia autorizado, deve ser arquivo separado e
-- condicionado ao rollback coordenado dos writers e a zero colisoes.

BEGIN;

DO $precondition$
DECLARE
  camara_alvos integer;
  senado_alvos integer;
  senado_exato integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
      AND slug = 'ronaldo-caiado'
  ) THEN
    RAISE EXCEPTION 'issue_138 rollback: Ronaldo Caiado ausente';
  END IF;
  SELECT count(*) INTO camara_alvos
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');
  SELECT count(*) INTO senado_alvos
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado'
    AND proposicao_id_api IN ('123202', '123149', '123094', '121483');
  WITH expected(proposicao_id_api, tipo, numero, ano, ementa, situacao, url_inteiro_teor, tema, destaque, destaque_motivo, coverage_id, metadata) AS (
    VALUES
      ('123202', 'RDR', '41', 2015, 'Requer aditamento ao Requerimento (RDR) nº 33, de 2015, para convidar os Srs. José Alves Filho e Herculano Anghinetti, representantes da Associação Brasileira Pró-Desenvolvimento Regional Sustentável (ADIAL BRASIL), a comparecerem em audiência pública a ser realizada nesta Comissão.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123149', 'PLS', '611', 2015, 'Altera a Lei nº 5.172, de 25 de outubro de 1966 (Código Tributário Nacional), para estabelecer limitações à Fazenda Pública e reforçar garantias do contribuinte, e a Lei Complementar nº 87, de 13 de setembro de 1996, para incluir hipótese em que a saída interna de mercadoria é equiparada a operação de exportação.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123094', 'RRA', '64', 2015, 'Requer, nos termos do art. 93, inciso II do Regimento Interno do Senado Federal, a realização de audiência pública para debater a possível fraude no Processo Administrativo INCRA nº 54370000952/2006-48, da Superintendência de Sergipe. Para tanto, sugere que sejam convidados: Sra. Rosivan Machado da Silva, magistrada; Sr. José Fausto Santos, pescador; Sr. Manfredo Goes Martins, produtor rural.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('121483', 'RQS', '597', 2015, 'Requer, nos termos do art. 311 do RISF, preferência para votação do PLV - texto da Comissão,  em relação ao PLV - texto aprovado pela Câmara dos Deputados;', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb)
  )
  SELECT count(*) INTO senado_exato
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
  IF camara_alvos <> 4 OR senado_alvos <> 4 OR senado_exato <> 4 THEN
    RAISE EXCEPTION 'issue_138 rollback: guard de payload falhou (Camara marcadas=%, Senado protegidas=%, Senado exato=%)', camara_alvos, senado_alvos, senado_exato;
  END IF;
END
$precondition$;

-- @write tabela=projetos_lei ref=123202 campos=delete
DELETE FROM public.projetos_lei
WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
  AND fonte = 'Camara' AND proposicao_id_api = '123202'
  AND tipo = 'EMC' AND numero = '188' AND ano = 2003
  AND ementa = 'Adita o art. 1º da PEC dando nova redação ao § 9º do art. 201 da Constituição Federal.'
  AND situacao IS NULL AND url_inteiro_teor = 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145667'
  AND tema IS NULL AND destaque = FALSE AND destaque_motivo IS NULL AND coverage_id IS NULL
  AND metadata = '{}'::jsonb;

-- @write tabela=projetos_lei ref=123149 campos=delete
DELETE FROM public.projetos_lei
WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
  AND fonte = 'Camara' AND proposicao_id_api = '123149'
  AND tipo = 'EMC' AND numero = '163' AND ano = 2003
  AND ementa = 'Acrescentem-se, no art. 1º da PEC, as seguintes disposições aos arts. 40 e 42 da Constituição Federal, promovendo-se, em conseqüência, as seguintes modificações no art. 2º da PEC, relativamente ao caput do art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998:'
  AND situacao IS NULL AND url_inteiro_teor = 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145577'
  AND tema IS NULL AND destaque = FALSE AND destaque_motivo IS NULL AND coverage_id IS NULL
  AND metadata = '{}'::jsonb;

-- @write tabela=projetos_lei ref=123094 campos=delete
DELETE FROM public.projetos_lei
WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
  AND fonte = 'Camara' AND proposicao_id_api = '123094'
  AND tipo = 'EMC' AND numero = '143' AND ano = 2003
  AND ementa = 'Modifica os arts. 37, 40, 42, 48, 96, 142 e 149 da Constituição Federal, o art. 8º da Emenda Constitucional nº 20, de 15 de dezembro de 1998, e dá outras providências.'
  AND situacao IS NULL AND url_inteiro_teor = 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=145483'
  AND tema IS NULL AND destaque = FALSE AND destaque_motivo IS NULL AND coverage_id IS NULL
  AND metadata = '{}'::jsonb;

-- @write tabela=projetos_lei ref=121483 campos=delete
DELETE FROM public.projetos_lei
WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
  AND fonte = 'Camara' AND proposicao_id_api = '121483'
  AND tipo = 'EMC' AND numero = '89' AND ano = 2003
  AND ementa = 'Altera o Sistema Tributário Nacional e dá outras providências.'
  AND situacao IS NULL AND url_inteiro_teor = 'https://www.camara.leg.br/proposicoesWeb/prop_mostrarintegra?codteor=143048'
  AND tema IS NULL AND destaque = FALSE AND destaque_motivo IS NULL AND coverage_id IS NULL
  AND metadata = '{}'::jsonb;

DO $postcondition$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.projetos_lei
    WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
      AND fonte = 'Camara'
      AND proposicao_id_api IN ('123202', '123149', '123094', '121483')
  ) THEN
    RAISE EXCEPTION 'issue_138 rollback: sobrou linha Camara alvo';
  END IF;
  IF (SELECT count(*) FROM public.projetos_lei
      WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
        AND fonte = 'Senado'
        AND proposicao_id_api IN ('123202', '123149', '123094', '121483')) <> 4 THEN
    RAISE EXCEPTION 'issue_138 rollback: rollback tocou nas 4 linhas Senado';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'projetos_lei'
      AND indexname = 'uq_projetos_lei_candidato_fonte_proposicao'
  ) THEN
    RAISE EXCEPTION 'issue_138 rollback: indice scoped ausente; rollback de dados nao pode degradar o schema';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projetos_lei'::regclass
      AND conname = 'uq_projetos_lei_candidato_proposicao'
  ) THEN
    RAISE EXCEPTION 'issue_138 rollback: constraint antiga reapareceu; rollback de dados nao pode degradar o schema';
  END IF;
END
$postcondition$;

COMMIT;
