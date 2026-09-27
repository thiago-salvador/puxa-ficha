BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926224500') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926224500' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'partido-mourao-20260926 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926224500';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'partido-mourao-20260926 readback: recibo sem a linha';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'partido-mourao-20260926 readback: postimagem divergiu em %', linha->>'slug';
    END IF;
    IF (linha->'before') - 'partido_sigla' - 'partido_atual' - 'cargo_atual' - 'ultima_atualizacao'
         IS DISTINCT FROM (linha->'after') - 'partido_sigla' - 'partido_atual' - 'cargo_atual' - 'ultima_atualizacao' THEN
      RAISE EXCEPTION 'partido-mourao-20260926 readback: campo fora da allowlist mudou em %', linha->>'slug';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'tse-2026-270002544629'
         AND c.sq_candidato_2026 = '270002544629'
         AND c.partido_sigla = 'PT'
         AND c.partido_atual = 'PT'
         AND c.cargo_atual IS NULL
         AND c.status = 'candidato'
         AND c.publicavel IS TRUE
         AND c.ultima_atualizacao = timestamptz '2026-09-26T22:45:00Z') <> 1 THEN
    RAISE EXCEPTION 'partido-mourao-20260926 readback: partido ou cargo nao confere';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'partido-mourao-20260926') <> 1 THEN
    RAISE EXCEPTION 'partido-mourao-20260926 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
