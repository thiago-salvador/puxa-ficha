BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260917000100')<>1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='rollback:20260917000100')<>1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260917000100') THEN
    RAISE EXCEPTION 'godeiro rollback readback: recibos/ledger divergiu';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260917000100';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao='rollback:20260917000100';
  IF (SELECT to_jsonb(x) FROM public.candidatos x WHERE id='d45f1947-73a7-4292-9955-7e57927032f0') IS DISTINCT FROM b->'candidato'
     OR b->'candidato'->'publicavel' IS DISTINCT FROM 'false'::jsonb
     OR b->'candidato'->>'status' IS DISTINCT FROM 'removido'
     OR (SELECT to_jsonb(x) FROM public.patrimonio x WHERE id='7d88a5ae-23ae-42cf-8285-c5499b489dd7') IS DISTINCT FROM b->'patrimonio'
     OR b->'patrimonio'->>'despublicacao_motivo' IS DISTINCT FROM 'Rollback da migration 20260917000100'
     OR (SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='250e9ca4-b101-4ec4-9835-bff18c596061') IS DISTINCT FROM b->'chapa'
     OR b->'chapa'->'titular_candidato_id' IS DISTINCT FROM 'null'::jsonb
     OR jsonb_build_object(
       'candidatos',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.candidatos x WHERE id<>'d45f1947-73a7-4292-9955-7e57927032f0'),
       'patrimonio',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.patrimonio x WHERE id<>'7d88a5ae-23ae-42cf-8285-c5499b489dd7'),
       'chapa_outras',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.chapas_2026 x WHERE id<>'250e9ca4-b101-4ec4-9835-bff18c596061')
     ) IS DISTINCT FROM jsonb_build_object(
       'candidatos',r->'before'->'candidatos',
       'patrimonio',r->'before'->'patrimonio',
       'chapa_outras',r->'before'->'chapa_outras'
     ) THEN
    RAISE EXCEPTION 'godeiro rollback readback: preservação divergiu';
  END IF;
END
$readback$;
COMMIT;
