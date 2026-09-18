BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260918120100') <> 1
     OR (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20260918120100') <> 1
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260918120100') THEN
    RAISE EXCEPTION 'issue-383 rollback readback: recibos ou ledger divergiram';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260918120100';
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao = 'rollback:20260918120100';

  IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = 'gustavo-henrique')
       IS DISTINCT FROM b->'candidato'
     OR b->'candidato'->>'situacao_candidatura' IS DISTINCT FROM 'indeferido com recurso'
     OR b->'candidato'->>'status' IS DISTINCT FROM 'candidato'
     OR b->'candidato'->'publicavel' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'issue-383 rollback readback: ficha nao voltou ao estado anterior';
  END IF;

  IF EXISTS (SELECT 1 FROM public.identidade_timeline_quarentena_snapshot
             WHERE migration_version = 'issue-383-gustavo-henrique-terminal') THEN
    RAISE EXCEPTION 'issue-383 rollback readback: snapshot de quarentena nao foi removido';
  END IF;
END
$readback$;
COMMIT;
