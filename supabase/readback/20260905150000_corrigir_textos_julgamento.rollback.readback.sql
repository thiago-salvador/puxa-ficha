DO $readback$
DECLARE r jsonb; a jsonb; alvos jsonb; atual text;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260905150000')<>1 THEN RAISE EXCEPTION 'textos julgamento: recibo ausente/duplicado'; END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260905150000' AND volume=188 AND natureza='escrita' AND resultado='encontrado';
  IF r IS NULL OR encode(sha256(convert_to(r->>'manifesto','UTF8')),'hex') IS DISTINCT FROM '1209862f1302a68e22890aee146f86efae9ce8f707ad84775ed18d7d1dffc8ac' THEN
    RAISE EXCEPTION 'textos julgamento: manifesto do recibo adulterado';
  END IF;
  alvos := (r->>'manifesto')::jsonb;
  IF jsonb_array_length(alvos)<>188 OR r->'preimagem' IS DISTINCT FROM
    (SELECT jsonb_agg(jsonb_build_object('tabela',x->>'tabela','id',x->>'id','valor',x->>'antes')) FROM jsonb_array_elements(alvos) x) THEN
    RAISE EXCEPTION 'textos julgamento: preimagem adulterada';
  END IF;
  IF EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260905150000')
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='rollback:20260905150000' AND volume=188 AND natureza='escrita' AND resultado='encontrado' AND detalhe::jsonb=r)<>1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='rollback:20260905150000')<>1 THEN RAISE EXCEPTION 'textos julgamento: rollback recibo/ledger divergiu'; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(alvos) LOOP
    IF a->>'tabela'='candidatos' THEN SELECT biografia INTO atual FROM public.candidatos WHERE id=(a->>'id')::uuid AND slug=a->>'slug';
    ELSE SELECT observacoes INTO atual FROM public.historico_politico WHERE id=(a->>'id')::uuid AND candidato_id=(a->>'candidato_id')::uuid;
    END IF;
    IF NOT FOUND OR atual IS DISTINCT FROM a->>'antes' THEN RAISE EXCEPTION 'textos julgamento: rollback campo divergiu %',a->>'id'; END IF;
  END LOOP;
END
$readback$;
