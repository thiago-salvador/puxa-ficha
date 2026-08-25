DO $readback$
DECLARE
  total_count integer;
  marked_count integer;
  corrected_count integer;
  hidden_count integer;
BEGIN
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
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_96_link_check_2026_08_25'
    ),
    count(*) FILTER (
      WHERE p.visivel = true
        AND p.dados_relacionados -> 'issue_96_link_check_2026_08_25' ->> 'acao' = 'fonte corrigida'
    ),
    count(*) FILTER (
      WHERE p.visivel = false
        AND p.despublicacao_motivo IS NOT NULL
        AND p.despublicado_em IS NOT NULL
        AND p.dados_relacionados -> 'issue_96_link_check_2026_08_25' ->> 'acao' = 'despublicado'
    )
  INTO total_count, marked_count, corrected_count, hidden_count
  FROM target t
  JOIN public.pontos_atencao p ON p.id = t.id;

  IF total_count <> 15
     OR marked_count <> 15
     OR corrected_count <> 10
     OR hidden_count <> 5 THEN
    RAISE EXCEPTION
      'issue #96: readback falhou (total=%, marcados=%, corrigidos=%, despublicados=%)',
      total_count, marked_count, corrected_count, hidden_count;
  END IF;
END
$readback$;
