-- Rollback fechado do PAR 20260903100000 (dado) + 20260903100100 (CHECK).
--
-- Os dois sao aplicados juntos e revertidos juntos: derrubar so o CHECK
-- deixaria o vocabulario normalizado sem a garantia, e devolver so o dado
-- quebraria o CHECK. A pre-imagem vem do recibo que a migration de dado
-- gravou em coleta_log (execucao = 'migration:20260903100000', detalhe =
-- JSON id -> valor anterior).

BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_top text;
  tem_constraint boolean;
  receipt_count integer;
  rollback_receipt_count integer;
BEGIN
  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260903100000';
  IF ledger_count <> 2 OR ledger_top <> '20260903100100' THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: ledger inesperado (count=%, topo=%)', ledger_count, ledger_top;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
  ) INTO tem_constraint;
  IF NOT tem_constraint THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: CHECK ausente; estado nao e o pos-migration';
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903100000' AND detalhe IS NOT NULL;
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: recibo de pre-imagem ausente ou duplicado (%)', receipt_count;
  END IF;

  SELECT count(*) INTO rollback_receipt_count
  FROM public.coleta_log
  WHERE execucao = 'rollback:20260903100000';
  IF rollback_receipt_count <> 0 THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: rollback ja executado';
  END IF;
END
$precondition$;

ALTER TABLE public.candidatos
  DROP CONSTRAINT candidatos_situacao_candidatura_dominio;

-- @write tabela=candidatos ref=rollback:20260903100000 campos=situacao_candidatura
UPDATE public.candidatos c
SET situacao_candidatura = pre.valor
FROM (
  SELECT (kv.key)::uuid AS id, kv.value AS valor
  FROM public.coleta_log r,
       jsonb_each_text(r.detalhe::jsonb) AS kv
  WHERE r.execucao = 'migration:20260903100000'
) pre
WHERE c.id = pre.id;

-- @write tabela=coleta_log ref=rollback:20260903100000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao
INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao)
SELECT 'vocabulario-situacao', 'coluna', 'candidatos.situacao_candidatura', 'revertido',
       r.volume,
       'Rollback do par 20260903100000/20260903100100: CHECK removido e ' || r.volume || ' linha(s) devolvidas a grafia anterior pela pre-imagem',
       'https://dadosabertos.tse.jus.br/dataset/candidatos-2026',
       'rollback:20260903100000'
FROM public.coleta_log r
WHERE r.execucao = 'migration:20260903100000';

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20260903100000', '20260903100100');

DO $postcondition$
DECLARE
  ledger_count integer;
  tem_constraint boolean;
  divergentes integer;
  volume_pre integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.candidatos'::regclass
       AND conname = 'candidatos_situacao_candidatura_dominio'
  ) INTO tem_constraint;
  IF tem_constraint THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: CHECK continua presente';
  END IF;

  SELECT count(*) INTO divergentes
  FROM public.coleta_log r,
       jsonb_each_text(r.detalhe::jsonb) AS kv
  JOIN public.candidatos c ON c.id = (kv.key)::uuid
  WHERE r.execucao = 'migration:20260903100000'
    AND c.situacao_candidatura IS DISTINCT FROM kv.value;
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: % linha(s) nao voltaram a pre-imagem', divergentes;
  END IF;

  SELECT volume INTO volume_pre FROM public.coleta_log WHERE execucao = 'migration:20260903100000';
  IF volume_pre IS NULL THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: recibo de pre-imagem sumiu durante o rollback';
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version IN ('20260903100000', '20260903100100');
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback vocabulario_situacao: ledger ainda tem o par';
  END IF;
END
$postcondition$;

COMMIT;
