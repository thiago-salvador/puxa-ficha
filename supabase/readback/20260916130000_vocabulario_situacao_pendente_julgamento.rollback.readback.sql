DO $readback$
DECLARE
  ledger_count integer;
  definicao text;
  faltando text[] := '{}';
  estado text;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260916130000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback pendente de julgamento: migration ainda no ledger';
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO definicao
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio'
     AND contype = 'c'
     AND convalidated;
  IF definicao IS NULL THEN
    RAISE EXCEPTION 'rollback readback pendente de julgamento: CHECK sumiu; o rollback tinha de reinstalar o de sete valores';
  END IF;
  IF position('''pendente de julgamento''' IN definicao) > 0 THEN
    RAISE EXCEPTION 'rollback readback pendente de julgamento: CHECK ainda aceita o oitavo estado';
  END IF;

  -- O CHECK reinstalado tem de ser o de SETE valores INTEIRO, nao so sem o
  -- oitavo: conferir a ausencia isolada deixaria passar um rollback que
  -- reinstalou uma constraint vazia ou pela metade.
  FOREACH estado IN ARRAY ARRAY[
    'aguardando julgamento', 'candidatura declarada', 'incerto',
    'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso'
  ] LOOP
    IF position('''' || estado || '''' IN definicao) = 0 THEN
      faltando := faltando || estado;
    END IF;
  END LOOP;
  IF cardinality(faltando) > 0 THEN
    RAISE EXCEPTION 'rollback readback pendente de julgamento: CHECK de sete valores perdeu %', array_to_string(faltando, ', ');
  END IF;
END
$readback$;
