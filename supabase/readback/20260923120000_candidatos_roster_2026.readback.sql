DO $readback$
DECLARE
  target_role name;
  roster_oid oid := to_regclass('public.candidatos_roster_2026');
  view_oid oid := to_regclass('public.candidatos_roster_2026_publico');
BEGIN
  IF roster_oid IS NULL OR view_oid IS NULL THEN
    RAISE EXCEPTION 'roster 2026: tabela ou view ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE oid = roster_oid AND relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'candidatos_roster_2026'
      AND policyname = 'candidatos_roster_2026_leitura_publica'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'roster 2026: RLS ou policy publica ausente';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = view_oid AND relkind = 'v'
      AND 'security_invoker=true' = ANY (reloptions)
  ) THEN
    RAISE EXCEPTION 'roster 2026: view sem security_invoker';
  END IF;
  FOREACH target_role IN ARRAY ARRAY['anon'::name, 'authenticated'::name] LOOP
    IF has_table_privilege(target_role, roster_oid, 'SELECT')
       OR has_table_privilege(target_role, roster_oid, 'INSERT')
       OR has_table_privilege(target_role, roster_oid, 'UPDATE')
       OR has_table_privilege(target_role, roster_oid, 'DELETE') THEN
      RAISE EXCEPTION 'roster 2026: privilegio de tabela inesperado para %', target_role;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = roster_oid AND attnum > 0 AND NOT attisdropped
        AND NOT has_column_privilege(target_role, roster_oid, attname, 'SELECT')
    ) THEN
      RAISE EXCEPTION 'roster 2026: SELECT por coluna incompleto para %', target_role;
    END IF;
    IF NOT has_table_privilege(target_role, view_oid, 'SELECT')
       OR has_table_privilege(target_role, view_oid, 'INSERT')
       OR has_table_privilege(target_role, view_oid, 'UPDATE')
       OR has_table_privilege(target_role, view_oid, 'DELETE') THEN
      RAISE EXCEPTION 'roster 2026: ACL da view incorreta para %', target_role;
    END IF;
  END LOOP;
END $readback$;
