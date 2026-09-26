BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925230100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260925230100' AND volume = 10 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'nome-civil-20260925 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260925230100';
  IF jsonb_array_length(r->'linhas') <> 10 THEN
    RAISE EXCEPTION 'nome-civil-20260925 readback: recibo sem as dez linhas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(c) FROM public.candidatos c WHERE c.slug = linha->>'slug')
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'nome-civil-20260925 readback: postimagem divergiu em %', linha->>'slug';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.candidatos c
       JOIN (VALUES
         ('nikolas-ferreira', 'NIKOLAS FERREIRA DE OLIVEIRA'),
         ('rodrigo-pacheco', 'RODRIGO OTAVIO SOARES PACHECO'),
         ('da-vitoria', 'JOSIAS MARIO DA VITORIA'),
         ('sergio-vidigal', 'ANTONIO SERGIO ALVES VIDIGAL'),
         ('adriana-accorsi', 'ADRIANA SAUTHIER ACCORSI'),
         ('beto-faro', 'JOSÉ ROBERTO OLIVEIRA FARO'),
         ('pedro-cunha-lima', 'PEDRO OLIVEIRA CUNHA LIMA'),
         ('paulo-martins-gov-pr', 'PAULO EDUARDO LIMA MARTINS'),
         ('confucio-moura', 'CONFÚCIO AIRES MOURA'),
         ('thiago-de-joaldo', 'JOSE THIAGO ALVES DE CARVALHO')
       ) AS v(slug, nome) ON v.slug = c.slug
       WHERE c.nome_completo = v.nome AND c.publicavel IS NOT TRUE) <> 10 THEN
    RAISE EXCEPTION 'nome-civil-20260925 readback: nomes nao conferem';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'nome-civil-20260925') <> 10 THEN
    RAISE EXCEPTION 'nome-civil-20260925 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
