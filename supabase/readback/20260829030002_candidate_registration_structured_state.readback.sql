DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.candidatos
    WHERE slug = 'pablo-marcal'
      AND jsonb_typeof(verificacao_campos -> 'candidate_registration') = 'object'
      AND verificacao_campos -> 'candidate_registration' ->> 'fonte' =
        'TSE DivulgaCand 2026'
      AND verificacao_campos -> 'candidate_registration' ->> 'estado' =
        'publicado'
      AND verificacao_campos -> 'candidate_registration' ->> 'verificado_em' =
        '2026-08-16T18:02:07.454221+00:00'
  ) <> 1 THEN
    RAISE EXCEPTION
      'readback 30002: candidate_registration de pablo-marcal divergiu';
  END IF;
END $$;
