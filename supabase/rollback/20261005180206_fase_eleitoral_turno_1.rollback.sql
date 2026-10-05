-- Preservador: devolve candidaturas_fase_2026 à preimagem integral do recibo
-- `migration:20261005180206`, com CAS da postimagem. Linhas inseridas saem (em_disputa = sem linha).
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.candidaturas_fase_2026 IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; linha jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20261005180206' THEN
    RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback: ledger divergiu (rollback só vale com esta migration no topo)';
  END IF;
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20261005180206') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20261005180206') THEN
    RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback: recibo inválido ou rollback repetido';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20261005180206';
  IF jsonb_array_length(r->'linhas') <> 512 THEN
    RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback: recibo sem as 512 linhas';
  END IF;
  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(f) FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback: % não está na postimagem', linha->>'slug';
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
      RAISE EXCEPTION 'fase-turno-1-20261005180206 rollback: escrita esperada=1 atual=% em %', afetadas, linha->>'slug';
    END IF;
  END LOOP;

  INSERT INTO public.coleta_log (fonte, escopo, alvo, resultado, volume, detalhe, url, execucao, natureza)
  SELECT 'tse-resultados-2026', 'global', 'candidaturas_fase_2026', 'encontrado', 512,
         jsonb_build_object('resumo', 'Rollback da migration 20261005180206: fase eleitoral de 512 candidatura(s) volta ao estado anterior.',
                            'plano_sha256', '110db31e0496bd35110299a2b73dbdf380beff78df1541a5ddcb699c761b6fdf')::text,
         l.url, 'rollback:20261005180206', 'escrita'
  FROM public.coleta_log l WHERE l.execucao = 'migration:20261005180206';

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261005180206';
END
$rollback$;
COMMIT;
