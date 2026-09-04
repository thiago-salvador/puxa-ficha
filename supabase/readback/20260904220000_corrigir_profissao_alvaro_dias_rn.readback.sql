DO $readback$
DECLARE c public.candidatos%ROWTYPE; r jsonb;
BEGIN
  SELECT * INTO c FROM public.candidatos WHERE slug='alvaro-dias-rn';
  IF NOT FOUND THEN RAISE EXCEPTION 'profissao readback: ficha ausente'; END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260904220000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao='migration:20260904220000' AND volume=1 AND natureza='escrita' AND resultado='encontrado') THEN
    RAISE EXCEPTION 'profissao readback: recibo ausente/duplicado';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260904220000';
  IF c.id::text IS DISTINCT FROM r->>'id' OR c.sq_candidato_2026 IS DISTINCT FROM '200002534442'
     OR c.profissao_declarada IS DISTINCT FROM 'MÉDICO'
     OR c.ultima_atualizacao IS DISTINCT FROM (r->>'aplicado_em')::timestamptz
     OR md5((to_jsonb(c)-'profissao_declarada'-'ultima_atualizacao')::text) IS DISTINCT FROM r->>'campos_preservados_md5'
     OR (r->'antes'->>'profissao_declarada') IS DISTINCT FROM 'SENADOR'
     OR r->>'depois' IS DISTINCT FROM 'MÉDICO' OR r->>'fonte_codigo_ocupacao' IS DISTINCT FROM '111'
     OR r->>'fonte_ano' IS DISTINCT FROM '2026'
     OR r->>'fonte_sha256' IS DISTINCT FROM 'a2e593639affda48223ce179ccdca792da927c729e968bf14de7b80002a586ae' THEN
    RAISE EXCEPTION 'profissao readback: posestado/preimagem/fonte divergiu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos_publico WHERE id=c.id AND profissao_declarada='MÉDICO') THEN
    RAISE EXCEPTION 'profissao readback: view publica divergiu';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20260904220000') <> 1 THEN
    RAISE EXCEPTION 'profissao readback: ledger ausente';
  END IF;
END
$readback$;
