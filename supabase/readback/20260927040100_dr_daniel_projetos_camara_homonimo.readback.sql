BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE s record; atual jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260927040100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260927040100' AND volume = 101 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 readback: recibo ausente ou invalido';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'dr-daniel-camara-20260927' AND tabela = 'projetos_lei') <> 100
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'dr-daniel-camara-20260927' AND tabela = 'candidatos') <> 1 THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 readback: snapshot ausente ou duplicado';
  END IF;

  FOR s IN SELECT * FROM public.identidade_timeline_quarentena_snapshot
           WHERE migration_version = 'dr-daniel-camara-20260927' LOOP
    IF s.tabela = 'projetos_lei' THEN
      SELECT to_jsonb(p) INTO atual FROM public.projetos_lei p WHERE p.id = s.row_id;
      IF atual IS DISTINCT FROM s.postimage THEN
        RAISE EXCEPTION 'dr-daniel-camara-20260927 readback: postimagem divergiu na proposicao %', s.row_id;
      END IF;
    ELSE
      SELECT to_jsonb(c)->'verificacao_campos' INTO atual FROM public.candidatos c WHERE c.id = s.row_id;
      IF atual IS DISTINCT FROM s.postimage->'verificacao_campos' THEN
        RAISE EXCEPTION 'dr-daniel-camara-20260927 readback: verificacao_campos divergiu';
      END IF;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.projetos_lei p
             WHERE p.candidato_id = 'dcc4a93e-4114-43e9-b067-4581ed12cfd5' AND p.despublicado_em IS NULL) THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 readback: ainda ha proposicao publicada em dr-daniel';
  END IF;

  IF (SELECT verificacao_campos->'projetos-de-lei'->>'estado' || '|' || (verificacao_campos->'votacoes-chave'->>'estado')
        FROM public.candidatos WHERE slug = 'dr-daniel') IS DISTINCT FROM 'nao_aplicavel|nao_aplicavel' THEN
    RAISE EXCEPTION 'dr-daniel-camara-20260927 readback: cobertura da Camara ainda afirma achado';
  END IF;
END
$readback$;
COMMIT;
