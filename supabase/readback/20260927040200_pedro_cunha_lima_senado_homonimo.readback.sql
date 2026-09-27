BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE s record; atual jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log
      WHERE execucao = 'migration:20260927040200' AND volume = 33 AND resultado = 'encontrado') <> 1
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
      WHERE migration_version = 'pedro-cunha-lima-senado-20260927' AND tabela = 'projetos_lei') <> 33 THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 readback: recibo ou snapshot invalido';
  END IF;
  FOR s IN SELECT * FROM public.identidade_timeline_quarentena_snapshot
           WHERE migration_version = 'pedro-cunha-lima-senado-20260927' LOOP
    SELECT to_jsonb(p) INTO atual FROM public.projetos_lei p WHERE p.id = s.row_id;
    IF atual IS DISTINCT FROM s.postimage THEN
      RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 readback: postimagem divergiu em %', s.row_id;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM public.projetos_lei
      WHERE candidato_id = 'aa9ca0e4-794c-409d-91fe-4d18c13a449a'
        AND metadata->>'codigo_parlamentar_senado' = '1757'
        AND despublicado_em IS NOT NULL
        AND despublicacao_motivo = 'homonimo-senado-1757: projetos vinculados a outro parlamentar; esta ficha pertence a Pedro Oliveira Cunha Lima.') <> 33 THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 readback: contagem despublicada divergiu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.projetos_lei
      WHERE candidato_id = 'aa9ca0e4-794c-409d-91fe-4d18c13a449a'
        AND metadata->>'codigo_parlamentar_senado' = '1757'
        AND despublicado_em IS NULL) THEN
    RAISE EXCEPTION 'pedro-cunha-lima-senado-20260927 readback: ha linha publicada';
  END IF;
END
$readback$;
COMMIT;
