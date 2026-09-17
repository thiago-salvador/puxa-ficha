-- Rollback fechado de 20260916130000 (alargamento do dominio de
-- situacao_candidatura para 'pendente de julgamento').
--
-- DDL puro: a migration nao escreveu dado. O que reverte e o CHECK, de volta
-- aos sete valores anteriores. Igual ao rollback de 20260903210000, a
-- precondicao mais importante e de DADO: se alguma linha ja tiver
-- 'pendente de julgamento', estreitar o dominio agora reprovaria com
-- violacao de CHECK, ou pior, apagaria em silencio um fato que o TSE publicou.
-- Este arquivo prefere falhar ANTES, com o censo na mensagem.

BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_top text;
  tem_constraint boolean;
  alargada boolean;
  com_pendente integer;
BEGIN
  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260916130000';
  IF ledger_count <> 1 OR ledger_top <> '20260916130000' THEN
    RAISE EXCEPTION 'rollback pendente de julgamento: ledger inesperado (count=%, topo=%)', ledger_count, ledger_top;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
  ) INTO tem_constraint;
  IF NOT tem_constraint THEN
    RAISE EXCEPTION 'rollback pendente de julgamento: CHECK ausente; estado nao e o pos-migration';
  END IF;

  SELECT pg_get_constraintdef(oid) LIKE '%pendente de julgamento%'
    INTO alargada
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio';
  IF NOT alargada THEN
    RAISE EXCEPTION 'rollback pendente de julgamento: o CHECK instalado ja e o estreito; nada a reverter';
  END IF;

  SELECT count(*) INTO com_pendente
    FROM public.candidatos
   WHERE situacao_candidatura = 'pendente de julgamento';
  IF com_pendente <> 0 THEN
    RAISE EXCEPTION 'rollback pendente de julgamento: % linha(s) ja gravadas com o estado novo. Estreitar o dominio agora apagaria fato publicado pelo TSE. Reverter exige decidir antes o que fazer com esse dado (inclui desfazer 20260916140000 primeiro)', com_pendente;
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
    'incerto',
    'deferido',
    'deferido com recurso',
    'indeferido',
    'indeferido com recurso'
  ));

COMMENT ON CONSTRAINT candidatos_situacao_candidatura_dominio ON public.candidatos IS
  'Vocabulario fechado de situacao_candidatura. NULL e permitido de proposito (ausencia de informacao). Espelha SITUACAO_CANDIDATURA_DOMINIO em src/lib/situacao-candidatura.ts: mudou la, muda aqui na mesma PR. Os quatro estados de julgamento entraram em 03/09/2026.';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260916130000';

DO $postcondition$
DECLARE
  alargada boolean;
  ledger_count integer;
BEGIN
  SELECT pg_get_constraintdef(oid) LIKE '%pendente de julgamento%'
    INTO alargada
    FROM pg_constraint
   WHERE conrelid = 'public.candidatos'::regclass
     AND conname = 'candidatos_situacao_candidatura_dominio'
     AND contype = 'c'
     AND convalidated;
  IF alargada IS NULL THEN
    RAISE EXCEPTION 'rollback pendente de julgamento: CHECK sumiu em vez de voltar ao estreito';
  END IF;
  IF alargada THEN
    RAISE EXCEPTION 'rollback pendente de julgamento: CHECK continua aceitando o oitavo estado';
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260916130000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback pendente de julgamento: ledger ainda tem a migration';
  END IF;
END
$postcondition$;

COMMIT;
