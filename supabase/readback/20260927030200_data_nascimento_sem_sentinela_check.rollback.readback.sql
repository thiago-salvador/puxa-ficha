BEGIN READ ONLY;
DO $readback$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'candidatos_data_nascimento_sem_sentinela_check'
               AND conrelid = 'public.candidatos'::regclass)
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260927030200') THEN
    RAISE EXCEPTION 'nascimento-sentinela-check rollback readback: constraint ou ledger continuam';
  END IF;
END
$readback$;
COMMIT;
