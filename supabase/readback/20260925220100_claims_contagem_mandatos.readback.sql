BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE r jsonb; linha jsonb;
BEGIN
  IF (SELECT count(*) FROM public.coleta_log WHERE execucao = 'migration:20260925220100') <> 1
     OR NOT EXISTS (SELECT 1 FROM public.coleta_log
       WHERE execucao = 'migration:20260925220100' AND volume = 1 AND resultado = 'encontrado') THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 readback: recibo ausente ou invalido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260925220100';
  IF jsonb_array_length(r->'linhas') <> 1 THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 readback: recibo sem a linha da claim';
  END IF;

  FOR linha IN SELECT value FROM jsonb_array_elements(r->'linhas') LOOP
    IF (SELECT to_jsonb(p) FROM public.pontos_atencao p WHERE p.id = (linha->>'id')::uuid)
         IS DISTINCT FROM linha->'after' THEN
      RAISE EXCEPTION 'claims-mandatos-20260925 readback: postimagem divergiu na claim %', linha->>'id';
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.pontos_atencao
       WHERE id = '59afc792-415e-4e59-9fc0-6f71ea883b0c'
         AND titulo = 'Carreira política'
         AND descricao !~* 'mandato\(s\)'
         AND visivel IS TRUE
         AND despublicado_em IS NULL) THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 readback: claim de hana-ghassan nao esta no texto novo';
  END IF;

  -- Nenhuma claim de curadoria visivel continua contando mandatos no titulo;
  -- as de IA com esse titulo sao recusadas pelo trigger em qualquer UPDATE.
  IF EXISTS (SELECT 1 FROM public.pontos_atencao
             WHERE visivel IS TRUE AND despublicado_em IS NULL
               AND gerado_por IS DISTINCT FROM 'ia'
               AND titulo ~* '^Carreira pol[ií]tica:[[:space:]]*[0-9]+[[:space:]]+mandato') THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 readback: ainda ha claim visivel com contagem de mandatos';
  END IF;

  IF (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
       WHERE migration_version = 'claims-mandatos-20260925') <> 1 THEN
    RAISE EXCEPTION 'claims-mandatos-20260925 readback: snapshot de quarentena ausente ou duplicado';
  END IF;
END
$readback$;
COMMIT;
