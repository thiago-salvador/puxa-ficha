BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20261005180206') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20261005180206' AND volume = 512 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'fase-turno-1-20261005180206 readback: recibo ausente ou inválido';
  END IF;
  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20261005180206';
  IF jsonb_array_length(r->'linhas') <> 512 OR r->>'plano_sha256' IS DISTINCT FROM '110db31e0496bd35110299a2b73dbdf380beff78df1541a5ddcb699c761b6fdf' THEN
    RAISE EXCEPTION 'fase-turno-1-20261005180206 readback: recibo não corresponde ao plano';
  END IF;
  -- Linha regravada por uma migration de resultado POSTERIOR (2º turno) é
  -- conferida pelo readback dela; aqui só as que ainda são desta versão.
  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF EXISTS (SELECT 1 FROM public.candidaturas_fase_2026 f
                WHERE f.candidato_id = (linha->>'candidato_id')::uuid AND f.migration_version = '20261005180206')
       AND (SELECT to_jsonb(f) FROM public.candidaturas_fase_2026 f WHERE f.candidato_id = (linha->>'candidato_id')::uuid)
           IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'fase-turno-1-20261005180206 readback: postimagem divergiu em %', linha->>'slug';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.candidaturas_fase_2026 f
                    WHERE f.candidato_id = (linha->>'candidato_id')::uuid
                      AND (f.migration_version = '20261005180206' OR f.migration_version > '20261005180206')) THEN
      RAISE EXCEPTION 'fase-turno-1-20261005180206 readback: fase ausente em %', linha->>'slug';
    END IF;
  END LOOP;
END
$readback$;
COMMIT;
