-- Restaura o contrato publico da view security_invoker depois que a 102000
-- passou a filtrar financiamento.despublicado_em. A tabela bruta continua sem
-- SELECT de tabela e sem acesso a colunas sensiveis.
DO $guard$
DECLARE
  v_schema_replay boolean := false;
  v_ledger_102000 integer;
  v_ledger_102100 integer;
  v_ledger_atual integer;
  v_ledger_top text;
  v_tem_categorias boolean;
  v_acl_atual integer;
  v_acl_esperado integer;
  v_acl_diferencas integer;
  v_view_def text;
  v_security_invoker boolean;
BEGIN
  IF to_regclass('public.financiamento') IS NULL
     OR to_regclass('public.financiamento_publico') IS NULL THEN
    RAISE EXCEPTION '20260812123000: contrato de financiamento ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'financiamento'
       AND column_name = 'despublicado_em'
  ) THEN
    RAISE EXCEPTION '20260812123000: coluna financiamento.despublicado_em ausente';
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    v_schema_replay := true;
  ELSE
    SELECT count(*) INTO v_ledger_102000
      FROM supabase_migrations.schema_migrations
     WHERE version = '20260811102000';
    SELECT count(*) INTO v_ledger_102100
      FROM supabase_migrations.schema_migrations
     WHERE version = '20260811102100';
    SELECT count(*) INTO v_ledger_atual
      FROM supabase_migrations.schema_migrations
     WHERE version = '20260812123000';
    SELECT max(version) INTO v_ledger_top
      FROM supabase_migrations.schema_migrations;

    IF v_ledger_102000 <> 1 OR v_ledger_102100 <> 1
       OR v_ledger_atual <> 0 OR v_ledger_top <> '20260811102100' THEN
      RAISE EXCEPTION
        '20260812123000: ordem/ledger invalido: 102000=% 102100=% atual=% topo=%',
        v_ledger_102000, v_ledger_102100, v_ledger_atual, v_ledger_top;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'financiamento'
       AND column_name = 'categorias_origem'
  ) INTO v_tem_categorias;

  SELECT pg_get_viewdef('public.financiamento_publico'::regclass, true)
    INTO v_view_def;
  SELECT coalesce(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']
    INTO v_security_invoker
    FROM pg_class c
   WHERE c.oid = 'public.financiamento_publico'::regclass;

  IF NOT v_security_invoker
     OR v_view_def NOT ILIKE '%despublicado_em IS NULL%'
     OR NOT has_table_privilege('anon', 'public.financiamento_publico', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.financiamento_publico', 'SELECT')
     OR has_table_privilege('anon', 'public.financiamento', 'SELECT')
     OR has_table_privilege('authenticated', 'public.financiamento', 'SELECT')
     OR has_column_privilege('anon', 'public.financiamento', 'despublicado_em', 'SELECT')
     OR has_column_privilege('authenticated', 'public.financiamento', 'despublicado_em', 'SELECT') THEN
    RAISE EXCEPTION '20260812123000: pre-estado da view ou ACL divergiu';
  END IF;

  IF v_tem_categorias AND (
    has_column_privilege('anon', 'public.financiamento', 'categorias_origem', 'SELECT')
    OR has_column_privilege('authenticated', 'public.financiamento', 'categorias_origem', 'SELECT')
  ) THEN
    RAISE EXCEPTION '20260812123000: categorias_origem ja possui grant inesperado';
  END IF;

  WITH expected(grantee, column_name) AS (
    SELECT role_name, column_name
      FROM unnest(ARRAY['anon', 'authenticated']) role_name
      CROSS JOIN unnest(ARRAY[
        'id', 'candidato_id', 'ano_eleicao', 'total_arrecadado',
        'total_fundo_partidario', 'total_fundo_eleitoral', 'total_pessoa_fisica',
        'total_recursos_proprios', 'maiores_doadores_publicos', 'fonte', 'created_at'
      ]) column_name
  ), actual AS (
    SELECT grantee, column_name
      FROM information_schema.column_privileges
     WHERE table_schema = 'public'
       AND table_name = 'financiamento'
       AND privilege_type = 'SELECT'
       AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ), diffs AS (
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  )
  SELECT (SELECT count(*) FROM actual),
         (SELECT count(*) FROM expected),
         (SELECT count(*) FROM diffs)
    INTO v_acl_atual, v_acl_esperado, v_acl_diferencas;

  IF v_acl_atual <> v_acl_esperado OR v_acl_diferencas <> 0 THEN
    RAISE EXCEPTION
      '20260812123000: ACL de colunas anterior divergiu: atual=% esperado=% diferencas=% replay=%',
      v_acl_atual, v_acl_esperado, v_acl_diferencas, v_schema_replay;
  END IF;
END
$guard$;

GRANT SELECT (despublicado_em) ON public.financiamento TO anon, authenticated;

DO $grant_optional$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'financiamento'
       AND column_name = 'categorias_origem'
  ) THEN
    EXECUTE 'GRANT SELECT (categorias_origem) ON public.financiamento TO anon, authenticated';
  END IF;
END
$grant_optional$;

DO $postcondition$
DECLARE
  v_tem_categorias boolean;
  v_acl_atual integer;
  v_acl_esperado integer;
  v_acl_diferencas integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'financiamento'
       AND column_name = 'categorias_origem'
  ) INTO v_tem_categorias;

  WITH expected(grantee, column_name) AS (
    SELECT role_name, column_name
      FROM unnest(ARRAY['anon', 'authenticated']) role_name
      CROSS JOIN unnest(
        ARRAY[
          'id', 'candidato_id', 'ano_eleicao', 'total_arrecadado',
          'total_fundo_partidario', 'total_fundo_eleitoral', 'total_pessoa_fisica',
          'total_recursos_proprios', 'maiores_doadores_publicos', 'fonte', 'created_at',
          'despublicado_em'
        ] || CASE WHEN v_tem_categorias THEN ARRAY['categorias_origem'] ELSE ARRAY[]::text[] END
      ) column_name
  ), actual AS (
    SELECT grantee, column_name
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'financiamento'
       AND privilege_type = 'SELECT'
       AND grantee IN ('PUBLIC', 'anon', 'authenticated')
  ), diffs AS (
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    UNION ALL
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
  )
  SELECT (SELECT count(*) FROM actual),
         (SELECT count(*) FROM expected),
         (SELECT count(*) FROM diffs)
    INTO v_acl_atual, v_acl_esperado, v_acl_diferencas;

  IF v_acl_atual <> v_acl_esperado OR v_acl_diferencas <> 0
     OR has_table_privilege('anon', 'public.financiamento', 'SELECT')
     OR has_table_privilege('authenticated', 'public.financiamento', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.financiamento', 'despublicado_em', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.financiamento', 'despublicado_em', 'SELECT') THEN
    RAISE EXCEPTION
      '20260812123000: pos-condicao ACL falhou: atual=% esperado=% diferencas=%',
      v_acl_atual, v_acl_esperado, v_acl_diferencas;
  END IF;
END
$postcondition$;
