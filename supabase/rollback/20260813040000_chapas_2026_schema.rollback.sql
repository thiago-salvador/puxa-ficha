-- Rollback do schema; exige que a carga 20260813040100 já tenha sido desfeita.
DO $$ BEGIN
  IF (SELECT count(*) FROM public.chapas_2026) <> 0 THEN
    RAISE EXCEPTION 'rollback de schema recusado: chapas_2026 ainda contém dados';
  END IF;
END $$;
DROP VIEW public.chapas_2026_publico;
DROP TABLE public.chapas_2026;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260813040000';
