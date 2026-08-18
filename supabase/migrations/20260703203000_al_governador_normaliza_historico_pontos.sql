BEGIN;

-- JHC: candidaturas/mandatos eleitorais já estavam materializados a partir do TSE,
-- mas sem proveniência estruturada no histórico.
UPDATE public.historico_politico
SET proveniencia = 'tse'
WHERE id IN (
  '1b0c64e3-25d1-471e-b870-f333468d868e',
  '853c9d68-9ad1-47e9-af98-cc1cd1d4b700',
  'd19b88b9-3800-43fc-a4a7-834b24dd3808',
  '8baeae22-13ab-4960-a2ee-f61913add740',
  'fda229aa-9ca9-427d-ba0c-739cf556edf6'
);

-- JHC: ponto IA visível citava PL, mas a ficha pública atual está em PSDB.
UPDATE public.pontos_atencao
SET
  visivel = false,
  verificado = false,
  descricao = descricao || ' [Oculto em 2026-07-03: texto gerado por IA citava partido PL e contagem agregada desatualizada; a ficha pública atual está em PSDB.]'
WHERE id = '9fa4db8b-2b96-4595-b982-37042586e0dc';

-- Renan Filho: candidaturas/mandatos eleitorais materializados a partir do TSE.
UPDATE public.historico_politico
SET proveniencia = 'tse'
WHERE id IN (
  '3a7f6d38-d643-45ec-978a-7955d1d59ad8',
  '470def37-f018-4dcc-a917-4ed07e42679b',
  '51341284-613b-4c99-86da-929c7f174e0e',
  '6fb20705-8476-4b0e-a816-551cd347db37',
  'b2f7b24f-d828-43de-bc0d-4071fb86df82'
);

-- Senado Dados Abertos confirma o mandato iniciado em 2023-02-01; a linha TSE
-- de eleição de 2022 fica normalizada como mandato parlamentar datado.
UPDATE public.historico_politico
SET
  periodo_inicio = 2023,
  proveniencia = 'misto',
  observacoes = 'Mandato de senador iniciado em 2023-02-01, confirmado pelo Senado Dados Abertos; eleição registrada pelo TSE em 2022.'
WHERE id = '6bfe178b-bd43-4ecd-9312-e5ef07fd7ee9';

-- Linha genérica de cargo atual sem início duplicava a linha de senador.
DELETE FROM public.historico_politico
WHERE id = '2c4ee3c5-fd30-446c-9cd7-8f3fef082f5e';

-- Renan Filho: ponto IA visível não é curadoria editorial verificável.
UPDATE public.pontos_atencao
SET
  visivel = false,
  verificado = false,
  descricao = descricao || ' [Oculto em 2026-07-03: ponto gerado por IA, não verificado editorialmente, duplicava resumo de carreira já coberto pelo histórico estruturado.]'
WHERE id = '61a06eae-4815-41fc-acd9-d28d279c41f7';

COMMIT;
