-- Rollback estrutural DivulgaCand somente antes da admissão. O rollback de dados preserva
-- a chapa direta despublicada; depois dele esta reversão recusa, sem deletá-la.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.chapas_2026 IN ACCESS EXCLUSIVE MODE;
DO $rollback$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chapas_2026 WHERE fonte_tipo<>'legado') THEN
    RAISE EXCEPTION 'chapas fonte detalhada rollback: linhas diretas preservadas impedem remoção estrutural';
  END IF;
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260907193000' THEN
    RAISE EXCEPTION 'chapas fonte detalhada rollback: ledger divergiu';
  END IF;
  ALTER TABLE public.chapas_2026 DROP CONSTRAINT chapas_2026_fonte_detalhe_check;
  ALTER TABLE public.chapas_2026 DROP CONSTRAINT chapas_2026_fonte_legado_check;
  ALTER TABLE public.chapas_2026 DROP CONSTRAINT chapas_2026_check1;
  DROP INDEX public.chapas_2026_detalhe_titular_sq_uidx;
  DROP INDEX public.chapas_2026_detalhe_vice_sq_uidx;
  DROP INDEX public.chapas_2026_detalhe_candidato_uidx;
  ALTER TABLE public.chapas_2026 ALTER COLUMN tse_situacao_titular_codigo SET NOT NULL;
  ALTER TABLE public.chapas_2026 ALTER COLUMN tse_situacao_vice_codigo SET NOT NULL;
  ALTER TABLE public.chapas_2026 DROP COLUMN fonte_detalhe;
  ALTER TABLE public.chapas_2026 DROP COLUMN fonte_tipo;
  ALTER TABLE public.chapas_2026 ADD CONSTRAINT chapas_2026_check1 CHECK (
    (identidade_status='confirmada' AND sq_coligacao IS NOT NULL) OR identidade_status='duplicidade_oficial'
  );
  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260907193000';
END
$rollback$;
COMMIT;
