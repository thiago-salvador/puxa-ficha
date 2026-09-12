BEGIN READ ONLY;
DO $readback$ BEGIN
  IF NOT has_column_privilege('anon', 'public.chapas_2026', 'titular_sq_candidato', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.chapas_2026', 'vice_sq_candidato', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.chapas_2026', 'vice_situacao_divulgacand', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.chapas_2026', 'titular_sq_candidato', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.chapas_2026', 'vice_sq_candidato', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.chapas_2026', 'vice_situacao_divulgacand', 'SELECT')
  THEN RAISE EXCEPTION 'chapas public grants: column privileges missing'; END IF;
  IF has_column_privilege('anon', 'public.chapas_2026', 'alternativas_oficiais', 'SELECT')
     OR has_column_privilege('anon', 'public.chapas_2026', 'sq_coligacao', 'SELECT')
  THEN RAISE EXCEPTION 'chapas public grants: private columns exposed'; END IF;
END $readback$;
COMMIT;
