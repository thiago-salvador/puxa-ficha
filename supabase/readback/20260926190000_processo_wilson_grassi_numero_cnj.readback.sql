BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260926190000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260926190000' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'processo-cnj-20260926 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260926190000';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'processo-cnj-20260926 readback: recibo sem a linha';
  END IF;
  linha := r->'linhas'->0;

  IF (SELECT to_jsonb(p) FROM public.processos p WHERE p.id = (linha->>'id')::uuid)
       IS DISTINCT FROM linha->'after' THEN
    RAISE EXCEPTION 'processo-cnj-20260926 readback: postimagem divergiu';
  END IF;
  IF (linha->'before') - 'numero_processo' - 'status' IS DISTINCT FROM (linha->'after') - 'numero_processo' - 'status'
     OR linha->'before'->>'numero_processo' <> '2254046-86.2021.8.26.0000/50000'
     OR linha->'before'->>'status' <> 'em tramitacao (comunicacao publicada)' THEN
    RAISE EXCEPTION 'processo-cnj-20260926 readback: campo fora da allowlist mudou';
  END IF;

  IF (SELECT count(*) FROM public.processos p
       JOIN public.candidatos c ON c.id = p.candidato_id
       WHERE p.id = '6d93a421-403d-401d-a6ad-a50b03970b81'
         AND c.slug = 'wilson-grassi-junior'
         AND p.numero_processo = '2254046-86.2021.8.26.0000'
         AND p.status = 'arquivado') <> 1 THEN
    RAISE EXCEPTION 'processo-cnj-20260926 readback: numero ou status nao confere';
  END IF;
END
$readback$;
COMMIT;
