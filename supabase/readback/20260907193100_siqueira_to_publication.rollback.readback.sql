BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao='migration:20260907193100')<>1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao='rollback:20260907193100')<>1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260907193100') THEN
    RAISE EXCEPTION 'siqueira rollback readback: recibos/ledger divergiu';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao='migration:20260907193100';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao='rollback:20260907193100';
  IF (SELECT to_jsonb(x) FROM public.candidatos x WHERE id='1d5c69c3-4a4e-4f8f-9796-aa2248775e80') IS DISTINCT FROM b->'candidato'
     OR b->'candidato'->'publicavel' IS DISTINCT FROM 'false'::jsonb
     OR b->'candidato'->>'status' IS DISTINCT FROM 'removido'
     OR (SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE id='a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5') IS DISTINCT FROM r->'after'->'chapa'
     OR (SELECT to_jsonb(x) FROM public.historico_politico x WHERE id='6db89cf8-3e4f-4141-ac0b-de1b5a4bd32a') IS DISTINCT FROM r->'after'->'historico'
     OR (SELECT to_jsonb(x) FROM public.patrimonio_ausencia_oficial x WHERE id='7c5c3d27-acee-4efd-be9f-036a16a3c460') IS DISTINCT FROM r->'after'->'ausencia'
     OR jsonb_build_object(
       'candidatos',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.candidatos x WHERE id<>'1d5c69c3-4a4e-4f8f-9796-aa2248775e80'),
       'chapas',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.chapas_2026 x WHERE id<>'a2d296dd-dde7-4791-8a00-1a6cf6e9cfe5'),
       'historico',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.historico_politico x WHERE id<>'6db89cf8-3e4f-4141-ac0b-de1b5a4bd32a'),
       'ausencias',(SELECT md5(coalesce(string_agg(to_jsonb(x)::text,'' ORDER BY id),'')) FROM public.patrimonio_ausencia_oficial x WHERE id<>'7c5c3d27-acee-4efd-be9f-036a16a3c460')
     ) IS DISTINCT FROM r->'before' THEN
    RAISE EXCEPTION 'siqueira rollback readback: preservação divergiu';
  END IF;
END
$readback$;
COMMIT;
