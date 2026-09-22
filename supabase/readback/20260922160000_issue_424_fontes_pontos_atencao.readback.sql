DO $readback$
DECLARE
  total_count integer;
  marked_count integer;
  corrected_count integer;
  hidden_count integer;
BEGIN
  WITH target(id) AS (
    VALUES
      ('5405e80e-e8dc-4567-a5c3-bc2c166626b4'::uuid),
      ('1f4f9c74-e631-4624-94b5-98e32c9222b0'::uuid),
      ('3dcf38a7-96c0-4a1d-a43f-c841a662eb21'::uuid),
      ('3f0ed7d5-6677-4b33-af71-8228d6abef1f'::uuid),
      ('4e3563d8-f29f-4324-adc4-c4f3d9eace9b'::uuid),
      ('6a14a5bd-17c9-49d2-a17d-af6f87ba1c76'::uuid),
      ('7dee9d0a-c248-412f-b276-686ca4410747'::uuid),
      ('72d7742f-0281-4f98-aee1-f8bae33f5fca'::uuid),
      ('7430457c-3193-4fd8-8bbf-c8d054d1b1ff'::uuid),
      ('d472211d-710d-4807-9c0f-772b0f15e7a2'::uuid)
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_424_link_check_2026_09_22'
    ),
    count(*) FILTER (
      WHERE p.visivel = true
        AND p.dados_relacionados -> 'issue_424_link_check_2026_09_22' ->> 'acao' = 'fonte corrigida'
    ),
    count(*) FILTER (
      WHERE p.visivel = false
        AND p.despublicacao_motivo IS NOT NULL
        AND p.despublicado_em IS NOT NULL
        AND p.dados_relacionados -> 'issue_424_link_check_2026_09_22' ->> 'acao' = 'despublicado'
    )
  INTO total_count, marked_count, corrected_count, hidden_count
  FROM target t
  JOIN public.pontos_atencao p ON p.id = t.id;

  IF total_count <> 10
     OR marked_count <> 10
     OR corrected_count <> 7
     OR hidden_count <> 3 THEN
    RAISE EXCEPTION
      'issue #424: readback falhou (total=%, marcados=%, corrigidos=%, despublicados=%)',
      total_count, marked_count, corrected_count, hidden_count;
  END IF;
END
$readback$;
