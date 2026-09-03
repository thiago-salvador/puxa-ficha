DO $readback$
DECLARE
  ledger_count integer;
  papel text;
  priv text;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260902200000';
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'readback revoke_dml_views_publicas: ledger sem a versao (count=%)', ledger_count;
  END IF;

  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(papel, 'public.candidatos_identidade_tier1_auditavel', priv) THEN
        RAISE EXCEPTION 'readback revoke_dml_views_publicas: % tem % em candidatos_identidade_tier1_auditavel', papel, priv;
      END IF;
    END LOOP;
    FOREACH priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(papel, 'public.financiamento_publico', priv) THEN
        RAISE EXCEPTION 'readback revoke_dml_views_publicas: % tem % em financiamento_publico', papel, priv;
      END IF;
    END LOOP;
    IF NOT has_table_privilege(papel, 'public.financiamento_publico', 'SELECT') THEN
      RAISE EXCEPTION 'readback revoke_dml_views_publicas: % sem SELECT em financiamento_publico', papel;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.candidatos_identidade_tier1_auditavel', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.financiamento_publico', 'SELECT') THEN
    RAISE EXCEPTION 'readback revoke_dml_views_publicas: service_role sem SELECT';
  END IF;
END
$readback$;
