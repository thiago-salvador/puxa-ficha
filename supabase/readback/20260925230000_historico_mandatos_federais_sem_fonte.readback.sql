BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925230000') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260925230000' AND volume = 8 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'hist-federal-20260925 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260925230000';
  IF jsonb_array_length(r->'linhas') <> 8 THEN
    RAISE EXCEPTION 'hist-federal-20260925 readback: recibo sem as oito linhas';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(h) FROM public.historico_politico h WHERE h.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'hist-federal-20260925 readback: postimagem divergiu na linha %', linha->>'id';
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.historico_politico
       WHERE id IN ('b6e88c6c-4cd9-4bc3-9dac-09c8959a8d88','ccc99323-2c55-4c9d-b7ba-eb13adde9574','ee91942c-35d1-418e-a382-26b2e45cc77e')
         AND despublicado_em IS NOT NULL
         AND coalesce(despublicacao_motivo, '') <> '') <> 3 THEN
    RAISE EXCEPTION 'hist-federal-20260925 readback: as tres linhas nao estao despublicadas';
  END IF;

  IF (SELECT count(*) FROM public.historico_politico h
       JOIN (VALUES
         ('292d7aaf-1a16-4065-8152-6804e8c90d3c'::uuid, 1991, 1995),
         ('9fb2198a-fa50-4c5b-9113-429e25cb65ac'::uuid, 2007, 2019),
         ('530a532b-d2e5-4f1f-978f-ff59846372e9'::uuid, 1999, 2003),
         ('e4aa3d93-53f4-41e2-bee2-0bb0a6eb4b36'::uuid, 2019, 2023),
         ('8ffbdfc0-1c6c-4918-b059-e581693f5053'::uuid, 2002, 2006)
       ) AS v(id, ini, fim) ON v.id = h.id
       WHERE h.despublicado_em IS NULL
         AND h.periodo_inicio = v.ini
         AND h.periodo_fim = v.fim) <> 5 THEN
    RAISE EXCEPTION 'hist-federal-20260925 readback: periodos corrigidos nao conferem';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'hist-federal-20260925') <> 8 THEN
    RAISE EXCEPTION 'hist-federal-20260925 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
