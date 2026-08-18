-- Corrige os privilegios automaticos que o ambiente Supabase concede durante
-- CREATE TABLE/VIEW. A 20260810120000 permanece imutavel porque ja foi aplicada.
DO $guard$
DECLARE
  v_ledger_120000 integer;
  v_ledger_120500 integer;
  v_ledger_121000 integer;
  v_schema_replay boolean := false;
  v_rows integer;
  v_acl_excedente_invalidos integer;
  v_acl_exato_invalidos integer;
  v_acl_colunas integer;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    -- O replay de schema não materializa o ledger. Nesse modo só aceitamos o
    -- ACL já exato do PostgreSQL puro, nunca o pre-estado excedente de produção.
    v_schema_replay := true;
  ELSE
    SELECT count(*) INTO v_ledger_120000
      FROM supabase_migrations.schema_migrations
     WHERE version = '20260810120000';
    SELECT count(*) INTO v_ledger_120500
      FROM supabase_migrations.schema_migrations
     WHERE version = '20260810120500';
    SELECT count(*) INTO v_ledger_121000
      FROM supabase_migrations.schema_migrations
     WHERE version = '20260810121000';

    IF v_ledger_120000 <> 1 OR v_ledger_120500 <> 0 OR v_ledger_121000 <> 0 THEN
      RAISE EXCEPTION
        '20260810120500: ordem/ledger invalido: 120000=% 120500=% 121000=%',
        v_ledger_120000, v_ledger_120500, v_ledger_121000;
    END IF;
  END IF;

  IF to_regclass('public.financiamento_verificacoes') IS NULL
     OR to_regclass('public.financiamento_verificacoes_publico') IS NULL THEN
    RAISE EXCEPTION '20260810120500: contrato 120000 ausente';
  END IF;

  SELECT count(*) INTO v_rows FROM public.financiamento_verificacoes;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION '20260810120500: tabela ja contem % linhas', v_rows;
  END IF;

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
           grantor.oid AS grantor_oid,
           c.relowner
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
      LEFT JOIN pg_roles grantee ON grantee.oid = x.grantee
      LEFT JOIN pg_roles grantor ON grantor.oid = x.grantor
     WHERE c.oid IN (
       'public.financiamento_verificacoes'::regclass,
       'public.financiamento_verificacoes_publico'::regclass
     )
       AND x.grantee <> c.relowner
  )
  SELECT count(*) FILTER (
           WHERE e.relname IS NULL OR a.is_grantable OR a.grantor_oid IS DISTINCT FROM a.relowner
         ) + abs(count(*) - 18)
    INTO v_acl_excedente_invalidos
    FROM atual a
    LEFT JOIN esperado e USING (relname, rolname, privilege_type);

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
    INTO v_acl_exato_invalidos
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

  IF (v_schema_replay AND v_acl_exato_invalidos <> 0)
     OR (NOT v_schema_replay AND v_acl_excedente_invalidos <> 0 AND v_acl_exato_invalidos <> 0)
     OR v_acl_colunas <> 0 THEN
    RAISE EXCEPTION
      '20260810120500: pre-estado ACL divergiu: excedente_invalidos=% exato_invalidos=% colunas=%',
      v_acl_excedente_invalidos, v_acl_exato_invalidos, v_acl_colunas;
  END IF;
END
$guard$;

REVOKE ALL PRIVILEGES ON public.financiamento_verificacoes
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.financiamento_verificacoes TO service_role;

REVOKE ALL PRIVILEGES ON public.financiamento_verificacoes_publico
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.financiamento_verificacoes_publico TO service_role;

DO $postcondition$
DECLARE
  v_acl_invalidos integer;
  v_acl_colunas integer;
BEGIN
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
      '20260810120500: pos-condicao ACL falhou: invalidos=% colunas=%',
      v_acl_invalidos, v_acl_colunas;
  END IF;
END
$postcondition$;
