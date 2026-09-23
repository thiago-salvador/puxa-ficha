BEGIN;

DO $rollback$
BEGIN
  IF EXISTS (SELECT 1 FROM public.candidatos_roster_2026 LIMIT 1) THEN
    RAISE EXCEPTION 'roster 2026: rollback requer tabela vazia';
  END IF;
END $rollback$;

DROP VIEW public.candidatos_roster_2026_publico;
DROP TABLE public.candidatos_roster_2026;

COMMIT;
