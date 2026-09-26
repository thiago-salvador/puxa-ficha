BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; b jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926180000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926180000' AND volume = 2 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'situacao-gov-20260926 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926180000';
  IF jsonb_array_length(r->'linhas') <> 2 THEN
    RAISE EXCEPTION 'situacao-gov-20260926 readback: recibo sem as duas linhas';
  END IF;

  -- A 20260926180200 muda só a biografia de laudicerio-aguiar depois desta
  -- migration. A postimagem é conferida sem biografia, e a biografia só pode
  -- ser a desta postimagem ou a gravada no recibo da 20260926180200.
  SELECT detalhe::jsonb INTO b FROM public.coleta_log WHERE execucao = 'migration:20260926180200';
  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) - 'biografia' FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM (linha->'after') - 'biografia'
       OR NOT EXISTS (SELECT 1 FROM public.candidatos c WHERE c.slug = linha->>'slug'
         AND (c.biografia IS NOT DISTINCT FROM linha->'after'->>'biografia'
              OR (linha->>'slug' = 'laudicerio-aguiar'
                  AND c.biografia = (SELECT x->'after'->>'biografia' FROM jsonb_array_elements(b->'linhas') x
                                     WHERE x->>'slug' = 'laudicerio-aguiar')))) THEN
      RAISE EXCEPTION 'situacao-gov-20260926 readback: postimagem divergiu em %', linha->>'slug';
    END IF;
    IF (linha->'before') - 'situacao_candidatura' - 'ultima_atualizacao'
         IS DISTINCT FROM (linha->'after') - 'situacao_candidatura' - 'ultima_atualizacao' THEN
      RAISE EXCEPTION 'situacao-gov-20260926 readback: campo fora da allowlist mudou em %', linha->>'slug';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE ((c.slug = 'godeiro-linharess' AND c.sq_candidato_2026 = '200002554482')
           OR (c.slug = 'laudicerio-aguiar' AND c.sq_candidato_2026 = '110002554073'))
         AND c.situacao_candidatura = 'deferido'
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE
         AND c.ultima_atualizacao = timestamptz '2026-09-26T17:39:58Z') <> 2 THEN
    RAISE EXCEPTION 'situacao-gov-20260926 readback: situacao nao confere';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'situacao-gov-20260926') <> 2 THEN
    RAISE EXCEPTION 'situacao-gov-20260926 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
