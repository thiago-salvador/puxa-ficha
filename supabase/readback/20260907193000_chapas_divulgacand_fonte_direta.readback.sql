-- Readback estrutural da fonte DivulgaCand.
BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='chapas_2026' AND column_name IN ('fonte_tipo','fonte_detalhe'))<>2
     OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.chapas_2026'::regclass AND attname IN ('tse_situacao_titular_codigo','tse_situacao_vice_codigo') AND NOT attnotnull AND NOT attisdropped)<>2
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.chapas_2026'::regclass AND conname IN ('chapas_2026_check1','chapas_2026_fonte_legado_check','chapas_2026_fonte_detalhe_check') AND convalidated)<>3
     OR (SELECT count(*) FROM pg_index WHERE indrelid='public.chapas_2026'::regclass AND indexrelid::regclass::text IN ('chapas_2026_detalhe_titular_sq_uidx','chapas_2026_detalhe_vice_sq_uidx','chapas_2026_detalhe_candidato_uidx') AND indisvalid AND indisunique)<>3
     OR has_column_privilege('anon','public.chapas_2026','fonte_detalhe','SELECT')
     OR has_column_privilege('authenticated','public.chapas_2026','fonte_detalhe','SELECT') THEN
    RAISE EXCEPTION 'chapas fonte detalhada readback: estrutura/ACL divergiu';
  END IF;
END
$readback$;
COMMIT;
