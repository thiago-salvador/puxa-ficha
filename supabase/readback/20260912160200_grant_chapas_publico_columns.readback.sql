BEGIN READ ONLY;
SET LOCAL ROLE anon;
SELECT chave, titular_sq_candidato, vice_sq_candidato, vice_situacao_divulgacand
  FROM public.chapas_2026_publico
 WHERE uf = 'RR' AND vice_nome_urna = 'JOTA RODRIGUES';
DO $anon_rr$ BEGIN
  IF (SELECT count(*) FROM public.chapas_2026_publico WHERE uf='RR' AND vice_sq_candidato='230002554442' AND vice_situacao_divulgacand->>'status'='inapto') <> 1
  THEN RAISE EXCEPTION 'chapas public grants: anon RR readback divergiu'; END IF;
END $anon_rr$;
DO $anon_private$ BEGIN
  BEGIN
    PERFORM alternativas_oficiais FROM public.chapas_2026 LIMIT 1;
    RAISE EXCEPTION 'chapas public grants: anon private read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $anon_private$;
SET LOCAL ROLE authenticated;
SELECT chave, titular_sq_candidato, vice_sq_candidato, vice_situacao_divulgacand
  FROM public.chapas_2026_publico
 WHERE uf = 'RR' AND vice_nome_urna = 'JOTA RODRIGUES';
DO $authenticated_rr$ BEGIN
  IF (SELECT count(*) FROM public.chapas_2026_publico WHERE uf='RR' AND vice_sq_candidato='230002554442' AND vice_situacao_divulgacand->>'status'='inapto') <> 1
  THEN RAISE EXCEPTION 'chapas public grants: authenticated RR readback divergiu'; END IF;
END $authenticated_rr$;
DO $authenticated_private$ BEGIN
  BEGIN
    PERFORM alternativas_oficiais FROM public.chapas_2026 LIMIT 1;
    RAISE EXCEPTION 'chapas public grants: authenticated private read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $authenticated_private$;
RESET ROLE;
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
