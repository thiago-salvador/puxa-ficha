BEGIN;

DO $$
DECLARE
  current_registration jsonb;
  expected_registration constant jsonb := jsonb_build_object(
    'fonte', 'TSE DivulgaCand 2026',
    'estado', 'publicado',
    'verificado_em', '2026-08-16T18:02:07.454221+00:00'
  );
BEGIN
  SELECT verificacao_campos -> 'candidate_registration'
  INTO current_registration
  FROM public.candidatos
  WHERE slug = 'pablo-marcal'
  FOR UPDATE;

  IF NOT FOUND OR current_registration <> expected_registration THEN
    RAISE EXCEPTION
      'rollback recusado: candidate_registration de pablo-marcal divergiu da forward 30002';
  END IF;
END $$;

-- @write tabela=candidatos slug=pablo-marcal campos=verificacao_campos
UPDATE public.candidatos
SET verificacao_campos = jsonb_set(
      verificacao_campos,
      '{candidate_registration}',
      (verificacao_campos -> 'candidate_registration') - 'estado',
      false
    )
WHERE slug = 'pablo-marcal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.candidatos
    WHERE slug = 'pablo-marcal'
      AND verificacao_campos -> 'candidate_registration' = jsonb_build_object(
        'fonte', 'TSE DivulgaCand 2026',
        'verificado_em', '2026-08-16T18:02:07.454221+00:00'
      )
  ) THEN
    RAISE EXCEPTION 'rollback 30002: estado anterior não foi restaurado';
  END IF;
END $$;

COMMIT;
