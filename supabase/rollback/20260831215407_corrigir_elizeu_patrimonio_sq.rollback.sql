-- Rollback fechado somente da migration 20260831215407.

BEGIN;

DO $precondition$
DECLARE
  target_count integer;
  receipt_count integer;
  dr_luisinho_absence_count integer;
  ledger_count integer;
  ledger_top text;
BEGIN
  SELECT count(*) INTO target_count
  FROM public.candidatos c
  JOIN public.patrimonio p ON p.candidato_id = c.id AND p.ano_eleicao = 2026
  WHERE c.id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND c.slug = 'elizeu-aguiar'
    AND c.sq_candidato_2026 = '180002549920'
    AND p.valor_total = 1592808.00
    AND p.bens = '[{"tipo":"Terreno","descricao":"UM TERRENO","valor":40000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":802808},{"tipo":"Casa","descricao":"UMA CASA RESIDENCIAL","valor":750000}]'::jsonb
    AND p.fonte LIKE '%SQ 180002549920%';

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio'
    AND alvo = 'elizeu-aguiar'
    AND execucao = 'migration:20260831215407';

  SELECT count(*) INTO dr_luisinho_absence_count
  FROM public.patrimonio_ausencia_oficial
  WHERE id = '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid;

  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260831215407';

  IF target_count <> 1 OR receipt_count <> 1 OR dr_luisinho_absence_count <> 0
     OR ledger_count <> 1 OR ledger_top <> '20260831215407' THEN
    RAISE EXCEPTION
      'rollback patrimonio 2026: precondicao divergiu (alvo=%, receipt=%, ausencia_dr_luisinho=%, ledger_count=%, ledger_top=%)',
      target_count, receipt_count, dr_luisinho_absence_count, ledger_count, ledger_top;
  END IF;
END
$precondition$;

-- @write tabela=candidatos slug=elizeu-aguiar campos=sq_candidato_2026
UPDATE public.candidatos
SET sq_candidato_2026 = NULL
WHERE id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
  AND slug = 'elizeu-aguiar'
  AND sq_candidato_2026 = '180002549920';

-- @write tabela=patrimonio slug=elizeu-aguiar ano=2026 campos=valor_total,bens,fonte
UPDATE public.patrimonio
SET valor_total = 872808.00,
    bens = '[{"tipo":"Casa","descricao":"RUA TORQUATO NETO, 2400 - SÃO CRISTÓVÃO","valor":750000},{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":82808},{"tipo":"Terreno","descricao":"TERRENO RUA ARMANDO CAJUBÁ, BAIRRO SABIAZAL, PARNAÍBA (50 X 80)","valor":40000}]'::jsonb,
    fonte = 'TSE Dados Abertos bem_candidato_2026 SQ 180002533958 (total agregado, snapshot 2026-08-15 19:35 BRT; CSV gerado 15/08/2026 19:30:07 BRT; https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip)'
WHERE candidato_id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
  AND ano_eleicao = 2026
  AND valor_total = 1592808.00
  AND fonte LIKE '%SQ 180002549920%';

-- @write tabela=patrimonio_ausencia_oficial slug=dr-luisinho ano=2026 campos=restauracao_de_ausencia
INSERT INTO public.patrimonio_ausencia_oficial
  (id, candidato_id, ano_eleicao, sq_candidato, fonte_url, verificado_em, detalhe, execucao, created_at)
VALUES (
  '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid,
  'c9c117e4-ea81-433d-b8c0-a01c8d831bae'::uuid,
  2026,
  '10002533539',
  'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip',
  '2026-08-16T19:05:36.504318+00:00'::timestamptz,
  'Pacote oficial bem_candidato_2026 do TSE lido de ponta a ponta sem bens para o SQ 10002533539; snapshot 2026-08-15 16:35 BRT; SHA-256 960b8d054eaf045e2d424eaf86787c1eb547c73dc7ed2d1c9525199d7e9240a1. Reverificado em 16/08/2026 no zip estabilizado (last-modified 16/08/2026 15:36:15 GMT, content-length 3755162, sha256 bda6d7a4ed6842e9...): segue 0 bens e 0 linhas mascaradas para o SQ.',
  'A2B-ausencias-oficiais-20260807',
  '2026-08-16T06:07:19.982513+00:00'::timestamptz
);

-- @write tabela=coleta_log ref=rollback:20260831215407 campos=fonte,escopo,alvo,candidato_id,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log
  (fonte, escopo, alvo, candidato_id, resultado, volume, detalhe, url, execucao)
SELECT
  'tse-patrimonio', 'candidato', 'elizeu-aguiar',
  '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid,
  'encontrado', 3,
  'Rollback 20260831215407: restaurados Elizeu SQ NULL, patrimonio R$ 872.808 e ausencia anterior de Dr. Luisinho',
  'https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2026.zip',
  'rollback:20260831215407'
WHERE NOT EXISTS (
  SELECT 1 FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio'
    AND alvo = 'elizeu-aguiar'
    AND execucao = 'rollback:20260831215407'
);

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260831215407';

DO $postcondition$
DECLARE
  target_count integer;
  rollback_receipt_count integer;
  dr_luisinho_absence_count integer;
  ledger_count integer;
BEGIN
  SELECT count(*) INTO target_count
  FROM public.candidatos c
  JOIN public.patrimonio p ON p.candidato_id = c.id AND p.ano_eleicao = 2026
  WHERE c.id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND c.slug = 'elizeu-aguiar'
    AND c.sq_candidato_2026 IS NULL
    AND p.valor_total = 872808.00
    AND jsonb_array_length(p.bens) = 3
    AND p.bens @> '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":82808}]'::jsonb
    AND p.fonte LIKE '%SQ 180002533958%';

  SELECT count(*) INTO rollback_receipt_count
  FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio'
    AND alvo = 'elizeu-aguiar'
    AND execucao = 'rollback:20260831215407';

  SELECT count(*) INTO dr_luisinho_absence_count
  FROM public.patrimonio_ausencia_oficial
  WHERE id = '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid
    AND candidato_id = 'c9c117e4-ea81-433d-b8c0-a01c8d831bae'::uuid
    AND ano_eleicao = 2026
    AND sq_candidato = '10002533539';

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260831215407';

  IF target_count <> 1 OR rollback_receipt_count <> 1 OR dr_luisinho_absence_count <> 1
     OR ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback elizeu patrimonio sq: postcondicao falhou';
  END IF;
END
$postcondition$;

COMMIT;
