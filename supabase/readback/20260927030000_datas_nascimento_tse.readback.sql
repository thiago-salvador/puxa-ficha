BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260927030000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260927030000' AND volume = 5 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260927030000';
  IF jsonb_array_length(r->'linhas') <> 5 THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 readback: recibo sem as cinco fichas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT jsonb_build_object('data_nascimento', to_jsonb(c)->'data_nascimento', 'biografia', to_jsonb(c)->'biografia', 'naturalidade', to_jsonb(c)->'naturalidade')
          FROM public.candidatos c WHERE c.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'nascimento-tse-20260926 readback: postimagem divergiu em %', linha->>'slug';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.candidatos c
       JOIN (VALUES
         ('dr-daniel', DATE '1986-08-25'),
         ('gabriel-azevedo', DATE '1986-03-12'),
         ('hildon-chaves', DATE '1968-05-25'),
         ('silvio-mendes', DATE '1949-08-31'),
         ('tse-2026-20002553726', DATE '1949-07-08')
       ) AS v(slug, nasc) ON v.slug = c.slug
       WHERE c.data_nascimento = v.nasc) <> 5 THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 readback: datas nao conferem com o TSE';
  END IF;

  IF (SELECT md5(biografia) FROM public.candidatos WHERE slug = 'silvio-mendes') IS DISTINCT FROM '9166d6ad078f6e5d688c6e52641e8cbe' THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 readback: biografia de silvio-mendes nao confere';
  END IF;

  IF (SELECT naturalidade FROM public.candidatos WHERE slug = 'dr-daniel') IS DISTINCT FROM 'Açailândia/MA' THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 readback: naturalidade de dr-daniel nao confere com o TSE';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'nascimento-tse-20260926') <> 5 THEN
    RAISE EXCEPTION 'nascimento-tse-20260926 readback: snapshot ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
