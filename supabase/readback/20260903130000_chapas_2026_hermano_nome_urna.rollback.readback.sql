-- Readback pos-rollback da 20260903130000.
--
-- Prova o inverso do readback forward: a versao saiu do ledger, a linha voltou
-- exatamente ao valor da pre-imagem, o recibo de rollback existe e o resto da
-- tabela continua igual ao "antes" que o recibo forward guardou.
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
  FROM supabase_migrations.schema_migrations WHERE version = '20260903130000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback chapas hermano: versao ainda no ledger';
  END IF;

  SELECT count(*) INTO recibo_forward
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903130000' AND detalhe IS NOT NULL;
  IF recibo_forward <> 1 THEN
    RAISE EXCEPTION 'rollback readback chapas hermano: recibo de pre-imagem ausente ou duplicado (%)', recibo_forward;
  END IF;

  SELECT count(*) INTO recibo_rollback
  FROM public.coleta_log WHERE execucao = 'rollback:20260903130000';
  IF recibo_rollback <> 1 THEN
    RAISE EXCEPTION 'rollback readback chapas hermano: recibo de rollback ausente ou duplicado (%)', recibo_rollback;
  END IF;

  SELECT count(*) INTO divergentes
  FROM public.coleta_log r,
       jsonb_array_elements(r.detalhe::jsonb -> 'linhas') AS elem
  JOIN public.chapas_2026 ch ON ch.chave = elem ->> 'chave'
  WHERE r.execucao = 'migration:20260903130000'
    AND ch.vice_nome_urna IS DISTINCT FROM elem ->> 'vice_nome_urna';
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback readback chapas hermano: % linha(s) diferentes da pre-imagem', divergentes;
  END IF;

  SELECT (r.detalhe::jsonb ->> 'outras_count')::bigint,
         r.detalhe::jsonb ->> 'outras_digest'
    INTO antes_count, antes_digest
  FROM public.coleta_log r
  WHERE r.execucao = 'migration:20260903130000';

  SELECT count(*)::bigint,
         md5(coalesce(string_agg(row_to_json(ch)::text, '' ORDER BY ch.chave), ''))
    INTO agora_count, agora_digest
  FROM public.chapas_2026 ch
  WHERE ch.chave <> '2026:RN:allyson-leandro-bezerra-silva';

  IF agora_count <> antes_count OR agora_digest IS DISTINCT FROM antes_digest THEN
    RAISE EXCEPTION 'rollback readback chapas hermano: outras linhas divergem do recibo (% -> %)', antes_count, agora_count;
  END IF;
END
$readback$;
