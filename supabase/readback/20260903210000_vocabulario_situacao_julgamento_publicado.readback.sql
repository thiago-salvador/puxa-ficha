DO $readback$
DECLARE
  ledger_count integer;
  definicao text;
  fora integer;
  faltando text[] := '{}';
  estado text;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903210000';
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'readback vocabulario julgamento: ledger sem a migration (count=%)', ledger_count;
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO definicao
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio'
     AND contype = 'c'
     AND convalidated;
  IF definicao IS NULL THEN
    RAISE EXCEPTION 'readback vocabulario julgamento: CHECK ausente ou NOT VALID';
  END IF;

  -- Os SETE valores, conferidos um a um. Conferir so 'deferido com recurso'
  -- deixaria passar um CHECK que perdeu 'indeferido' pelo caminho.
  FOREACH estado IN ARRAY ARRAY[
    'aguardando julgamento', 'candidatura declarada', 'incerto',
    'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso'
  ] LOOP
    IF position('''' || estado || '''' IN definicao) = 0 THEN
      faltando := faltando || estado;
    END IF;
  END LOOP;
  IF cardinality(faltando) > 0 THEN
    RAISE EXCEPTION 'readback vocabulario julgamento: CHECK sem o(s) valor(es) %', array_to_string(faltando, ', ');
  END IF;

  SELECT count(*) INTO fora FROM public.candidatos
   WHERE situacao_candidatura IS NOT NULL
     AND situacao_candidatura NOT IN (
       'aguardando julgamento', 'candidatura declarada', 'incerto',
       'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso');
  IF fora <> 0 THEN
    RAISE EXCEPTION 'readback vocabulario julgamento: % linha(s) fora do dominio alargado', fora;
  END IF;

  -- A migration e DDL pura: nao pode ter escrito situacao nenhuma. Se alguma
  -- linha ja aparece com julgamento logo depois do ALTER, alguem escreveu dado
  -- na mesma transacao, que e exatamente o que ela promete nao fazer.
  IF EXISTS (
    SELECT 1 FROM public.candidatos
     WHERE situacao_candidatura IN ('deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso')
  ) THEN
    RAISE NOTICE 'readback vocabulario julgamento: ja existe linha com estado de julgamento; confira se veio do ingest e nao da migration';
  END IF;
END
$readback$;
