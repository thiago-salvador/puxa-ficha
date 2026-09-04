DO $readback$
DECLARE
  ledger_count integer;
  definicao text;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903210000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback vocabulario julgamento: migration ainda no ledger';
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO definicao
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio'
     AND contype = 'c'
     AND convalidated;
  IF definicao IS NULL THEN
    RAISE EXCEPTION 'rollback readback vocabulario julgamento: CHECK sumiu; o rollback tinha de reinstalar o estreito';
  END IF;
  IF position('''deferido''' IN definicao) > 0 OR position('''indeferido''' IN definicao) > 0 THEN
    RAISE EXCEPTION 'rollback readback vocabulario julgamento: CHECK ainda aceita estado de julgamento';
  END IF;
  -- O CHECK reinstalado tem de ser o estreito INTEIRO. Conferir so a ausencia
  -- dos estados de julgamento deixaria passar um rollback que reinstalou uma
  -- constraint vazia ou pela metade.
  IF position('''aguardando julgamento''' IN definicao) = 0
     OR position('''candidatura declarada''' IN definicao) = 0
     OR position('''incerto''' IN definicao) = 0 THEN
    RAISE EXCEPTION 'rollback readback vocabulario julgamento: CHECK estreito perdeu um dos tres valores originais';
  END IF;
END
$readback$;
