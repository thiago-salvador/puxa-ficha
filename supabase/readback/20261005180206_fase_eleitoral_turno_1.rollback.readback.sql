BEGIN READ ONLY;
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261005180206') THEN
    RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback readback: versão continua no ledger';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'rollback:20261005180206') <> 1 THEN
    RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback readback: recibo do rollback ausente';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20261005180206';
  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF linha->'before' IS NULL OR jsonb_typeof(linha->'before') = 'null' THEN
      IF EXISTS (SELECT 1 FROM public.candidaturas_fase_2026 WHERE candidato_id = (linha->>'candidato_id')::uuid) THEN
        RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback readback: % continua com fase gravada', linha->>'slug';
      END IF;
    ELSIF (SELECT to_jsonb(f) FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid)
          IS DISTINCT FROM linha->'before' THEN
      RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback readback: % não voltou à preimagem', linha->>'slug';
    END IF;
  END LOOP;
END
$readback$;
COMMIT;
