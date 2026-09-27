BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'candidatos_data_nascimento_sem_sentinela_check'
      AND conrelid = 'public.candidatos'::regclass
      AND contype = 'c'
      AND convalidated
      AND pg_get_constraintdef(oid) LIKE '%data_nascimento >= ''1910-01-01''::date%') THEN
    RAISE EXCEPTION 'nascimento-sentinela-check readback: constraint ausente, nao validada ou com forma inesperada';
  END IF;

  IF EXISTS (SELECT 1 FROM public.candidatos WHERE data_nascimento < DATE '1910-01-01') THEN
    RAISE EXCEPTION 'nascimento-sentinela-check readback: ha data de nascimento sentinela';
  END IF;
END
$readback$;
COMMIT;
