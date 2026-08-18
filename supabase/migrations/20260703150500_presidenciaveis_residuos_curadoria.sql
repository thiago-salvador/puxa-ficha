-- Remove resíduos de curadoria já marcados nos dossiês presidenciais.
-- Escopo: Flavio Bolsonaro, Romeu Zema, Ronaldo Caiado e Rui Costa Pimenta.

BEGIN;

-- Flavio Bolsonaro: linha 2003-2006 marcada como duplicada da linha TSE 2002-2006.
DELETE FROM public.historico_politico
WHERE id = 'f9ce2ed2-a007-4b34-9775-b6d42c11a9b7';

UPDATE public.historico_politico
SET proveniencia = 'tse'
WHERE id IN (
  '0b48fda5-d34f-42cb-9b31-79b3c1d79478',
  'd565a4ef-545e-4458-bcc2-b4351386a1fa',
  '416c6486-b850-4a64-b9d5-0a8291c8ee09',
  '3e04744d-8541-40d9-966b-0fbd9c8c593c'
);

-- Romeu Zema: linha 2018-2022 já marcada como redundante da linha 2019-2022.
DELETE FROM public.historico_politico
WHERE id = '709fe28f-e877-4d84-8b9f-524800a7d389';

UPDATE public.historico_politico
SET proveniencia = 'tse'
WHERE id = 'a4b124e9-5113-4fd1-84e4-2e9f6c9c987a';

-- Ronaldo Caiado: linha 2026 de Governador é incorreta; houve filiação ao PSD, não novo mandato.
DELETE FROM public.historico_politico
WHERE id = '6183c8a8-8cbc-452e-a8b6-abf8a59b5ea6';

-- Ronaldo Caiado: transição PFL->DEM de 2010 é duplicata da transição oficial de 2007.
DELETE FROM public.mudancas_partido
WHERE id = '57a1132d-35b8-4419-9083-8a87ca91a1b1';

UPDATE public.historico_politico
SET proveniencia = 'tse'
WHERE id IN (
  '6b89c889-aaf4-4072-ad0f-12f8d2b50520',
  'e9ece353-802f-4347-84df-ca0027232878',
  'dc7e244c-31e0-40df-a053-02b416dbd460',
  'd4737d80-f14a-4486-87ba-eab792fe59d8',
  '7759b635-5e6d-42d2-8a1a-54b222ba99bd',
  '773b5bac-d23f-442c-b19b-2ef03c0f16c6'
);

-- Rui Costa Pimenta: candidaturas históricas vieram de TSE nas próprias observações.
UPDATE public.historico_politico
SET proveniencia = 'tse'
WHERE id IN (
  '3ff10ff2-1901-47af-a734-d17cfb7b4a4e',
  '3942e2f7-0483-4400-ba72-6ed8ef847dfc',
  '32ad0c4b-4f3f-40fa-afe0-8a918bac1dbd',
  '94bdadb7-258d-462a-b979-98e1ca8c0beb',
  'e683d484-beec-4e2e-8f22-8203641afff0',
  'fba61513-d28c-4692-9a17-02346da4da52',
  'ede585ed-363f-40c9-b0f3-261c54ad8748'
);

-- Rui Costa Pimenta: PCO->PCO não é troca partidária.
DELETE FROM public.mudancas_partido
WHERE id = '69988120-8d74-4d49-8ffa-023367bf1f83';

-- Rui Costa Pimenta: ponto visível citava 2018/2022 sem respaldo no histórico/seed/TSE já consultado.
UPDATE public.pontos_atencao
SET
  visivel = false,
  verificado = false,
  descricao = descricao || ' [Oculto em 2026-07-03: texto citava candidaturas presidenciais de 2018/2022 sem respaldo no histórico estruturado/seed/TSE consultado.]'
WHERE id = 'c4782a62-bce0-4a5a-b804-e2f9b2e70d52';

COMMIT;
