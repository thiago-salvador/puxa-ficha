-- Reverte somente a remediacao ACL das funcoes, antes da carga 121000.
DO $guard$
DECLARE
  v_ledger_120000 integer;
  v_ledger_120500 integer;
  v_ledger_120600 integer;
  v_ledger_121000 integer;
  v_rows integer;
  v_acl_invalidos integer;
BEGIN
  SELECT count(*) INTO v_ledger_120000
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810120000';
  SELECT count(*) INTO v_ledger_120500
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810120500';
  SELECT count(*) INTO v_ledger_120600
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810120600';
  SELECT count(*) INTO v_ledger_121000
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810121000';
  SELECT count(*) INTO v_rows FROM public.financiamento_verificacoes;

  IF v_ledger_120000 <> 1 OR v_ledger_120500 <> 1
     OR v_ledger_120600 <> 1 OR v_ledger_121000 <> 0 OR v_rows <> 0 THEN
    RAISE EXCEPTION
      'rollback 20260810120600: ledger/ordem/dados invalidos: 120000=% 120500=% 120600=% 121000=% rows=%',
      v_ledger_120000, v_ledger_120500, v_ledger_120600, v_ledger_121000, v_rows;
  END IF;

  WITH atual AS (
    SELECT p.proname, p.proowner, x.grantor, x.grantee,
           x.privilege_type, x.is_grantable
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'financiamento_publicado_recusa_verificacao',
         'financiamento_verificacao_recusa_publicado'
       )
  ), por_funcao AS (
    SELECT proname,
           count(*) FILTER (
             WHERE grantor IS DISTINCT FROM proowner
                OR grantee NOT IN (0::oid, proowner)
                OR privilege_type <> 'EXECUTE'
                OR is_grantable
           ) + abs(count(*) - 2) AS invalidos
      FROM atual
     GROUP BY proname
  )
  SELECT coalesce(sum(invalidos), 0) + abs(count(*) - 2)
    INTO v_acl_invalidos
    FROM por_funcao;

  IF v_acl_invalidos <> 0 THEN
    RAISE EXCEPTION
      'rollback 20260810120600: ACL atual das funcoes divergiu: invalidos=%',
      v_acl_invalidos;
  END IF;
END
$guard$;

GRANT EXECUTE ON FUNCTION public.financiamento_publicado_recusa_verificacao()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.financiamento_verificacao_recusa_publicado()
  TO anon, authenticated, service_role;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260810120600';

DO $postcondition$
DECLARE
  v_ledger integer;
  v_acl_invalidos integer;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810120600';

  WITH atual AS (
    SELECT p.proname, p.proowner, x.grantor, x.grantee,
           x.privilege_type, x.is_grantable
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'financiamento_publicado_recusa_verificacao',
         'financiamento_verificacao_recusa_publicado'
       )
  ), por_funcao AS (
    SELECT proname,
           count(*) FILTER (
             WHERE grantor IS DISTINCT FROM proowner
                OR grantee NOT IN (
                  0::oid,
                  proowner,
                  (SELECT oid FROM pg_roles WHERE rolname = 'anon'),
                  (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'),
                  (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
                )
                OR privilege_type <> 'EXECUTE'
                OR is_grantable
           ) + abs(count(*) - 5) AS invalidos
      FROM atual
     GROUP BY proname
  )
  SELECT coalesce(sum(invalidos), 0) + abs(count(*) - 2)
    INTO v_acl_invalidos
    FROM por_funcao;

  IF v_ledger <> 0 OR v_acl_invalidos <> 0 THEN
    RAISE EXCEPTION
      'rollback 20260810120600: pos-condicao falhou: ledger=% acl_invalidos=%',
      v_ledger, v_acl_invalidos;
  END IF;
END
$postcondition$;
