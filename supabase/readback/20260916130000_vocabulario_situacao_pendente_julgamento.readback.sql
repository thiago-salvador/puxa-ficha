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
  WHERE version = '20260916130000';
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'readback pendente de julgamento: ledger sem a migration (count=%)', ledger_count;
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO definicao
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio'
     AND contype = 'c'
     AND convalidated;
  IF definicao IS NULL THEN
    RAISE EXCEPTION 'readback pendente de julgamento: CHECK ausente ou NOT VALID';
  END IF;

  -- Os OITO valores, conferidos um a um.
  FOREACH estado IN ARRAY ARRAY[
    'aguardando julgamento', 'candidatura declarada', 'incerto',
    'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso',
    'pendente de julgamento'
  ] LOOP
    IF position('''' || estado || '''' IN definicao) = 0 THEN
      faltando := faltando || estado;
    END IF;
  END LOOP;
  IF cardinality(faltando) > 0 THEN
    RAISE EXCEPTION 'readback pendente de julgamento: CHECK sem o(s) valor(es) %', array_to_string(faltando, ', ');
  END IF;

  SELECT count(*) INTO fora FROM public.candidatos
   WHERE situacao_candidatura IS NOT NULL
     AND situacao_candidatura NOT IN (
       'aguardando julgamento', 'candidatura declarada', 'incerto',
       'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso',
       'pendente de julgamento');
  IF fora <> 0 THEN
    RAISE EXCEPTION 'readback pendente de julgamento: % linha(s) fora do dominio alargado', fora;
  END IF;

  -- A migration e DDL pura: nao pode ter escrito situacao nenhuma nesta
  -- transacao. Linha com o estado novo logo apos o ALTER e esperada quando o
  -- ledger ja passou por 20260916140000 (a migration de dado seguinte);
  -- avisa, nao falha.
  IF EXISTS (
    SELECT 1 FROM public.candidatos WHERE situacao_candidatura = 'pendente de julgamento'
  ) THEN
    RAISE NOTICE 'readback pendente de julgamento: ja existe linha com o estado novo; confira se veio da migration de dado 20260916140000';
  END IF;
END
$readback$;
