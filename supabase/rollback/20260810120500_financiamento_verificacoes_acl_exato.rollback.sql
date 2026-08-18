-- Reverte somente a remediacao ACL. Permitido apenas antes da carga 121000.
DO $guard$
DECLARE
  v_ledger_120500 integer;
  v_ledger_121000 integer;
  v_rows integer;
  v_acl_invalidos integer;
  v_acl_colunas integer;
BEGIN
  SELECT count(*) INTO v_ledger_120500
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810120500';
  SELECT count(*) INTO v_ledger_121000
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810121000';
  SELECT count(*) INTO v_rows FROM public.financiamento_verificacoes;

  IF v_ledger_120500 <> 1 OR v_ledger_121000 <> 0 OR v_rows <> 0 THEN
    RAISE EXCEPTION
      'rollback 20260810120500: ledger/ordem/dados invalidos: 120500=% 121000=% rows=%',
      v_ledger_120500, v_ledger_121000, v_rows;
  END IF;

  WITH esperado(relname, rolname, privilege_type) AS (
    VALUES
      ('financiamento_verificacoes', 'service_role', 'SELECT'),
      ('financiamento_verificacoes', 'service_role', 'INSERT'),
      ('financiamento_verificacoes', 'service_role', 'UPDATE'),
      ('financiamento_verificacoes', 'service_role', 'DELETE'),
      ('financiamento_verificacoes_publico', 'service_role', 'SELECT')
  ), atual AS (
    SELECT c.relname,
           coalesce(grantee.rolname, 'PUBLIC') AS rolname,
           x.privilege_type,
           x.is_grantable,
           x.grantor,
           c.relowner
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
      LEFT JOIN pg_roles grantee ON grantee.oid = x.grantee
     WHERE c.oid IN (
       'public.financiamento_verificacoes'::regclass,
       'public.financiamento_verificacoes_publico'::regclass
     )
       AND x.grantee <> c.relowner
  )
  SELECT count(*) FILTER (
           WHERE e.relname IS NULL OR a.is_grantable OR a.grantor IS DISTINCT FROM a.relowner
         ) + abs(count(*) - 5)
    INTO v_acl_invalidos
    FROM atual a
    LEFT JOIN esperado e USING (relname, rolname, privilege_type);

  SELECT count(*) INTO v_acl_colunas
    FROM pg_attribute a
    CROSS JOIN LATERAL aclexplode(a.attacl) x
   WHERE a.attrelid IN (
     'public.financiamento_verificacoes'::regclass,
     'public.financiamento_verificacoes_publico'::regclass
   )
     AND a.attnum > 0;

  IF v_acl_invalidos <> 0 OR v_acl_colunas <> 0 THEN
    RAISE EXCEPTION
      'rollback 20260810120500: ACL atual divergiu: invalidos=% colunas=%',
      v_acl_invalidos, v_acl_colunas;
  END IF;
END
$guard$;

REVOKE ALL PRIVILEGES ON public.financiamento_verificacoes
  FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON public.financiamento_verificacoes TO service_role;

REVOKE ALL PRIVILEGES ON public.financiamento_verificacoes_publico
  FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON public.financiamento_verificacoes_publico TO service_role;
GRANT SELECT ON public.financiamento_verificacoes_publico TO anon, authenticated;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260810120500';

DO $postcondition$
DECLARE
  v_ledger integer;
  v_acl_invalidos integer;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810120500';

  WITH esperado(relname, rolname, privilege_type) AS (
    VALUES
      ('financiamento_verificacoes', 'service_role', 'SELECT'),
      ('financiamento_verificacoes', 'service_role', 'INSERT'),
      ('financiamento_verificacoes', 'service_role', 'UPDATE'),
      ('financiamento_verificacoes', 'service_role', 'DELETE'),
      ('financiamento_verificacoes', 'service_role', 'TRUNCATE'),
      ('financiamento_verificacoes', 'service_role', 'REFERENCES'),
      ('financiamento_verificacoes', 'service_role', 'TRIGGER'),
      ('financiamento_verificacoes', 'service_role', 'MAINTAIN'),
      ('financiamento_verificacoes_publico', 'service_role', 'SELECT'),
      ('financiamento_verificacoes_publico', 'service_role', 'INSERT'),
      ('financiamento_verificacoes_publico', 'service_role', 'UPDATE'),
      ('financiamento_verificacoes_publico', 'service_role', 'DELETE'),
      ('financiamento_verificacoes_publico', 'service_role', 'TRUNCATE'),
      ('financiamento_verificacoes_publico', 'service_role', 'REFERENCES'),
      ('financiamento_verificacoes_publico', 'service_role', 'TRIGGER'),
      ('financiamento_verificacoes_publico', 'service_role', 'MAINTAIN'),
      ('financiamento_verificacoes_publico', 'anon', 'SELECT'),
      ('financiamento_verificacoes_publico', 'authenticated', 'SELECT')
  ), atual AS (
    SELECT c.relname,
           coalesce(grantee.rolname, 'PUBLIC') AS rolname,
           x.privilege_type,
           x.is_grantable,
           x.grantor,
           c.relowner
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
      LEFT JOIN pg_roles grantee ON grantee.oid = x.grantee
     WHERE c.oid IN (
       'public.financiamento_verificacoes'::regclass,
       'public.financiamento_verificacoes_publico'::regclass
     )
       AND x.grantee <> c.relowner
  )
  SELECT count(*) FILTER (
           WHERE e.relname IS NULL OR a.is_grantable OR a.grantor IS DISTINCT FROM a.relowner
         ) + abs(count(*) - 18)
    INTO v_acl_invalidos
    FROM atual a
    LEFT JOIN esperado e USING (relname, rolname, privilege_type);

  IF v_ledger <> 0 OR v_acl_invalidos <> 0 THEN
    RAISE EXCEPTION
      'rollback 20260810120500: pos-condicao falhou: ledger=% acl_invalidos=%',
      v_ledger, v_acl_invalidos;
  END IF;
END
$postcondition$;
