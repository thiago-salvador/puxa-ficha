DO $readback$
DECLARE r jsonb; a jsonb; alvos jsonb; c public.candidatos%ROWTYPE; h public.historico_politico%ROWTYPE; atual text;
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
  IF EXISTS(SELECT 1 FROM public.coleta_log WHERE execucao='rollback:20260905150000') THEN RAISE EXCEPTION 'textos julgamento: rollback existente'; END IF;
  FOR a IN SELECT value FROM jsonb_array_elements(alvos) LOOP
    SELECT * INTO c FROM public.candidatos WHERE id=(a->>'candidato_id')::uuid;
    IF NOT FOUND OR c.slug IS DISTINCT FROM a->>'slug' OR c.nome_completo IS DISTINCT FROM a->>'nome_completo'
       OR c.sq_candidato_2026 IS DISTINCT FROM a->>'sq' OR c.situacao_candidatura IS DISTINCT FROM a->>'situacao'
       OR c.cargo_disputado IS DISTINCT FROM a->>'cargo_candidato' OR c.estado IS DISTINCT FROM a->>'uf_candidato'
       OR NOT EXISTS (SELECT 1 FROM public.candidatos_publico p WHERE p.id=c.id) THEN
      RAISE EXCEPTION 'textos julgamento: identidade/situacao/publicacao divergiu para %',a->>'slug';
    END IF;
    IF a->>'tabela'='candidatos' THEN
      IF a->>'id' IS DISTINCT FROM c.id::text THEN RAISE EXCEPTION 'textos julgamento: id da bio divergiu'; END IF;
      atual := c.biografia;
    ELSIF a->>'tabela'='historico_politico' THEN
      SELECT * INTO h FROM public.historico_politico WHERE id=(a->>'id')::uuid;
      IF NOT FOUND OR h.candidato_id IS DISTINCT FROM c.id OR h.periodo_inicio IS DISTINCT FROM (a->>'ano')::integer
         OR h.periodo_fim IS DISTINCT FROM (a->>'fim')::integer OR h.tipo_evento IS DISTINCT FROM a->>'tipo'
         OR h.cargo IS DISTINCT FROM a->>'cargo' OR h.estado IS DISTINCT FROM a->>'estado'
         OR h.proveniencia IS DISTINCT FROM a->>'proveniencia' OR h.despublicado_em IS NOT NULL THEN
        RAISE EXCEPTION 'textos julgamento: historico divergiu para %',a->>'id';
      END IF;
      atual := h.observacoes;
    ELSE RAISE EXCEPTION 'textos julgamento: tabela nao autorizada';
    END IF;
    IF atual IS DISTINCT FROM a->>'depois' THEN RAISE EXCEPTION 'textos julgamento: readback campo divergiu %',a->>'id'; END IF;
    IF a->>'tabela'='candidatos' AND NOT EXISTS(SELECT 1 FROM public.candidatos_publico p WHERE p.id=c.id AND p.biografia=a->>'depois') THEN RAISE EXCEPTION 'textos julgamento: view publica divergiu'; END IF;
  END LOOP;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260905150000')<>1 THEN RAISE EXCEPTION 'textos julgamento: ledger ausente'; END IF;
END
$readback$;
