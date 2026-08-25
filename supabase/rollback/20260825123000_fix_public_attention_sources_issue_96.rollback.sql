BEGIN;

DO $guard$
DECLARE
  marked_count integer;
  corrected_count integer;
  hidden_count integer;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (
      WHERE dados_relacionados -> 'issue_96_link_check_2026_08_25' ->> 'acao' = 'fonte corrigida'
    ),
    count(*) FILTER (
      WHERE dados_relacionados -> 'issue_96_link_check_2026_08_25' ->> 'acao' = 'despublicado'
    )
  INTO marked_count, corrected_count, hidden_count
  FROM public.pontos_atencao
  WHERE id IN (
    '337bc0e5-614c-433d-8da9-584e3fee29f7', '98d9c7c6-263f-45dd-9442-e568106bae7c',
    'a6efc579-1e51-4b2a-9f3e-38eb897183a8', '3c8cf652-37a7-499a-9b5e-cc095d413295',
    '8e8db2cc-7163-45ed-af6a-0909812f22ac', 'a48921e3-0988-4125-bb39-4ea2729a57a2',
    '8885902e-c940-44ef-ba04-515e24aaa9fe', 'a04dd437-74e9-45c8-95be-64ecc50e1cfc',
    '6452c61b-8632-44d4-be0f-c6e66f161681', 'f0922bdd-44f8-496d-8aa5-b6c899f72f99',
    '6c9a396b-49be-47bf-974f-8569d4d22986', '3ab64a77-24bd-4662-820f-eebc031b6467',
    '472db74b-8ed9-484a-95d1-2ea5949a6f80', '67f26e0e-7b2b-40a3-a0c0-b5c9509ae643',
    'e572f945-3e8d-4257-9309-c8d799ccc2c0'
  )
    AND coalesce(dados_relacionados, '{}'::jsonb) ? 'issue_96_link_check_2026_08_25';

  IF marked_count <> 15 OR corrected_count <> 10 OR hidden_count <> 5 THEN
    RAISE EXCEPTION
      'issue #96: rollback recusado (marcados=%, corrigidos=%, despublicados=%)',
      marked_count, corrected_count, hidden_count;
  END IF;
END
$guard$;

WITH target(id) AS (
  VALUES
    ('337bc0e5-614c-433d-8da9-584e3fee29f7'::uuid),
    ('98d9c7c6-263f-45dd-9442-e568106bae7c'::uuid),
    ('a6efc579-1e51-4b2a-9f3e-38eb897183a8'::uuid),
    ('3c8cf652-37a7-499a-9b5e-cc095d413295'::uuid),
    ('8e8db2cc-7163-45ed-af6a-0909812f22ac'::uuid),
    ('a48921e3-0988-4125-bb39-4ea2729a57a2'::uuid),
    ('8885902e-c940-44ef-ba04-515e24aaa9fe'::uuid),
    ('a04dd437-74e9-45c8-95be-64ecc50e1cfc'::uuid),
    ('6452c61b-8632-44d4-be0f-c6e66f161681'::uuid),
    ('f0922bdd-44f8-496d-8aa5-b6c899f72f99'::uuid),
    ('6c9a396b-49be-47bf-974f-8569d4d22986'::uuid),
    ('3ab64a77-24bd-4662-820f-eebc031b6467'::uuid),
    ('472db74b-8ed9-484a-95d1-2ea5949a6f80'::uuid),
    ('67f26e0e-7b2b-40a3-a0c0-b5c9509ae643'::uuid),
    ('e572f945-3e8d-4257-9309-c8d799ccc2c0'::uuid)
), restore AS (
  SELECT
    p.id,
    p.dados_relacionados -> 'issue_96_link_check_2026_08_25' AS snapshot
  FROM target t
  JOIN public.pontos_atencao p ON p.id = t.id
  WHERE coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_96_link_check_2026_08_25'
)
UPDATE public.pontos_atencao p
SET titulo = r.snapshot ->> 'titulo_anterior',
    descricao = r.snapshot ->> 'descricao_anterior',
    fontes = r.snapshot -> 'fontes_anteriores',
    visivel = CASE
      WHEN r.snapshot ? 'visivel_anterior' THEN (r.snapshot ->> 'visivel_anterior')::boolean
      ELSE p.visivel
    END,
    despublicacao_motivo = CASE
      WHEN r.snapshot ->> 'acao' = 'despublicado' THEN NULL
      ELSE p.despublicacao_motivo
    END,
    despublicado_em = CASE
      WHEN r.snapshot ->> 'acao' = 'despublicado' THEN NULL
      ELSE p.despublicado_em
    END,
    dados_relacionados = p.dados_relacionados - 'issue_96_link_check_2026_08_25'
FROM restore r
WHERE p.id = r.id;

DO $postcondition$
DECLARE
  restored_count integer;
BEGIN
  SELECT count(*) INTO restored_count
  FROM public.pontos_atencao
  WHERE id IN (
    '337bc0e5-614c-433d-8da9-584e3fee29f7', '98d9c7c6-263f-45dd-9442-e568106bae7c',
    'a6efc579-1e51-4b2a-9f3e-38eb897183a8', '3c8cf652-37a7-499a-9b5e-cc095d413295',
    '8e8db2cc-7163-45ed-af6a-0909812f22ac', 'a48921e3-0988-4125-bb39-4ea2729a57a2',
    '8885902e-c940-44ef-ba04-515e24aaa9fe', 'a04dd437-74e9-45c8-95be-64ecc50e1cfc',
    '6452c61b-8632-44d4-be0f-c6e66f161681', 'f0922bdd-44f8-496d-8aa5-b6c899f72f99',
    '6c9a396b-49be-47bf-974f-8569d4d22986', '3ab64a77-24bd-4662-820f-eebc031b6467',
    '472db74b-8ed9-484a-95d1-2ea5949a6f80', '67f26e0e-7b2b-40a3-a0c0-b5c9509ae643',
    'e572f945-3e8d-4257-9309-c8d799ccc2c0'
  )
    AND visivel = true
    AND NOT coalesce(dados_relacionados, '{}'::jsonb) ? 'issue_96_link_check_2026_08_25';

  IF restored_count <> 15 THEN
    RAISE EXCEPTION 'issue #96: rollback incompleto (restaurados=%)', restored_count;
  END IF;
END
$postcondition$;

COMMIT;
