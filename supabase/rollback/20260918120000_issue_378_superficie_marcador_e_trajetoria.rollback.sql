-- Preservador: nao apaga linha nenhuma. Devolve o doador "#NULO" ao
-- financiamento de 2020 de dr-fernando-maximo e republica as sete linhas de
-- trajetoria de andre-do-prado, com CAS da postimagem integral gravada no
-- recibo `migration:20260918120000`.
BEGIN;
SET LOCAL TIME ZONE 'UTC';
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations',0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.financiamento, public.mudancas_partido IN SHARE ROW EXCLUSIVE MODE;
DO $rollback$
DECLARE r jsonb; actual_after jsonb; afetadas integer;
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260918120000' THEN
    RAISE EXCEPTION 'issue-378 rollback: ledger divergiu (rollback so vale com esta migration no topo)';
  END IF;

  IF (SELECT count(*) FROM public.coleta_log
       WHERE execucao = 'migration:20260918120000' AND volume = 8 AND resultado = 'encontrado') <> 1
     OR EXISTS (SELECT 1 FROM public.coleta_log WHERE execucao = 'rollback:20260918120000') THEN
    RAISE EXCEPTION 'issue-378 rollback: recibo invalido ou rollback repetido';
  END IF;

  SELECT detalhe::jsonb INTO r FROM public.coleta_log WHERE execucao = 'migration:20260918120000';

  actual_after := jsonb_build_object(
    'financiamento', (SELECT to_jsonb(f) FROM public.financiamento f
                       WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7'),
    'trajetoria', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ano, m.id)
                     FROM public.mudancas_partido m
                     JOIN public.candidatos c ON c.id = m.candidato_id
                    WHERE c.slug = 'andre-do-prado')
  );
  IF actual_after IS DISTINCT FROM r->'after' THEN
    RAISE EXCEPTION 'issue-378 rollback: estado atual nao e a postimagem da migration';
  END IF;

  UPDATE public.financiamento f
  SET maiores_doadores = (r->'before'->'financiamento'->'maiores_doadores')
  WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 1 THEN
    RAISE EXCEPTION 'issue-378 rollback: financiamento esperado=1 atual=%', afetadas;
  END IF;

  UPDATE public.mudancas_partido m
  SET despublicado_em = NULL,
      despublicacao_motivo = NULL
  FROM public.candidatos c
  WHERE c.id = m.candidato_id
    AND c.slug = 'andre-do-prado';
  GET DIAGNOSTICS afetadas = ROW_COUNT;
  IF afetadas <> 7 THEN
    RAISE EXCEPTION 'issue-378 rollback: trajetoria esperada=7 atual=%', afetadas;
  END IF;

  INSERT INTO public.coleta_log (fonte,escopo,alvo,resultado,volume,detalhe,url,execucao,natureza)
  SELECT 'auditoria-superficie','global',
         'financiamento.maiores_doadores,mudancas_partido.despublicado_em',
         'encontrado', 8,
         jsonb_build_object(
           'resumo','Rollback da migration 20260918120000: doador "#NULO" e as sete linhas de trajetoria voltam ao estado anterior.',
           'financiamento', (SELECT to_jsonb(f) FROM public.financiamento f
                              WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7'),
           'trajetoria', (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ano, m.id)
                            FROM public.mudancas_partido m
                            JOIN public.candidatos c ON c.id = m.candidato_id
                           WHERE c.slug = 'andre-do-prado')
         )::text,
         'https://github.com/thiago-salvador/puxa-ficha/actions/runs/35232081515',
         'rollback:20260918120000','escrita';

  IF (SELECT to_jsonb(f) FROM public.financiamento f
       WHERE f.id = '7e5a0eb4-86e2-4ffb-af34-f5136ec16fc7') IS DISTINCT FROM r->'before'->'financiamento' THEN
    RAISE EXCEPTION 'issue-378 rollback: financiamento nao voltou a preimagem';
  END IF;
  IF EXISTS (SELECT 1 FROM public.mudancas_partido m
             JOIN public.candidatos c ON c.id = m.candidato_id
             WHERE c.slug = 'andre-do-prado' AND m.despublicado_em IS NOT NULL) THEN
    RAISE EXCEPTION 'issue-378 rollback: trajetoria nao voltou ao ar';
  END IF;

  DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260918120000';
END
$rollback$;
COMMIT;
