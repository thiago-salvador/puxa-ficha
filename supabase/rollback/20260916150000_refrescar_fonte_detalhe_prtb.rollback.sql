-- Rollback de 20260916150000: devolve fonte_detalhe da chapa presidencial do
-- PRTB ao texto/hash de 15/09/2026 ("Aguardando julgamento"). Legitimo
-- reverter mesmo depois de o TSE ter avancado o julgamento: este blob e
-- proveniencia de captura (o que o DivulgaCandContas respondeu naquele
-- instante), nao fato ao vivo -- ao contrario do CHECK de
-- situacao_candidatura, reverter aqui nao apaga julgamento publicado, so
-- volta a citar uma captura anterior real.
BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_topo text;
BEGIN
  SELECT count(*), coalesce(max(version), '')
    INTO ledger_count, ledger_topo
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260916150000';
  IF ledger_count <> 1 OR ledger_topo <> '20260916150000' THEN
    RAISE EXCEPTION 'rollback fonte-detalhe-prtb: ledger inesperado (count=%, topo=%)', ledger_count, ledger_topo;
  END IF;

  IF (SELECT count(*) FROM public.chapas_2026
       WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
         AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Pendente de julgamento'
         AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Pendente de julgamento'
         AND fonte_sha256 = '111536f42f57322e3948aa6db34a7d13236148fa3cde77e042574027835a080c') <> 1
  THEN
    RAISE EXCEPTION 'rollback fonte-detalhe-prtb: preimagem (postimage do forward) divergiu';
  END IF;
END
$precondition$;

-- @write tabela=chapas_2026 chave=2026:BR:pablo-henrique-costa-marcal campos=fonte_detalhe,fonte_sha256,snapshot_em
UPDATE public.chapas_2026
SET fonte_detalhe = jsonb_set(
      jsonb_set(
        fonte_detalhe,
        '{titular}',
        fonte_detalhe->'titular' || jsonb_build_object(
          'descricao_situacao', 'Aguardando julgamento',
          'sha256', '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad',
          'checked_at', '2026-09-15T15:04:36.472Z'
        )
      ),
      '{vice}',
      fonte_detalhe->'vice' || jsonb_build_object(
        'descricao_situacao', 'Aguardando julgamento',
        'sha256', 'e2a45d22429fb28baa6d075592de32ceba85f9eccec4c309bf564c6ee8360e02',
        'checked_at', '2026-09-15T15:04:36.528Z'
      )
    ),
    fonte_sha256 = '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad',
    snapshot_em = timestamptz '2026-09-15T15:04:36.472Z'
WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
  AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Pendente de julgamento';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260916150000';

DO $postcondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.chapas_2026
     WHERE chave = '2026:BR:pablo-henrique-costa-marcal'
       AND fonte_detalhe->'titular'->>'descricao_situacao' = 'Aguardando julgamento'
       AND fonte_detalhe->'vice'->>'descricao_situacao' = 'Aguardando julgamento'
       AND fonte_sha256 = '6350130e0a337d698eb30c86d053bb15317cfa7f7c31a496c5c89f4d0eb82dad'
  ) THEN
    RAISE EXCEPTION 'rollback fonte-detalhe-prtb: pos-condicao falhou';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260916150000') THEN
    RAISE EXCEPTION 'rollback fonte-detalhe-prtb: ledger ainda tem a migration';
  END IF;
END
$postcondition$;

COMMIT;
