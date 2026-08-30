-- Readback somente leitura da issue #138.
-- Esperado apos aplicacao autorizada: 1849 Camara, 231 Senado, total 2080,
-- quatro EMC Camara de 2003 e as quatro materias Senado abaixo intactas.

DO $assert$
DECLARE
  camara_total integer;
  camara_emc_2003 integer;
  camara_exato integer;
  senado_total integer;
  senado_exato integer;
  senado_sem_id integer;
  total_candidato integer;
BEGIN
  SELECT count(*) INTO camara_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara';
  SELECT count(*) INTO camara_emc_2003
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara'
    AND tipo = 'EMC'
    AND ano = 2003
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
  SELECT count(*) INTO senado_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado';

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
  SELECT count(*) INTO senado_sem_id
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado'
    AND proposicao_id_api IS NULL
    AND tipo = 'PL'
    AND numero = '4444'
    AND ano = 2015;
  SELECT count(*) INTO total_candidato
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid;

  IF camara_total <> 1849 OR camara_emc_2003 <> 4 OR camara_exato <> 4 OR senado_total <> 231
     OR senado_exato <> 4 OR senado_sem_id <> 1 OR total_candidato <> 2080
     OR camara_total - 1845 <> 4 THEN
    RAISE EXCEPTION 'issue_138 readback falhou (Camara=%, Camara_exato=%, EMC_2003=%, Senado=%, Senado_exato=%, Senado_sem_id=%, total=%, delta_camara=%)',
      camara_total, camara_exato, camara_emc_2003, senado_total, senado_exato, senado_sem_id, total_candidato, camara_total - 1845;
  END IF;
END
$assert$;

WITH alvo AS (
  SELECT '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid AS candidato_id
), protegidas AS (
  SELECT p.proposicao_id_api, p.tipo, p.numero, p.ano, p.ementa
  FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id
  WHERE p.fonte = 'Senado'
    AND p.proposicao_id_api IN ('123202', '123149', '123094', '121483')
), camara_alvos AS (
  SELECT p.proposicao_id_api, p.tipo, p.numero, p.ano, p.ementa, p.fonte
  FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id
  WHERE p.fonte = 'Camara'
    AND p.proposicao_id_api IN ('123202', '123149', '123094', '121483')
)
SELECT
  (SELECT count(*) FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id WHERE p.fonte = 'Camara') AS camara_total,
  (SELECT count(*) FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id WHERE p.fonte = 'Senado') AS senado_total,
  (SELECT count(*) FROM camara_alvos WHERE tipo = 'EMC' AND ano = 2003 AND fonte = 'Camara') AS camara_emc_2003,
  (SELECT count(*) FROM camara_alvos) AS camara_alvos,
  (SELECT count(*) FROM protegidas) AS senado_protegidas,
  (SELECT count(*) FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id) AS total,
  (SELECT count(*) FROM public.projetos_lei p JOIN alvo a ON a.candidato_id = p.candidato_id WHERE p.fonte = 'Camara') - 1845 AS delta_camara_vs_baseline;
