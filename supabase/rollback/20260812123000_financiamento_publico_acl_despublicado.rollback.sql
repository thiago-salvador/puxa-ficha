-- Reverte somente os grants de coluna adicionados pela 20260812123000.
DO $guard$
DECLARE
  v_tem_categorias boolean;
  v_acl_atual integer;
  v_acl_esperado integer;
  v_acl_diferencas integer;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260812123000') <> 1
     OR (SELECT max(version) FROM supabase_migrations.schema_migrations) <> '20260812123000' THEN
    RAISE EXCEPTION 'rollback 20260812123000: ledger/topo invalido';
  END IF;

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
     OR has_table_privilege('authenticated', 'public.financiamento', 'SELECT') THEN
    RAISE EXCEPTION
      'rollback 20260812123000: ACL atual divergiu: atual=% esperado=% diferencas=%',
      v_acl_atual, v_acl_esperado, v_acl_diferencas;
  END IF;
END
$guard$;

REVOKE SELECT (despublicado_em) ON public.financiamento FROM anon, authenticated;

DO $revoke_optional$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'financiamento'
       AND column_name = 'categorias_origem'
  ) THEN
    EXECUTE 'REVOKE SELECT (categorias_origem) ON public.financiamento FROM anon, authenticated';
  END IF;
END
$revoke_optional$;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260812123000';

DO $postcondition$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260812123000') <> 0
     OR has_column_privilege('anon', 'public.financiamento', 'despublicado_em', 'SELECT')
     OR has_column_privilege('authenticated', 'public.financiamento', 'despublicado_em', 'SELECT')
     OR has_table_privilege('anon', 'public.financiamento', 'SELECT')
     OR has_table_privilege('authenticated', 'public.financiamento', 'SELECT') THEN
    RAISE EXCEPTION 'rollback 20260812123000: pos-condicao falhou';
  END IF;
END
$postcondition$;
