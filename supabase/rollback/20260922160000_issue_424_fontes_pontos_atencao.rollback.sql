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
      WHERE dados_relacionados -> 'issue_424_link_check_2026_09_22' ->> 'acao' = 'fonte corrigida'
    ),
    count(*) FILTER (
      WHERE dados_relacionados -> 'issue_424_link_check_2026_09_22' ->> 'acao' = 'despublicado'
    )
  INTO marked_count, corrected_count, hidden_count
  FROM public.pontos_atencao
  WHERE id IN (
    '5405e80e-e8dc-4567-a5c3-bc2c166626b4', '1f4f9c74-e631-4624-94b5-98e32c9222b0',
    '3dcf38a7-96c0-4a1d-a43f-c841a662eb21', '3f0ed7d5-6677-4b33-af71-8228d6abef1f',
    '4e3563d8-f29f-4324-adc4-c4f3d9eace9b', '6a14a5bd-17c9-49d2-a17d-af6f87ba1c76',
    '7dee9d0a-c248-412f-b276-686ca4410747',
    '72d7742f-0281-4f98-aee1-f8bae33f5fca', '7430457c-3193-4fd8-8bbf-c8d054d1b1ff',
    'd472211d-710d-4807-9c0f-772b0f15e7a2'
  )
    AND coalesce(dados_relacionados, '{}'::jsonb) ? 'issue_424_link_check_2026_09_22';

  IF marked_count <> 10 OR corrected_count <> 9 OR hidden_count <> 1 THEN
    RAISE EXCEPTION
      'issue #424: rollback recusado (marcados=%, corrigidos=%, despublicados=%)',
      marked_count, corrected_count, hidden_count;
  END IF;
END
$guard$;

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
), restore AS (
  SELECT
    p.id,
    p.dados_relacionados -> 'issue_424_link_check_2026_09_22' AS snapshot
  FROM target t
  JOIN public.pontos_atencao p ON p.id = t.id
  WHERE coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_424_link_check_2026_09_22'
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
    dados_relacionados = p.dados_relacionados - 'issue_424_link_check_2026_09_22'
FROM restore r
WHERE p.id = r.id;

DO $postcondition$
DECLARE
  restored_count integer;
BEGIN
  SELECT count(*) INTO restored_count
  FROM public.pontos_atencao
  WHERE id IN (
    '5405e80e-e8dc-4567-a5c3-bc2c166626b4', '1f4f9c74-e631-4624-94b5-98e32c9222b0',
    '3dcf38a7-96c0-4a1d-a43f-c841a662eb21', '3f0ed7d5-6677-4b33-af71-8228d6abef1f',
    '4e3563d8-f29f-4324-adc4-c4f3d9eace9b', '6a14a5bd-17c9-49d2-a17d-af6f87ba1c76',
    '7dee9d0a-c248-412f-b276-686ca4410747',
    '72d7742f-0281-4f98-aee1-f8bae33f5fca', '7430457c-3193-4fd8-8bbf-c8d054d1b1ff',
    'd472211d-710d-4807-9c0f-772b0f15e7a2'
  )
    AND visivel = true
    AND NOT coalesce(dados_relacionados, '{}'::jsonb) ? 'issue_424_link_check_2026_09_22';

  IF restored_count <> 10 THEN
    RAISE EXCEPTION 'issue #424: rollback incompleto (restaurados=%)', restored_count;
  END IF;
END
$postcondition$;

COMMIT;
