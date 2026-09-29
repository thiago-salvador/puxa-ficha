BEGIN READ ONLY;
DO $readback$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927095347') <> 1 THEN
    RAISE EXCEPTION 'patrimonio CAS readback: ledger ausente ou duplicado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.patrimonio'::regclass AND a.attname = 'bens_hash'
      AND NOT a.attisdropped AND a.atttypid = 'text'::regtype AND a.attgenerated = 's'
      AND regexp_replace(pg_get_expr(d.adbin, d.adrelid), '[()[:space:]]', '', 'g') =
          'md5COALESCEbens::text,''null''::text'
  ) THEN
    RAISE EXCEPTION 'patrimonio CAS readback: hash ou expressão gerada divergente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patrimonio_publico' AND column_name = 'bens_hash'
  ) OR has_column_privilege('anon', 'public.patrimonio', 'bens_hash', 'SELECT')
     OR has_column_privilege('authenticated', 'public.patrimonio', 'bens_hash', 'SELECT') THEN
    RAISE EXCEPTION 'patrimonio CAS readback: hash exposto publicamente';
  END IF;
  IF EXISTS (SELECT 1 FROM public.patrimonio
             WHERE bens_hash IS NULL OR bens_hash IS DISTINCT FROM md5(COALESCE(bens::text, 'null'))) THEN
    RAISE EXCEPTION 'patrimonio CAS readback: hash nulo ou incorreto';
  END IF;
END
$readback$;
COMMIT;
