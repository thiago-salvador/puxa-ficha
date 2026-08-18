-- Pontos de atencao editoriais aprovados para Alexandre Kalil e Wilson Witzel.
-- A redacao distingue desaprovacao de contas, impeachment e impedimento atual.
-- Idempotente por candidato_id, categoria e titulo.
BEGIN;

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '18d872c1-3e51-4856-9a93-2ca53b35d78f',
  'justica_eleitoral',
  'Contas da campanha de 2016 desaprovadas pelo TSE',
  'Em 3 de fevereiro de 2022, o TSE manteve a desaprovação das contas da campanha de Alexandre Kalil à Prefeitura de Belo Horizonte em 2016 por uso de recursos de origem não identificada.',
  '[{"url":"https://www.tse.jus.br/comunicacao/noticias/2022/Fevereiro/tse-desaprova-contas-de-alexandre-kalil-da-campanha-de-2016","data":"2022-02-03","titulo":"TSE desaprova contas de Alexandre Kalil da campanha de 2016"}]'::jsonb,
  'media',
  true,
  'curadoria',
  true,
  '2022-02-03'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pontos_atencao
  WHERE candidato_id = '18d872c1-3e51-4856-9a93-2ca53b35d78f'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'Contas da campanha de 2016 desaprovadas pelo TSE'
);

INSERT INTO public.pontos_atencao
  (candidato_id, categoria, titulo, descricao, fontes, gravidade, verificado, gerado_por, visivel, data_referencia)
SELECT
  '85551bd4-860e-4abd-b9ed-463c1691e929',
  'processo_grave',
  'Mandato cassado por impeachment em 2021',
  'O Tribunal Especial Misto do Rio de Janeiro cassou o mandato de Wilson Witzel em 2021 por crime de responsabilidade e o inabilitou para funções públicas por cinco anos. O STJ manteve a eficácia do julgamento. O prazo de inabilitação terminou em 2026, portanto o alerta não afirma impedimento eleitoral atual.',
  '[{"url":"https://www.tse.jus.br/comunicacao/noticias/2022/Setembro/tse-confirma-o-indeferimento-de-registro-de-candidatura-de-wilson-witzel-ao-governo-do-rj","data":"2022-09-27","titulo":"TSE confirma o indeferimento de registro de candidatura de Wilson Witzel ao governo do RJ"},{"url":"https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/30032022-STJ-nega-pedido-de-Witzel-para-voltar-ao-cargo-de-governador-do-Rio-de-Janeiro.aspx","data":"2022-03-30","titulo":"STJ nega pedido de Witzel para voltar ao cargo de governador do Rio de Janeiro"}]'::jsonb,
  'alta',
  true,
  'curadoria',
  true,
  '2021-04-30'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.pontos_atencao
  WHERE candidato_id = '85551bd4-860e-4abd-b9ed-463c1691e929'
    AND categoria = 'processo_grave'
    AND titulo = 'Mandato cassado por impeachment em 2021'
);

DO $$
DECLARE
  n_kalil integer;
  n_witzel integer;
BEGIN
  SELECT COUNT(*) INTO n_kalil
  FROM public.pontos_atencao
  WHERE candidato_id = '18d872c1-3e51-4856-9a93-2ca53b35d78f'
    AND categoria = 'justica_eleitoral'
    AND titulo = 'Contas da campanha de 2016 desaprovadas pelo TSE'
    AND gravidade = 'media'
    AND verificado = true
    AND gerado_por = 'curadoria'
    AND visivel = true
    AND data_referencia = '2022-02-03';

  SELECT COUNT(*) INTO n_witzel
  FROM public.pontos_atencao
  WHERE candidato_id = '85551bd4-860e-4abd-b9ed-463c1691e929'
    AND categoria = 'processo_grave'
    AND titulo = 'Mandato cassado por impeachment em 2021'
    AND gravidade = 'alta'
    AND verificado = true
    AND gerado_por = 'curadoria'
    AND visivel = true
    AND data_referencia = '2021-04-30';

  IF n_kalil <> 1 THEN
    RAISE EXCEPTION 'Alexandre Kalil: esperado 1 ponto público verificado, encontrado %', n_kalil;
  END IF;

  IF n_witzel <> 1 THEN
    RAISE EXCEPTION 'Wilson Witzel: esperado 1 ponto público verificado, encontrado %', n_witzel;
  END IF;
END $$;

COMMIT;
