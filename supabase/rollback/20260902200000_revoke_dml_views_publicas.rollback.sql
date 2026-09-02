-- Rollback fechado somente da migration 20260902200000.
--
-- Restaura exatamente o ACL medido em producao em 02/09/2026 antes da
-- migration (os default privileges do projeto menos o SELECT que
-- 20260603013042 ja havia revogado da view tier1), e remove a linha do ledger.

BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_top text;
  papel text;
  priv text;
BEGIN
  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260902200000';

  IF ledger_count <> 1 OR ledger_top <> '20260902200000' THEN
    RAISE EXCEPTION 'rollback revoke_dml_views_publicas: ledger inesperado (count=%, topo=%)', ledger_count, ledger_top;
  END IF;

  -- So faz sentido desfazer o que a migration fez: o estado atual precisa ser
  -- o pos-migration.
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(papel, 'public.candidatos_identidade_tier1_auditavel', priv)
         OR has_table_privilege(papel, 'public.financiamento_publico', priv) THEN
        RAISE EXCEPTION 'rollback revoke_dml_views_publicas: % ja tem %; estado nao e o pos-migration', papel, priv;
      END IF;
    END LOOP;
  END LOOP;
END
$precondition$;

GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.candidatos_identidade_tier1_auditavel TO anon, authenticated;

GRANT TRUNCATE, REFERENCES, TRIGGER
  ON public.financiamento_publico TO anon, authenticated;

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260902200000';

DO $postcondition$
DECLARE
  ledger_count integer;
  papel text;
  priv text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF NOT has_table_privilege(papel, 'public.candidatos_identidade_tier1_auditavel', priv) THEN
        RAISE EXCEPTION 'rollback revoke_dml_views_publicas: % sem % em tier1 apos o rollback', papel, priv;
      END IF;
    END LOOP;
    IF has_table_privilege(papel, 'public.candidatos_identidade_tier1_auditavel', 'SELECT') THEN
      RAISE EXCEPTION 'rollback revoke_dml_views_publicas: % com SELECT em tier1; 20260603013042 nao pode ser desfeita aqui', papel;
    END IF;
    FOREACH priv IN ARRAY ARRAY['SELECT', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF NOT has_table_privilege(papel, 'public.financiamento_publico', priv) THEN
        RAISE EXCEPTION 'rollback revoke_dml_views_publicas: % sem % em financiamento_publico apos o rollback', papel, priv;
      END IF;
    END LOOP;
    FOREACH priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(papel, 'public.financiamento_publico', priv) THEN
        RAISE EXCEPTION 'rollback revoke_dml_views_publicas: % ganhou % em financiamento_publico, que nunca teve', papel, priv;
      END IF;
    END LOOP;
  END LOOP;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260902200000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback revoke_dml_views_publicas: linha do ledger continua presente';
  END IF;
END
$postcondition$;

COMMIT;
