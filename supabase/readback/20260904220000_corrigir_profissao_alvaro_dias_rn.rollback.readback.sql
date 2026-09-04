DO $readback$
DECLARE c public.candidatos%ROWTYPE; r jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260904220000')
     OR (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260903220000'
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='rollback:20260904220000') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260904220000') <> 1 THEN
    RAISE EXCEPTION 'profissao rollback readback: ledger/recibo invalido';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260904220000';
  SELECT * INTO c FROM public.candidatos WHERE id=(r->>'id')::uuid AND slug='alvaro-dias-rn';
  IF NOT FOUND OR c.profissao_declarada IS DISTINCT FROM r->'antes'->>'profissao_declarada'
     OR c.ultima_atualizacao IS DISTINCT FROM (r->'antes'->>'ultima_atualizacao')::timestamptz
     OR md5((to_jsonb(c)-'profissao_declarada'-'ultima_atualizacao')::text) IS DISTINCT FROM r->>'campos_preservados_md5'
     OR NOT EXISTS (SELECT 1 FROM public.candidatos_publico WHERE id=c.id AND profissao_declarada=c.profissao_declarada) THEN
    RAISE EXCEPTION 'profissao rollback readback: preimagem/view divergiu';
  END IF;
END
$readback$;
