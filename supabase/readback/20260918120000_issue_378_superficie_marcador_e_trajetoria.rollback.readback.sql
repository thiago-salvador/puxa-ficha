BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260918120000') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260918120000') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260918120000') THEN
    RAISE EXCEPTION 'issue-378 rollback readback: recibos ou ledger divergiram';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260918120000';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao = 'rollback:20260918120000';

  IF (SELECT to_jsonb(f) FROM public.financiamento f
       WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7') IS DISTINCT FROM b->'financiamento'
     OR b->'financiamento' IS DISTINCT FROM r->'before'->'financiamento' THEN
    RAISE EXCEPTION 'issue-378 rollback readback: financiamento nao voltou a preimagem';
  END IF;

  IF (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ano, m.id)
        FROM public.mudancas_partido m
        JOIN public.candidatos c ON c.id = m.candidato_id
       WHERE c.slug = 'andre-do-prado') IS DISTINCT FROM b->'trajetoria'
     OR EXISTS (
       SELECT 1 FROM public.mudancas_partido m
       JOIN public.candidatos c ON c.id = m.candidato_id
       WHERE c.slug = 'andre-do-prado' AND m.despublicado_em IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'issue-378 rollback readback: trajetoria nao voltou ao ar';
  END IF;
END
$readback$;
COMMIT;
