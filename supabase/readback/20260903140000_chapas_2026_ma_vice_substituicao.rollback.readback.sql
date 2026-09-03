-- Readback pos-rollback da 20260903140000.
--
-- Prova o inverso do readback forward: a versao saiu do ledger, a linha voltou
-- exatamente aos valores da pre-imagem nas sete colunas, o recibo de rollback
-- existe e o resto da tabela continua igual ao "antes" que o recibo forward
-- guardou.
DO $readback$
DECLARE
  ledger_count integer;
  divergentes integer;
  recibo_forward integer;
  recibo_rollback integer;
  antes_count bigint;
  antes_digest text;
  agora_count bigint;
  agora_digest text;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations WHERE version = '20260903140000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback chapas ma vice: versao ainda no ledger';
  END IF;

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903140000' AND detalhe IS NOT NULL;
  IF recibo_forward <> 1 THEN
    RAISE EXCEPTION 'rollback readback chapas ma vice: recibo de pre-imagem ausente ou duplicado (%)', recibo_forward;
  END IF;

  SELECT count(*) INTO recibo_rollback
  FROM public.coleta_log WHERE execucao = 'rollback:20260903140000';
  IF recibo_rollback <> 1 THEN
    RAISE EXCEPTION 'rollback readback chapas ma vice: recibo de rollback ausente ou duplicado (%)', recibo_rollback;
  END IF;

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
    RAISE EXCEPTION 'rollback readback chapas ma vice: % linha(s) diferentes da pre-imagem', divergentes;
  END IF;

  SELECT (r.detalhe::jsonb ->> 'outras_count')::bigint,
         r.detalhe::jsonb ->> 'outras_digest'
    INTO antes_count, antes_digest
  FROM public.coleta_log r
  WHERE r.execucao = 'migration:20260903140000';

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave), ''))
    INTO agora_count, agora_digest
  FROM public.chapas_2026 ch
  WHERE ch.chave <> '2026:MA:reginaldo-lima-brauno';

  IF agora_count <> antes_count OR agora_digest IS DISTINCT FROM antes_digest THEN
    RAISE EXCEPTION 'rollback readback chapas ma vice: outras linhas divergem do recibo (% -> %)', antes_count, agora_count;
  END IF;
END
$readback$;
