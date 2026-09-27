BEGIN READ ONLY;
DO $readback$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'processos_numero_processo_cnj_check'
               AND conrelid = 'public.processos'::regclass)
     OR to_regprocedure('public.processo_numero_cnj_valido(text)') IS NOT NULL
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260926190100') THEN
    RAISE EXCEPTION 'processo-cnj-check rollback readback: constraint, funcao ou ledger continuam';
  END IF;
END
$readback$;
COMMIT;
