-- Readback somente leitura e fail-closed da remediacao ACL 20260810120500.
DO $readback$
DECLARE
  v_ledger_120000 integer;
  v_ledger_120500 integer;
  v_acl_invalidos integer;
  v_acl_colunas integer;
BEGIN
  SELECT count(*) INTO v_ledger_120000
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810120000';
  SELECT count(*) INTO v_ledger_120500
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810120500';

  IF v_ledger_120000 <> 1 OR v_ledger_120500 <> 1 THEN
    RAISE EXCEPTION
      'readback 20260810120500: ledger 120000=% 120500=%',
      v_ledger_120000, v_ledger_120500;
  END IF;

  IF to_regclass('public.financiamento_verificacoes') IS NULL
     OR to_regclass('public.financiamento_verificacoes_publico') IS NULL THEN
    RAISE EXCEPTION 'readback 20260810120500: contrato 120000 ausente';
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
      'readback 20260810120500: ACL divergiu: invalidos=% colunas=%',
      v_acl_invalidos, v_acl_colunas;
  END IF;
END
$readback$;
