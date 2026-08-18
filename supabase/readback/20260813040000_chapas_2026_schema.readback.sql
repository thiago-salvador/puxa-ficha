-- Readback fail-closed do schema e da fronteira pública de chapas.
DO $$
DECLARE
  granted_columns text[];
  expected_columns constant text[] := ARRAY[
    'chave','eleicao_codigo','eleicao_data','uf','cargo_titular','identidade_status',
    'vinculo_titular_status','tse_situacao_codigo','titular_candidato_id',
    'titular_nome_completo','titular_nome_urna','titular_partido_sigla',
    'vice_candidato_id','vice_nome_completo','vice_nome_urna','vice_partido_sigla',
    'fonte_url','fonte_sha256','snapshot_em'
  ];
  policy_roles name[];
BEGIN
  IF to_regclass('public.chapas_2026') IS NULL
     OR to_regclass('public.chapas_2026_publico') IS NULL THEN
    RAISE EXCEPTION 'readback schema: tabela ou view ausente';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.chapas_2026'::regclass) THEN
    RAISE EXCEPTION 'readback schema: RLS/FORCE RLS ausente';
  END IF;
  IF has_table_privilege('anon','public.chapas_2026','SELECT')
     OR has_table_privilege('authenticated','public.chapas_2026','SELECT')
     OR NOT has_table_privilege('anon','public.chapas_2026_publico','SELECT')
     OR NOT has_table_privilege('authenticated','public.chapas_2026_publico','SELECT') THEN
    RAISE EXCEPTION 'readback schema: privilégios incorretos';
  END IF;

  SELECT array_agg(column_name::text ORDER BY column_name) INTO granted_columns
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='chapas_2026'
    AND grantee='anon' AND privilege_type='SELECT';
  IF granted_columns IS DISTINCT FROM
     (SELECT array_agg(x ORDER BY x) FROM unnest(expected_columns) AS x) THEN
    RAISE EXCEPTION 'readback schema: colunas anon divergiram: %', granted_columns;
  END IF;
  SELECT array_agg(column_name::text ORDER BY column_name) INTO granted_columns
  FROM information_schema.column_privileges
  WHERE table_schema='public' AND table_name='chapas_2026'
    AND grantee='authenticated' AND privilege_type='SELECT';
  IF granted_columns IS DISTINCT FROM
     (SELECT array_agg(x ORDER BY x) FROM unnest(expected_columns) AS x) THEN
    RAISE EXCEPTION 'readback schema: colunas authenticated divergiram: %', granted_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    WHERE c.oid='public.chapas_2026_publico'::regclass
      AND COALESCE(c.reloptions,'{}'::text[]) @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'readback schema: view sem security_invoker';
  END IF;
  SELECT roles INTO policy_roles FROM pg_policies
  WHERE schemaname='public' AND tablename='chapas_2026'
    AND policyname='chapas_2026_public_read' AND cmd='SELECT';
  IF policy_roles IS DISTINCT FROM ARRAY['anon','authenticated']::name[] THEN
    RAISE EXCEPTION 'readback schema: roles da policy divergiram: %', policy_roles;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='chapas_2026_publico'
      AND column_name IN ('sq_coligacao','titular_sq_candidato','vice_sq_candidato','alternativas_oficiais')
  ) THEN
    RAISE EXCEPTION 'readback schema: view pública expõe identificador privado';
  END IF;
END $$;
