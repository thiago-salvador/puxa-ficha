-- Rollback da 20260903130000 (nome de urna do vice de RN).
--
-- A restauracao NAO tem o valor antigo escrito aqui dentro. Ela le a linha
-- inteira da pre-imagem que a migration gravou em coleta_log
-- (execucao = 'migration:20260903130000', detalhe = objeto JSON com a chave
-- `linhas`) e devolve `vice_nome_urna` de la. Repetir 'HERMANO MORAIS' como
-- literal neste arquivo criaria uma segunda fonte de verdade que pode divergir
-- da que foi realmente gravada; o recibo e a unica.
BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_topo text;
  recibo_forward integer;
  recibo_rollback integer;
  linhas_na_preimagem integer;
BEGIN
  -- Nada depois de 20260903130000 pode estar aplicado: reverter no meio da
  -- pilha deixaria o ledger descrevendo um estado que o banco nao tem.
  SELECT count(*), coalesce(max(version), '')
    INTO ledger_count, ledger_topo
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260903130000';
  IF ledger_count <> 1 OR ledger_topo <> '20260903130000' THEN
    RAISE EXCEPTION 'rollback chapas hermano: ledger inesperado (count=%, topo=%)', ledger_count, ledger_topo;
  END IF;

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903130000' AND detalhe IS NOT NULL;
  IF recibo_forward <> 1 THEN
    RAISE EXCEPTION 'rollback chapas hermano: recibo de pre-imagem ausente ou duplicado (%)', recibo_forward;
  END IF;

  SELECT count(*) INTO recibo_rollback
  FROM public.coleta_log WHERE execucao = 'rollback:20260903130000';
  IF recibo_rollback <> 0 THEN
    RAISE EXCEPTION 'rollback chapas hermano: rollback ja executado';
  END IF;

  SELECT count(*) INTO linhas_na_preimagem
  FROM public.coleta_log r, jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS elem
  WHERE r.execucao = 'migration:20260903130000';
  IF linhas_na_preimagem > 1 THEN
    RAISE EXCEPTION 'rollback chapas hermano: pre-imagem com % linhas, esperado 0 ou 1', linhas_na_preimagem;
  END IF;
END
$precondition$;

-- ---------------------------------------------------------------------------
-- Restauracao pela pre-imagem. Pre-imagem vazia (replay em banco sem a linha)
-- produz zero linhas no FROM e o UPDATE vira no-op, que e o certo.
-- @write tabela=chapas_2026 ref=rollback:20260903130000 chave="migration:20260903130000" campos=vice_nome_urna
UPDATE public.chapas_2026 ch
SET vice_nome_urna = pre.vice_nome_urna
FROM (
  SELECT elem ->> 'chave' AS chave,
         elem ->> 'vice_nome_urna' AS vice_nome_urna
  FROM public.coleta_log r,
       jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS elem
  WHERE r.execucao = 'migration:20260903130000'
) pre
WHERE ch.chave = pre.chave;

-- ---------------------------------------------------------------------------
-- Recibo do rollback. O recibo forward NAO e apagado: ele e a evidencia de que
-- a correcao existiu e de qual era a pre-imagem, e o readback pos-rollback
-- ainda o consulta.
-- @write tabela=coleta_log ref=rollback:20260903130000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
SELECT 'tse-chapas-2026', 'territorio', 'chapas_2026:RN:vice_nome_urna',
       CASE WHEN r.volume > 0 THEN 'encontrado' ELSE 'vazio_confirmado' END,
       r.volume,
       'Rollback da 20260903130000: ' || r.volume || ' linha(s) de chapas_2026 devolvidas ao vice_nome_urna da pre-imagem',
       'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
       'rollback:20260903130000',
       'escrita'
FROM public.coleta_log r
WHERE r.execucao = 'migration:20260903130000';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260903130000';

DO $postcondition$
DECLARE
  divergentes integer;
  recibo_forward integer;
  recibo_rollback integer;
  ledger_count integer;
BEGIN
  -- Toda linha da pre-imagem tem que estar de volta ao valor exato de origem.
  SELECT count(*) INTO divergentes
  FROM public.coleta_log r,
       jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS elem
  JOIN public.chapas_2026 ch ON ch.chave = elem ->> 'chave'
  WHERE r.execucao = 'migration:20260903130000'
    AND ch.vice_nome_urna IS DISTINCT FROM elem ->> 'vice_nome_urna';
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback chapas hermano: % linha(s) nao voltaram a pre-imagem', divergentes;
  END IF;

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log WHERE execucao = 'migration:20260903130000';
  IF recibo_forward <> 1 THEN
    RAISE EXCEPTION 'rollback chapas hermano: recibo de pre-imagem sumiu durante o rollback';
  END IF;

  SELECT count(*) INTO recibo_rollback
  FROM public.coleta_log WHERE execucao = 'rollback:20260903130000';
  IF recibo_rollback <> 1 THEN
    RAISE EXCEPTION 'rollback chapas hermano: recibo de rollback ausente ou duplicado (%)', recibo_rollback;
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations WHERE version = '20260903130000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback chapas hermano: ledger ainda tem a versao';
  END IF;
END
$postcondition$;

COMMIT;
