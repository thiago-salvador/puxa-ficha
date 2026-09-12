BEGIN READ ONLY;
DO $readback$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.chapas_2026'::regclass AND conname='chapas_2026_vice_situacao_divulgacand_check' AND convalidated)
OR (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='chapas_2026_publico' AND column_name IN ('titular_sq_candidato','vice_sq_candidato','vice_situacao_divulgacand'))<>3
OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.chapas_2026_publico'::regclass AND reloptions @> ARRAY['security_invoker=true'])
THEN RAISE EXCEPTION 'vice schema: readback divergiu'; END IF;
END $readback$;
COMMIT;
