\set ON_ERROR_STOP on
SET default_transaction_read_only=on;

DO $assert$
DECLARE
  ledger integer;
  remaining integer;
  receipts integer;
  pair_receipts integer;
  old_receipts integer;
  mapped integer;
  unresolved integer;
  bad_receipts integer;
  pair_details_md5 text;
  global_details integer;
BEGIN
  SELECT count(*) INTO ledger FROM supabase_migrations.schema_migrations WHERE version='20260830151500';
  SELECT count(*) INTO remaining FROM public.votos_candidato;
  SELECT count(*),count(*) FILTER(WHERE escopo='candidato') INTO receipts,pair_receipts
    FROM public.coleta_log WHERE execucao='migration:20260830151500';
  SELECT count(*) INTO old_receipts FROM public.coleta_log
    WHERE fonte='destaques-votacoes' AND execucao IS DISTINCT FROM 'migration:20260830151500';
  SELECT count(*) INTO mapped FROM public.votacoes_chave
    WHERE (id='e87490ab-2d4a-48ae-b3f8-dcaf2a171ed4'::uuid AND fonte='camara' AND votacao_id_api='2270789-73')
       OR (id='c7a9aef3-9943-47c7-8c30-9659626bace8'::uuid AND fonte='camara' AND votacao_id_api='2357053-47')
       OR (id='6a6407e5-6164-452b-acc3-bf173ed73e7f'::uuid AND fonte='camara' AND votacao_id_api='2196833-326');
  SELECT count(*) INTO unresolved FROM public.votacoes_chave
    WHERE id IN ('53e42d37-01ac-4713-80a6-3bb83bd8d3ad', '7402411d-1e7f-4122-acbb-50d060aa0856') AND fonte IS NULL AND votacao_id_api IS NULL;
  SELECT count(*) INTO bad_receipts FROM public.coleta_log
    WHERE execucao='migration:20260830151500' AND (
      detalhe NOT LIKE 'provenance_v1:%'
      OR executado_em IS DISTINCT FROM '2026-08-30T18:00:49.873Z'::timestamptz
      OR natureza IS DISTINCT FROM 'coleta'
      OR resultado NOT IN ('encontrado','sem_achado_no_escopo')
      OR (escopo='candidato' AND (url IS NULL OR candidato_id IS NULL))
    );
  SELECT md5(coalesce(string_agg(detalhe,'' ORDER BY alvo),'')) INTO pair_details_md5
    FROM public.coleta_log WHERE execucao='migration:20260830151500' AND escopo='candidato';
  SELECT count(*) INTO global_details FROM public.coleta_log
    WHERE execucao='migration:20260830151500' AND escopo='global' AND detalhe='provenance_v1:{"contract_version":1,"source_id":"destaques-votacoes","comparison_sha256":"57d945379a1d739be747edb87658060af5593d6895b74fa9af74f574d93913ed","execution_ids":["destaques-votacoes:20260830-run-c","destaques-votacoes:20260830-run-d"],"raw_payload_count":93,"pair_count":154,"confirmed_pair_count":152,"removed_pair_count":2,"evidence_path":"QA/evidencias/2026-08-30-destaques-votacoes","synthetic_history_preserved":181}';
  IF ledger<>1 OR remaining<>152 OR receipts<>155 OR pair_receipts<>154 OR old_receipts<>181
     OR mapped<>3 OR unresolved<>2 OR bad_receipts<>0
     OR pair_details_md5<>'84ced051913df8483ea76220ab612dca' OR global_details<>1 THEN
    RAISE EXCEPTION 'readback destaques freshness falhou ledger=% remaining=% receipts=%/% old=% mapped=% unresolved=% bad=% digest=% global=%',
      ledger,remaining,receipts,pair_receipts,old_receipts,mapped,unresolved,bad_receipts,pair_details_md5,global_details;
  END IF;
END
$assert$;

SELECT
  (SELECT count(*) FROM public.votos_candidato) AS pairs,
  (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260830151500') AS receipts,
  (SELECT count(*) FROM public.coleta_log WHERE fonte='destaques-votacoes' AND execucao IS DISTINCT FROM 'migration:20260830151500') AS archived_history,
  (SELECT count(*) FROM public.votacoes_chave WHERE fonte='camara' AND votacao_id_api IN ('2270789-73','2357053-47','2196833-326')) AS mapped,
  (SELECT count(*) FROM public.votacoes_chave WHERE id IN ('53e42d37-01ac-4713-80a6-3bb83bd8d3ad', '7402411d-1e7f-4122-acbb-50d060aa0856') AND fonte IS NULL AND votacao_id_api IS NULL) AS source_gaps;
