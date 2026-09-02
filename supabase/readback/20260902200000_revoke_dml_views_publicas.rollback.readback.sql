DO $readback$
DECLARE
  ledger_count integer;
  papel text;
  priv text;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260902200000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback revoke_dml_views_publicas: versao ainda no ledger';
  END IF;

  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF NOT has_table_privilege(papel, 'public.candidatos_identidade_tier1_auditavel', priv) THEN
        RAISE EXCEPTION 'rollback readback revoke_dml_views_publicas: % sem % em tier1', papel, priv;
      END IF;
    END LOOP;
    IF has_table_privilege(papel, 'public.candidatos_identidade_tier1_auditavel', 'SELECT') THEN
      RAISE EXCEPTION 'rollback readback revoke_dml_views_publicas: % com SELECT em tier1', papel;
    END IF;
    FOREACH priv IN ARRAY ARRAY['SELECT', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF NOT has_table_privilege(papel, 'public.financiamento_publico', priv) THEN
        RAISE EXCEPTION 'rollback readback revoke_dml_views_publicas: % sem % em financiamento_publico', papel, priv;
      END IF;
    END LOOP;
  END LOOP;
END
$readback$;
