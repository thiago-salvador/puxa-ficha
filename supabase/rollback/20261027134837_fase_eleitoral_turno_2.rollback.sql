-- Preservador: devolve candidaturas_fase_2026 à preimagem integral do recibo
-- `migration:20261027134837`, com CAS da postimagem. Linhas voltam a segundo_turno.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidaturas_fase_2026 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20261027134837' THEN
    RAISE EXCEPTION 'fase-turno-2-20261027134837 rollback: ledger divergiu (rollback só vale com esta migration no topo)';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20261027134837') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20261027134837') THEN
    RAISE EXCEPTION 'fase-turno-2-20261027134837 rollback: recibo inválido ou rollback repetido';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20261027134837';
  IF jsonb_array_length(r->'linhas') <> 14 THEN
    RAISE EXCEPTION 'fase-turno-2-20261027134837 rollback: recibo sem as 14 linhas';
  END IF;
  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(f) FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'fase-turno-2-20261027134837 rollback: % não está na postimagem', linha->>'slug';
    END IF;
    IF linha->'before' IS NULL OR jsonb_typeof(linha->'before') = 'null' THEN
      DELETE FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid;
    ELSE
      UPDATE public.candidaturas_fase_2026 f
      SET fase_eleitoral = linha->'before'->>'fase_eleitoral',
          fase_turno = (linha->'before'->>'fase_turno')::smallint,
          atualizacao_encerrada_em = (linha->'before'->>'atualizacao_encerrada_em')::date,
          situacao_tse = linha->'before'->>'situacao_tse',
          fonte_url = linha->'before'->>'fonte_url',
          fonte_sha256 = linha->'before'->>'fonte_sha256',
          migration_version = linha->'before'->>'migration_version',
          registrado_em = (linha->'before'->>'registrado_em')::timestamptz
      WHERE f.candidato_id = (linha->>'candidato_id')::uuid;
    END IF;
    GET DIAGNOSTICS afetadas = ROW_COUNT;
    IF afetadas <> 1 THEN
      RAISE EXCEPTION 'fase-turno-2-20261027134837 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'slug';
    END IF;
  END LOOP;

  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'tse-resultados-2026', 'global', 'candidaturas_fase_2026', 'encontrado', 14,
         jsonb_build_object('resumo', 'Rollback da migration 20261027134837: fase eleitoral de 14 candidatura(s) volta ao estado anterior.',
                            'plano_sha256', '47dd60f72855baeab799c8388034a47811c0afce9d2e5941da4d8e4e103ad6a2')::text,
         l.url, 'rollback:20261027134837', 'escrita'
  FROM public.coleta_log l WHERE l.execucao = 'migration:20261027134837';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261027134837';
END
$rollback$;
COMMIT;
