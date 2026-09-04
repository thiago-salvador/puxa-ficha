-- Rollback fechado de 20260903210000 (alargamento do dominio de
-- situacao_candidatura para os quatro estados de julgamento).
--
-- E DDL puro: a migration nao escreveu dado nenhum, entao nao ha pre-imagem a
-- devolver. O que este arquivo faz e reinstalar o CHECK de tres valores.
--
-- A precondicao mais importante nao e de ledger, e de DADO: se alguma linha ja
-- estiver com 'deferido', 'indeferido' ou parente, estreitar o dominio de volta
-- reprovaria com violacao de CHECK no meio da transacao. Este arquivo prefere
-- falhar ANTES, com o censo na mensagem, a deixar o operador descobrir pelo
-- SQLSTATE 23514. Rollback so e seguro enquanto o ingest ainda nao gravou
-- julgamento; depois disso, reverter exige decidir o que fazer com o dado, e
-- essa decisao nao cabe num arquivo de rollback.

BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_top text;
  tem_constraint boolean;
  alargada boolean;
  com_julgamento integer;
BEGIN
  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260903210000';
  IF ledger_count <> 1 OR ledger_top <> '20260903210000' THEN
    RAISE EXCEPTION 'rollback vocabulario julgamento: ledger inesperado (count=%, topo=%)', ledger_count, ledger_top;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
  ) INTO tem_constraint;
  IF NOT tem_constraint THEN
    RAISE EXCEPTION 'rollback vocabulario julgamento: CHECK ausente; estado nao e o pos-migration';
  END IF;

  SELECT pg_get_constraintdef(oid) LIKE '%deferido com recurso%'
    INTO alargada
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio';
  IF NOT alargada THEN
    RAISE EXCEPTION 'rollback vocabulario julgamento: o CHECK instalado ja e o estreito; nada a reverter';
  END IF;

  SELECT count(*) INTO com_julgamento
    FROM public.candidatos
   WHERE situacao_candidatura IN ('deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso');
  IF com_julgamento <> 0 THEN
    RAISE EXCEPTION 'rollback vocabulario julgamento: % linha(s) ja gravadas com estado de julgamento. Estreitar o dominio agora apagaria fato publicado pelo TSE. Reverter exige decidir antes o que fazer com esse dado', com_julgamento;
  END IF;
END
$precondition$;

ALTER TABLE public.candidatos
  DROP CONSTRAINT candidatos_situacao_candidatura_dominio;

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_situacao_candidatura_dominio
  CHECK (situacao_candidatura IN (
    'aguardando julgamento',
    'candidatura declarada',
    'incerto'
  ));

COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio ON public.candidatos IS
  'Vocabulario fechado de situacao_candidatura. NULL e permitido de proposito (ausencia de informacao). Espelha SITUACAO_CANDIDATURA_DOMINIO em src/lib/situacao-candidatura.ts: mudou la, muda aqui na mesma PR.';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260903210000';

DO $postcondition$
DECLARE
  alargada boolean;
  ledger_count integer;
BEGIN
  SELECT pg_get_constraintdef(oid) LIKE '%deferido%'
    INTO alargada
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio'
     AND contype = 'c'
     AND convalidated;
  IF alargada IS NULL THEN
    RAISE EXCEPTION 'rollback vocabulario julgamento: CHECK sumiu em vez de voltar ao estreito';
  END IF;
  IF alargada THEN
    RAISE EXCEPTION 'rollback vocabulario julgamento: CHECK continua aceitando estado de julgamento';
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903210000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback vocabulario julgamento: ledger ainda tem a migration';
  END IF;
END
$postcondition$;

COMMIT;
