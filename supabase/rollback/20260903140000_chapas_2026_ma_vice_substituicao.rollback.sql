-- Rollback da 20260903140000 (vice substituto da chapa de governador do MA).
--
-- A restauracao NAO tem os valores antigos escritos aqui dentro. Ela le a linha
-- inteira da pre-imagem que a migration gravou em coleta_log
-- (execucao = 'migration:20260903140000', detalhe = objeto JSON com a chave
-- `linhas`) e devolve de la as sete colunas. Repetir 'BARTOLOMEU' e o SHA
-- antigo como literais neste arquivo criaria uma segunda fonte de verdade que
-- pode divergir da que foi realmente gravada; o recibo e a unica.
BEGIN;

DO $precondition$
DECLARE
  ledger_count integer;
  ledger_topo text;
  recibo_forward integer;
  recibo_rollback integer;
  linhas_na_preimagem integer;
BEGIN
  -- Nada depois de 20260903140000 pode estar aplicado: reverter no meio da
  -- pilha deixaria o ledger descrevendo um estado que o banco nao tem.
  SELECT count(*), coalesce(max(version), '')
    INTO ledger_count, ledger_topo
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260903140000';
  IF ledger_count <> 1 OR ledger_topo <> '20260903140000' THEN
    RAISE EXCEPTION 'rollback chapas ma vice: ledger inesperado (count=%, topo=%)', ledger_count, ledger_topo;
  END IF;

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903140000' AND detalhe IS NOT NULL;
  IF recibo_forward <> 1 THEN
    RAISE EXCEPTION 'rollback chapas ma vice: recibo de pre-imagem ausente ou duplicado (%)', recibo_forward;
  END IF;

  SELECT count(*) INTO recibo_rollback
  FROM public.coleta_log WHERE execucao = 'rollback:20260903140000';
  IF recibo_rollback <> 0 THEN
    RAISE EXCEPTION 'rollback chapas ma vice: rollback ja executado';
  END IF;

  SELECT count(*) INTO linhas_na_preimagem
  FROM public.coleta_log r, jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS elem
  WHERE r.execucao = 'migration:20260903140000';
  IF linhas_na_preimagem > 1 THEN
    RAISE EXCEPTION 'rollback chapas ma vice: pre-imagem com % linhas, esperado 0 ou 1', linhas_na_preimagem;
  END IF;
END
$precondition$;

-- ---------------------------------------------------------------------------
-- Restauracao pela pre-imagem, coluna a coluna. Pre-imagem vazia (replay em
-- banco sem a linha) produz zero linhas no FROM e o UPDATE vira no-op, que e o
-- certo.
-- @write tabela=chapas_2026 ref=rollback:20260903140000 chave="migration:20260903140000" campos=vice_sq_candidato,vice_nome_urna,vice_nome_completo,vice_partido_sigla,tse_situacao_vice_codigo,fonte_sha256,snapshot_em
UPDATE public.chapas_2026 ch
SET vice_sq_candidato = pre.vice_sq_candidato,
    vice_nome_urna = pre.vice_nome_urna,
    vice_nome_completo = pre.vice_nome_completo,
    vice_partido_sigla = pre.vice_partido_sigla,
    tse_situacao_vice_codigo = pre.tse_situacao_vice_codigo,
    fonte_sha256 = pre.fonte_sha256,
    snapshot_em = pre.snapshot_em
FROM (
  SELECT elem ->> 'chave' AS chave,
         elem ->> 'vice_sq_candidato' AS vice_sq_candidato,
         elem ->> 'vice_nome_urna' AS vice_nome_urna,
         elem ->> 'vice_nome_completo' AS vice_nome_completo,
         elem ->> 'vice_partido_sigla' AS vice_partido_sigla,
         elem ->> 'tse_situacao_vice_codigo' AS tse_situacao_vice_codigo,
         elem ->> 'fonte_sha256' AS fonte_sha256,
         (elem ->> 'snapshot_em')::timestamptz AS snapshot_em
  FROM public.coleta_log r,
       jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS elem
  WHERE r.execucao = 'migration:20260903140000'
) pre
WHERE ch.chave = pre.chave;

-- ---------------------------------------------------------------------------
-- Recibo do rollback. O recibo forward NAO e apagado: ele e a evidencia de que
-- a troca existiu e de qual era a pre-imagem, e o readback pos-rollback ainda
-- o consulta.
-- @write tabela=coleta_log ref=rollback:20260903140000 campos=fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza
INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
SELECT 'tse-chapas-2026', 'territorio', 'chapas_2026:MA:vice_substituicao',
       CASE WHEN r.volume > 0 THEN 'encontrado' ELSE 'vazio_confirmado' END,
       r.volume,
       'Rollback da 20260903140000: ' || r.volume || ' linha(s) de chapas_2026 devolvidas ao vice e a proveniencia da pre-imagem',
       'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip',
       'rollback:20260903140000',
       'escrita'
FROM public.coleta_log r
WHERE r.execucao = 'migration:20260903140000';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260903140000';

DO $postcondition$
DECLARE
  divergentes integer;
  recibo_forward integer;
  recibo_rollback integer;
  ledger_count integer;
BEGIN
  -- Toda linha da pre-imagem tem que estar de volta aos valores exatos de
  -- origem, nas sete colunas.
  SELECT count(*) INTO divergentes
  FROM public.coleta_log r,
       jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS elem
  JOIN public.chapas_2026 ch ON ch.chave = elem ->> 'chave'
  WHERE r.execucao = 'migration:20260903140000'
    AND (ch.vice_sq_candidato IS DISTINCT FROM elem ->> 'vice_sq_candidato'
      OR ch.vice_nome_urna IS DISTINCT FROM elem ->> 'vice_nome_urna'
      OR ch.vice_nome_completo IS DISTINCT FROM elem ->> 'vice_nome_completo'
      OR ch.vice_partido_sigla IS DISTINCT FROM elem ->> 'vice_partido_sigla'
      OR ch.tse_situacao_vice_codigo IS DISTINCT FROM elem ->> 'tse_situacao_vice_codigo'
      OR ch.fonte_sha256 IS DISTINCT FROM elem ->> 'fonte_sha256'
      OR ch.snapshot_em IS DISTINCT FROM (elem ->> 'snapshot_em')::timestamptz);
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback chapas ma vice: % linha(s) nao voltaram a pre-imagem', divergentes;
  END IF;

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log WHERE execucao = 'migration:20260903140000';
  IF recibo_forward <> 1 THEN
    RAISE EXCEPTION 'rollback chapas ma vice: recibo de pre-imagem sumiu durante o rollback';
  END IF;

  SELECT count(*) INTO recibo_rollback
  FROM public.coleta_log WHERE execucao = 'rollback:20260903140000';
  IF recibo_rollback <> 1 THEN
    RAISE EXCEPTION 'rollback chapas ma vice: recibo de rollback ausente ou duplicado (%)', recibo_rollback;
  END IF;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations WHERE version = '20260903140000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback chapas ma vice: ledger ainda tem a versao';
  END IF;
END
$postcondition$;

COMMIT;
