-- Pontos de atencao editoriais aprovados para Tony Garcia e Jorginho Mello.
-- A redacao preserva o status factual registrado nas fontes primarias.
-- Idempotente por candidato_id, categoria e titulo.
BEGIN;

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  'f1cc2ea2-6559-46fa-9812-021abe76f306',
  'processo_grave',
  'Condenado por gestão fraudulenta no Consórcio Garibaldi',
  'Tony Garcia foi condenado por gestão fraudulenta do Consórcio Nacional Garibaldi. Segundo o STF e o TRF4, a pena foi reduzida para seis anos de prestação de serviços comunitários após colaboração com as investigações e compromisso de indenizar clientes.',
  '[{"url":"https://noticias.stf.jus.br/postsnoticias/primeira-turma-do-stf-arquiva-habeas-corpus-em-favor-de-tony-garcia/","data":"2007-12-18","titulo":"STF arquiva habeas corpus em favor de Tony Garcia"},{"url":"https://www.trf4.jus.br/trf4/controlador.php?acao=noticia_visualizar&id_noticia=16763","data":"2011-10-04","titulo":"TRF4 registra condenação e reparação a clientes do Consórcio Garibaldi"}]'::jsonb,
  'media',
  true,
  'curadoria',
  true,
  '2007-12-18'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pontos_atencao
  WHERE candidato_id = 'f1cc2ea2-6559-46fa-9812-021abe76f306'
    AND categoria = 'processo_grave'
    AND titulo = 'Condenado por gestão fraudulenta no Consórcio Garibaldi'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  'd62ecbf0-98ab-41f9-8684-f3c7bd46251a',
  'justica_eleitoral',
  'TRE-SC manteve multa por impulsionamento de propaganda negativa',
  'Na campanha de 2022, o TRE-SC manteve multa de R$ 7,5 mil contra Jorginho Mello por impulsionar nas redes sociais propaganda eleitoral negativa contra um adversário. A Corte registrou que o recurso do candidato foi conhecido e teve provimento negado.',
  '[{"url":"https://www.tre-sc.jus.br/comunicacao/noticias/2022/Setembro/corte-eleitoral-confirma-aplicacao-de-multa-a-candidato-ao-governo-do-estado-por-impulsionamento-de-propaganda-negativa","data":"2022-09-14","titulo":"TRE-SC confirma multa por impulsionamento de propaganda negativa"},{"url":"https://www.tre-sc.jus.br/comunicacao/noticias/2022/Outubro/pleno-confirma-a-sancao-de-multa-a-candidato-ao-2o-turno-a-postulante-ao-senado-e-ao-beto-carrero-world-por-propaganda-irregular","data":"2022-10-26","titulo":"TRE-SC confirma outra sanção por propaganda irregular na campanha de 2022"}]'::jsonb,
  'baixa',
  true,
  'curadoria',
  true,
  '2022-09-14'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pontos_atencao
  WHERE candidato_id = 'd62ecbf0-98ab-41f9-8684-f3c7bd46251a'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'TRE-SC manteve multa por impulsionamento de propaganda negativa'
);

DO $$
DECLARE
  n_tony integer;
  n_jorginho integer;
BEGIN
  SELECT COUNT(*) INTO n_tony
  FROM public.pontos_atencao
  WHERE candidato_id = 'f1cc2ea2-6559-46fa-9812-021abe76f306'
    AND categoria = 'processo_grave'
    AND titulo = 'Condenado por gestão fraudulenta no Consórcio Garibaldi'
    AND gravidade = 'media'
    AND verificado = true
    AND gerado_por = 'curadoria'
    AND visivel = true
    AND data_referencia = '2007-12-18';

  SELECT COUNT(*) INTO n_jorginho
  FROM public.pontos_atencao
  WHERE candidato_id = 'd62ecbf0-98ab-41f9-8684-f3c7bd46251a'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'TRE-SC manteve multa por impulsionamento de propaganda negativa'
    AND gravidade = 'baixa'
    AND verificado = true
    AND gerado_por = 'curadoria'
    AND visivel = true
    AND data_referencia = '2022-09-14';

  IF n_tony <> 1 THEN
    RAISE EXCEPTION 'Tony Garcia: esperado 1 ponto público verificado, encontrado %', n_tony;
  END IF;

  IF n_jorginho <> 1 THEN
    RAISE EXCEPTION 'Jorginho Mello: esperado 1 ponto público verificado, encontrado %', n_jorginho;
  END IF;
END $$;

COMMIT;
