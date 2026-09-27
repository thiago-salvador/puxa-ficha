BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926180200') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926180200' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926180200';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926 readback: recibo sem a linha da ficha';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'bio-laudicerio-20260926 readback: postimagem divergiu em %', linha->>'slug';
    END IF;
    IF (linha->'before') - 'biografia' IS DISTINCT FROM (linha->'after') - 'biografia'
       OR md5(linha->'before'->>'biografia') <> 'f65653880f02856125497480c7bbcd23' THEN
      RAISE EXCEPTION 'bio-laudicerio-20260926 readback: campo fora da allowlist ou preimagem inesperada em %', linha->>'slug';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.candidatos c
       WHERE c.slug = 'laudicerio-aguiar'
         AND c.publicavel IS TRUE
         AND md5(c.biografia) = '5aa3e29c19da96a97d8832733ea7a8d8'
         AND c.biografia NOT LIKE '%base oficial de candidaturas do TSE%') <> 1 THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926 readback: biografia nao confere';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'bio-laudicerio-20260926') <> 1 THEN
    RAISE EXCEPTION 'bio-laudicerio-20260926 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
