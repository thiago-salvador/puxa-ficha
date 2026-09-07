DO $readback$
DECLARE r jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260907180000') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260907180000') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260907180000') THEN
    RAISE EXCEPTION 'danilo rollback readback: recibos/ledger inválidos';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260907180000';
  IF (SELECT to_jsonb(x) FROM public.candidatos x WHERE id = 'ce3b18ad-dcc9-4275-b831-66ee24422714') IS DISTINCT FROM r->'candidato'
     OR (SELECT to_jsonb(x) FROM public.chapas_2026 x WHERE chave = '2026:GO:danilo-pinheiro-evangelista-da-silva') IS DISTINCT FROM r->'chapa'
     OR r->>'outros_candidatos_digest' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.id), '')) FROM public.candidatos x WHERE id <> 'ce3b18ad-dcc9-4275-b831-66ee24422714')
     OR r->>'outras_chapas_digest' IS DISTINCT FROM (SELECT md5(coalesce(string_agg(to_jsonb(x)::text, '' ORDER BY x.chave), '')) FROM public.chapas_2026 x WHERE chave <> '2026:GO:danilo-pinheiro-evangelista-da-silva') THEN
    RAISE EXCEPTION 'danilo rollback readback: restauração/invariância divergiu';
  END IF;
END
$readback$;
