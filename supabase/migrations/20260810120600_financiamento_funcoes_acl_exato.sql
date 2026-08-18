-- Normaliza os grants automaticos que o Supabase acrescentou as duas funcoes
-- de trigger da 20260810120000. As migrations ja aplicadas permanecem imutaveis.
DO $guard$
DECLARE
  v_ledger_120000 integer;
  v_ledger_120500 integer;
  v_ledger_120600 integer;
  v_ledger_121000 integer;
  v_schema_replay boolean := false;
  v_rows integer;
  v_acl_automatico_invalidos integer;
  v_acl_exato_invalidos integer;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    v_schema_replay := true;
  ELSE
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

    IF v_ledger_120000 <> 1 OR v_ledger_120500 <> 1
       OR v_ledger_120600 <> 0 OR v_ledger_121000 <> 0 THEN
      RAISE EXCEPTION
        '20260810120600: ordem/ledger invalido: 120000=% 120500=% 120600=% 121000=%',
        v_ledger_120000, v_ledger_120500, v_ledger_120600, v_ledger_121000;
    END IF;
  END IF;

  IF to_regprocedure('public.financiamento_publicado_recusa_verificacao()') IS NULL
     OR to_regprocedure('public.financiamento_verificacao_recusa_publicado()') IS NULL THEN
    RAISE EXCEPTION '20260810120600: funcoes da 120000 ausentes';
  END IF;

  SELECT count(*) INTO v_rows FROM public.financiamento_verificacoes;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION '20260810120600: tabela ja contem % linhas', v_rows;
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
    INTO v_acl_automatico_invalidos
    FROM por_funcao;

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
    INTO v_acl_exato_invalidos
    FROM por_funcao;

  IF (v_schema_replay AND v_acl_exato_invalidos <> 0)
     OR (NOT v_schema_replay AND v_acl_automatico_invalidos <> 0) THEN
    RAISE EXCEPTION
      '20260810120600: pre-estado ACL das funcoes divergiu: automatico_invalidos=% exato_invalidos=%',
      v_acl_automatico_invalidos, v_acl_exato_invalidos;
  END IF;
END
$guard$;

REVOKE EXECUTE ON FUNCTION public.financiamento_publicado_recusa_verificacao()
  FROM anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.financiamento_verificacao_recusa_publicado()
  FROM anon, authenticated, service_role;

DO $postcondition$
DECLARE
  v_acl_invalidos integer;
BEGIN
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
      '20260810120600: pos-condicao ACL das funcoes falhou: invalidos=%',
      v_acl_invalidos;
  END IF;
END
$postcondition$;
