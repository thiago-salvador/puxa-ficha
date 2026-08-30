-- Readback somente leitura do rollback de dados da issue #138.
-- O schema novo permanece: Camara volta a 1845, Senado permanece em 231,
-- total volta a 2076 e as quatro materias Senado continuam intactas.

DO $assert$
DECLARE
  camara_total integer;
  senado_total integer;
  total_candidato integer;
  camara_alvos integer;
  senado_exato integer;
  senado_sem_id integer;
  scoped_index integer;
  old_constraint integer;
BEGIN
  SELECT count(*) INTO camara_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid AND fonte = 'Camara';
  SELECT count(*) INTO senado_total
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid AND fonte = 'Senado';
  SELECT count(*) INTO total_candidato
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid;
  SELECT count(*) INTO camara_alvos
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Camara' AND proposicao_id_api IN ('123202', '123149', '123094', '121483');

  WITH expected(proposicao_id_api, tipo, numero, ano, ementa, situacao, url_inteiro_teor, tema, destaque, destaque_motivo, coverage_id, metadata) AS (
    VALUES
      ('123202', 'RDR', '41', 2015, 'Requer aditamento ao Requerimento (RDR) nº 33, de 2015, para convidar os Srs. José Alves Filho e Herculano Anghinetti, representantes da Associação Brasileira Pró-Desenvolvimento Regional Sustentável (ADIAL BRASIL), a comparecerem em audiência pública a ser realizada nesta Comissão.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123149', 'PLS', '611', 2015, 'Altera a Lei nº 5.172, de 25 de outubro de 1966 (Código Tributário Nacional), para estabelecer limitações à Fazenda Pública e reforçar garantias do contribuinte, e a Lei Complementar nº 87, de 13 de setembro de 1996, para incluir hipótese em que a saída interna de mercadoria é equiparada a operação de exportação.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('123094', 'RRA', '64', 2015, 'Requer, nos termos do art. 93, inciso II do Regimento Interno do Senado Federal, a realização de audiência pública para debater a possível fraude no Processo Administrativo INCRA nº 54370000952/2006-48, da Superintendência de Sergipe. Para tanto, sugere que sejam convidados: Sra. Rosivan Machado da Silva, magistrada; Sr. José Fausto Santos, pescador; Sr. Manfredo Goes Martins, produtor rural.', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb),
      ('121483', 'RQS', '597', 2015, 'Requer, nos termos do art. 311 do RISF, preferência para votação do PLV - texto da Comissão,  em relação ao PLV - texto aprovado pela Câmara dos Deputados;', NULL, NULL, NULL, FALSE, NULL, NULL, '{}'::jsonb)
  )
  SELECT count(*) INTO senado_exato
  FROM expected e JOIN public.projetos_lei p
    ON p.proposicao_id_api = e.proposicao_id_api AND p.tipo = e.tipo AND p.numero = e.numero
   AND p.ano = e.ano AND p.ementa = e.ementa
   AND p.situacao IS NOT DISTINCT FROM e.situacao
   AND p.url_inteiro_teor IS NOT DISTINCT FROM e.url_inteiro_teor
   AND p.tema IS NOT DISTINCT FROM e.tema AND p.destaque = e.destaque
   AND p.destaque_motivo IS NOT DISTINCT FROM e.destaque_motivo
   AND p.coverage_id IS NOT DISTINCT FROM e.coverage_id
   AND p.metadata IS NOT DISTINCT FROM e.metadata
  WHERE p.candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid AND p.fonte = 'Senado';
  SELECT count(*) INTO senado_sem_id
  FROM public.projetos_lei
  WHERE candidato_id = '781b5abb-aa49-46a7-bc17-c38f16706ed0'::uuid
    AND fonte = 'Senado'
    AND proposicao_id_api IS NULL
    AND tipo = 'PL'
    AND numero = '4444'
    AND ano = 2015;

  SELECT count(*) INTO scoped_index
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'projetos_lei'
    AND indexname = 'uq_projetos_lei_candidato_fonte_proposicao';
  SELECT count(*) INTO old_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.projetos_lei'::regclass
    AND conname = 'uq_projetos_lei_candidato_proposicao';

  IF camara_total <> 1845 OR senado_total <> 231 OR total_candidato <> 2076
     OR camara_alvos <> 0 OR senado_exato <> 4 OR senado_sem_id <> 1 OR scoped_index <> 1 OR old_constraint <> 0 THEN
    RAISE EXCEPTION 'issue_138 rollback readback falhou (Camara=%, Senado=%, Senado_sem_id=%, total=%, alvos=%, Senado_exato=%, scoped=%, antiga=%)',
      camara_total, senado_total, senado_sem_id, total_candidato, camara_alvos, senado_exato, scoped_index, old_constraint;
  END IF;
END
$assert$;
