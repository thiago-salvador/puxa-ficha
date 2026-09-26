BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926180100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926180100' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926180100';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 readback: recibo sem a linha da chapa';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(ch) FROM public.chapas_2026 ch WHERE ch.chave = linha->>'chave')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'chapa-laudicerio-20260926 readback: postimagem divergiu em %', linha->>'chave';
    END IF;
    IF (linha->'before') - 'identidade_status' IS DISTINCT FROM (linha->'after') - 'identidade_status' THEN
      RAISE EXCEPTION 'chapa-laudicerio-20260926 readback: campo fora da allowlist mudou em %', linha->>'chave';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.chapas_2026 ch
       WHERE ch.titular_candidato_id = '9f4c6003-20a5-486e-9c7a-90d48d4cdcd0'
         AND ch.identidade_status = 'confirmada'
         AND ch.chave = '2026:MT:laudicerio-aguiar-machado:duplicidade:110002554073:110002554503'
         AND ch.titular_sq_candidato = '110002554073'
         AND ch.vice_sq_candidato = '110002554503') <> 1
     OR (SELECT count(*) FROM public.chapas_2026 ch
       WHERE ch.chave = '2026:MT:laudicerio-aguiar-machado:duplicidade:110002553937:110002553938'
         AND ch.identidade_status = 'duplicidade_oficial') <> 1 THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 readback: chapas nao conferem';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'chapa-laudicerio-20260926') <> 1 THEN
    RAISE EXCEPTION 'chapa-laudicerio-20260926 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
