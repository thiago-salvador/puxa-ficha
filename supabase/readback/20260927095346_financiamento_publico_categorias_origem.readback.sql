BEGIN READ ONLY;
DO $readback$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260927095346') <> 1 THEN
    RAISE EXCEPTION 'financiamento categorias readback: ledger ausente ou duplicado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.financiamento'::regclass AND attname = 'categorias_origem'
      AND NOT attisdropped AND atttypid = 'jsonb'::regtype AND attgenerated = ''
  ) THEN
    RAISE EXCEPTION 'financiamento categorias readback: coluna jsonb divergente';
  END IF;
  IF (SELECT count(*) FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = 'public.financiamento'::regclass AND NOT a.attisdropped
        AND a.atttypid = 'text'::regtype AND a.attgenerated = 's'
        AND ((a.attname = 'maiores_doadores_hash' AND
              regexp_replace(pg_get_expr(d.adbin, d.adrelid), '[()[:space:]]', '', 'g') = 'md5COALESCEmaiores_doadores::text,''sql-null:''::text')
          OR (a.attname = 'categorias_origem_hash' AND
              regexp_replace(pg_get_expr(d.adbin, d.adrelid), '[()[:space:]]', '', 'g') = 'md5COALESCEcategorias_origem::text,''sql-null:''::text'))
  ) <> 2 THEN
    RAISE EXCEPTION 'financiamento categorias readback: hash ou expressão gerada divergente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'financiamento_publico'
      AND column_name = 'categorias_origem' AND data_type = 'jsonb'
  ) OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'financiamento_publico'
      AND column_name IN ('maiores_doadores_hash', 'categorias_origem_hash', 'bens_hash')
  ) THEN
    RAISE EXCEPTION 'financiamento categorias readback: projeção pública divergente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.financiamento_publico'::regclass AND reloptions @> ARRAY['security_invoker=true']
  ) OR position('categorias_origem,' IN pg_get_viewdef('public.financiamento_publico'::regclass, true)) = 0
    OR position('NULL::jsonb AS categorias_origem' IN pg_get_viewdef('public.financiamento_publico'::regclass, true)) <> 0 THEN
    RAISE EXCEPTION 'financiamento categorias readback: view não projeta a coluna base com security_invoker';
  END IF;
  IF NOT has_table_privilege('anon', 'public.financiamento_publico', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.financiamento_publico', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.financiamento', 'categorias_origem', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.financiamento', 'categorias_origem', 'SELECT')
     OR has_column_privilege('anon', 'public.financiamento', 'maiores_doadores_hash', 'SELECT')
     OR has_column_privilege('anon', 'public.financiamento', 'categorias_origem_hash', 'SELECT')
     OR has_column_privilege('authenticated', 'public.financiamento', 'maiores_doadores_hash', 'SELECT')
     OR has_column_privilege('authenticated', 'public.financiamento', 'categorias_origem_hash', 'SELECT') THEN
    RAISE EXCEPTION 'financiamento categorias readback: grants públicos divergentes';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financiamento
             WHERE maiores_doadores_hash IS NULL OR categorias_origem_hash IS NULL
                OR maiores_doadores_hash IS DISTINCT FROM md5(COALESCE(maiores_doadores::text, 'sql-null:'))
                OR categorias_origem_hash IS DISTINCT FROM md5(COALESCE(categorias_origem::text, 'sql-null:'))) THEN
    RAISE EXCEPTION 'financiamento categorias readback: hash nulo ou incorreto';
  END IF;
END
$readback$;
COMMIT;
