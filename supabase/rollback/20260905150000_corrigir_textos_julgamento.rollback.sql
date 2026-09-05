BEGIN;
DO $rollback$
DECLARE r jsonb; a jsonb; alvos jsonb; atual text; quantidade integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260905150000' THEN RAISE EXCEPTION 'textos julgamento: ledger posterior/inesperado'; END IF;
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
  IF EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao='rollback:20260905150000') THEN RAISE EXCEPTION 'textos julgamento: rollback ja executado'; END IF;
  PERFORM 1 FROM public.candidatos WHERE id IN (SELECT (x->>'candidato_id')::uuid FROM jsonb_array_elements(alvos) x) ORDER BY id FOR UPDATE;
  PERFORM 1 FROM public.historico_politico WHERE id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(alvos) x WHERE x->>'tabela'='historico_politico') ORDER BY id FOR UPDATE;
  -- CAS só do campo alvo: mudanças legítimas em outras colunas são preservadas.
  FOR a IN SELECT value FROM jsonb_array_elements(alvos) LOOP
    IF a->>'tabela'='candidatos' THEN SELECT biografia INTO atual FROM public.candidatos WHERE id=(a->>'id')::uuid AND slug=a->>'slug';
    ELSE SELECT observacoes INTO atual FROM public.historico_politico WHERE id=(a->>'id')::uuid AND candidato_id=(a->>'candidato_id')::uuid;
    END IF;
    IF NOT FOUND OR atual IS DISTINCT FROM a->>'depois' THEN RAISE EXCEPTION 'textos julgamento: mudanca posterior no campo %',a->>'id'; END IF;
  END LOOP;
  FOR a IN SELECT value FROM jsonb_array_elements(alvos) LOOP
    IF a->>'tabela'='candidatos' THEN
      UPDATE public.candidatos SET biografia=a->>'antes' WHERE id=(a->>'id')::uuid AND biografia=a->>'depois';
    ELSE
      UPDATE public.historico_politico SET observacoes=a->>'antes' WHERE id=(a->>'id')::uuid AND observacoes=a->>'depois';
    END IF;
    GET DIAGNOSTICS quantidade = ROW_COUNT;
    IF quantidade<>1 THEN RAISE EXCEPTION 'textos julgamento: rollback cardinalidade'; END IF;
  END LOOP;
  INSERT INTO public.coleta_log(fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  VALUES('textos-julgamento','global','candidatos.biografia+historico_politico.observacoes','encontrado',188,r::text,
    'https://dadosabertos.tse.jus.br/dataset/candidatos-2026','rollback:20260905150000','escrita');
  DELETE FROM supabase_migrations.schema_migrations WHERE version='20260905150000';
END
$rollback$;
COMMIT;
