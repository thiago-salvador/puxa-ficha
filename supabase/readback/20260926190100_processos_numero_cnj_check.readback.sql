BEGIN READ ONLY;
SET LOCAL TIME ZONE 'UTC';
DO $readback$
DECLARE fora text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'processos_numero_processo_cnj_check'
      AND conrelid = 'public.processos'::regclass
      AND contype = 'c'
      AND NOT convalidated
      AND pg_get_constraintdef(oid) LIKE '%processo_numero_cnj_valido(numero_processo)%') THEN
    RAISE EXCEPTION 'processo-cnj-check readback: constraint ausente ou com forma inesperada';
  END IF;

  IF public.processo_numero_cnj_valido('2254046-86.2021.8.26.0000') IS NOT TRUE
     OR public.processo_numero_cnj_valido('2254046-86.2021.8.26.0000/50000') IS NOT FALSE
     OR public.processo_numero_cnj_valido('2254046-87.2021.8.26.0000') IS NOT FALSE
     OR public.processo_numero_cnj_valido('22540468620218260000') IS NOT FALSE
     OR public.processo_numero_cnj_valido(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'processo-cnj-check readback: validador nao confere';
  END IF;

  -- Fora da regra só as três linhas legadas nomeadas na migration.
  SELECT coalesce(array_agg(p.numero_processo ORDER BY p.numero_processo), '{}') INTO fora
  FROM public.processos p
  WHERE p.numero_processo IS NOT NULL
    AND NOT public.processo_numero_cnj_valido(p.numero_processo);
  IF EXISTS (SELECT 1 FROM public.candidatos) AND current_setting('pf.replay', true) IS DISTINCT FROM 'true'
     AND NOT (fora <@ ARRAY['43.0719.0000337/2020-0','HC 201965','TC 008.761/2020-5']) THEN
    RAISE EXCEPTION 'processo-cnj-check readback: numero fora da regra alem dos legados: %', fora;
  END IF;
END
$readback$;
COMMIT;
