BEGIN;

DO $$
DECLARE
  candidate_exists boolean;
  current_registration jsonb;
  original_registration constant jsonb := jsonb_build_object(
    'fonte', 'TSE DivulgaCand 2026',
    'verificado_em', '2026-08-16T18:02:07.454221+00:00'
  );
  expected_registration constant jsonb := original_registration ||
    jsonb_build_object('estado', 'publicado');
BEGIN
  PERFORM set_config('pf.candidate_registration_state_apply', 'false', true);

  SELECT true, verificacao_campos -> 'candidate_registration'
  INTO candidate_exists, current_registration
  FROM public.candidatos
  WHERE slug = 'pablo-marcal';

  IF candidate_exists IS NULL THEN
    RAISE NOTICE 'replay sem a ficha pablo-marcal; correção de procedência ignorada';
    RETURN;
  END IF;

  IF current_registration IS DISTINCT FROM original_registration
    AND current_registration IS DISTINCT FROM expected_registration THEN
    RAISE EXCEPTION
      'pre-condição: candidate_registration de pablo-marcal divergiu do estado auditado';
  END IF;

  PERFORM set_config('pf.candidate_registration_state_apply', 'true', true);
END $$;

-- A migration 30000 preservou corretamente fonte e data anteriores, mas a
-- precedência do merge JSON também preservou a ausência do estado estruturado.
-- @write tabela=candidatos slug=pablo-marcal campos=verificacao_campos
UPDATE public.candidatos
SET verificacao_campos = jsonb_set(
      verificacao_campos,
      '{candidate_registration,estado}',
      to_jsonb('publicado'::text),
      true
    )
WHERE slug = 'pablo-marcal'
  AND current_setting('pf.candidate_registration_state_apply', true) = 'true'
  AND NOT (verificacao_campos -> 'candidate_registration' ? 'estado');

DO $$
BEGIN
  IF current_setting('pf.candidate_registration_state_apply', true)
    IS DISTINCT FROM 'true' THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.candidatos
    WHERE slug = 'pablo-marcal'
      AND jsonb_typeof(verificacao_campos -> 'candidate_registration') = 'object'
      AND verificacao_campos -> 'candidate_registration' ->> 'fonte' =
        'TSE DivulgaCand 2026'
      AND verificacao_campos -> 'candidate_registration' ->> 'estado' =
        'publicado'
      AND verificacao_campos -> 'candidate_registration' ->> 'verificado_em' =
        '2026-08-16T18:02:07.454221+00:00'
  ) THEN
    RAISE EXCEPTION
      'candidate_registration de pablo-marcal não ficou estruturado';
  END IF;
END $$;

COMMIT;
