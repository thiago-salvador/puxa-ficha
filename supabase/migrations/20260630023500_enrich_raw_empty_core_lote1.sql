BEGIN;

CREATE TEMP TABLE raw_core_history_lote1 (
  slug text NOT NULL,
  tipo_evento text NOT NULL,
  cargo text NOT NULL,
  cargo_canonico text NOT NULL,
  estado text,
  periodo_inicio integer NOT NULL,
  periodo_fim integer,
  partido text,
  eleito_por text,
  observacoes text NOT NULL,
  proveniencia text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_history_lote1 (
  slug,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
)
VALUES
  ('izalci-lucas', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'DF', 2010, 2010, 'PR', 'eleito', 'Candidatura TSE 2010, DF, deputado federal, SQ 70000000726, situacao APTO, resultado ELEITO.', 'tse'),
  ('izalci-lucas', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'DF', 2014, 2014, 'PSDB', 'eleito por QP', 'Candidatura TSE 2014, DF, deputado federal, SQ 70000001075, situacao APTO, resultado ELEITO POR QP.', 'tse'),
  ('izalci-lucas', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'DF', 2018, 2018, 'PSDB', 'eleito', 'Candidatura TSE 2018, DF, senador, SQ 70000625515, situacao APTO, resultado ELEITO.', 'tse'),
  ('izalci-lucas', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'DF', 2022, 2022, 'PSDB', 'nao eleito', 'Candidatura TSE 2022, DF, governador, SQ 70001651176, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('jesus-rodrigues', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'PI', 2010, 2010, 'PT', 'media', 'Candidatura TSE 2010, PI, deputado federal, SQ 180000000676, situacao APTO, resultado MEDIA.', 'tse'),
  ('jesus-rodrigues', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'PI', 2018, 2018, 'PSOL', 'nao eleito', 'Candidatura TSE 2018, PI, senador, SQ 180000607150, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('jesus-rodrigues', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2024, 2024, 'SOLIDARIEDADE', 'suplente', 'Candidatura TSE 2024, Teresina/PI, vereador, SQ 180001955836, resultado SUPLENTE.', 'tse'),

  ('elizeu-aguiar', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'PI', 2010, 2010, 'PTB', 'suplente', 'Candidatura TSE 2010, PI, deputado federal, SQ 180000000237, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('elizeu-aguiar', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'PI', 2018, 2018, 'PSL', 'nao eleito', 'Candidatura TSE 2018, PI, senador, SQ 180000625910, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('elizeu-aguiar', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2020, 2020, 'PP', 'suplente', 'Candidatura TSE 2020, Teresina/PI, vereador, SQ 180000762626, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('elizeu-aguiar', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'PI', 2022, 2022, 'PP', 'suplente', 'Candidatura TSE 2022, PI, deputado estadual, SQ 180001604040, situacao APTO, resultado SUPLENTE.', 'tse'),

  ('ravenna-castro', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'PI', 2018, 2018, 'PMN', 'suplente', 'Candidatura TSE 2018, PI, deputado estadual, SQ 180000608796, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('ravenna-castro', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2020, 2020, 'PMN', 'nao eleito', 'Candidatura TSE 2020, Teresina/PI, vereador, SQ 180001238894, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('ravenna-castro', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'PI', 2022, 2022, 'PMN', 'nao eleito', 'Candidatura TSE 2022, PI, governador, SQ 180001713732, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('roberio-paulino', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RN', 2012, 2012, 'PSOL', 'nao eleito', 'Candidatura TSE 2012, Natal/RN, prefeito, SQ 200000001257, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('roberio-paulino', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'RN', 2014, 2014, 'PSOL', 'nao eleito', 'Candidatura TSE 2014, RN, governador, SQ 200000000083, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('roberio-paulino', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RN', 2016, 2016, 'PSOL', 'nao eleito', 'Candidatura TSE 2016, Natal/RN, prefeito, SQ 200000010691, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('roberio-paulino', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'RN', 2018, 2018, 'PSOL', 'nao eleito', 'Candidatura TSE 2018, RN, deputado estadual, SQ 200000601427, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('roberio-paulino', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RN', 2020, 2020, 'PSOL', 'eleito por media', 'Candidatura TSE 2020, Natal/RN, vereador, SQ 200000981908, situacao APTO, resultado ELEITO POR MEDIA.', 'tse'),
  ('roberio-paulino', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RN', 2024, 2024, 'PSOL', 'suplente', 'Candidatura TSE 2024, Natal/RN, vereador, SQ 200002231543, resultado SUPLENTE.', 'tse'),

  ('mario-couto', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'PA', 2014, 2014, 'PSDB', 'nao eleito', 'Candidatura TSE 2014, PA, senador, SQ 140000000871, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('mario-couto', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PA', 2020, 2020, 'PRTB', 'nao eleito', 'Candidatura TSE 2020, Belem/PA, prefeito, SQ 140001230533, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('mario-couto', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'PA', 2022, 2022, 'PL', 'nao eleito', 'Candidatura TSE 2022, PA, senador, SQ 140001600249, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('roberto-cidade', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'AM', 2016, 2016, 'PTN', 'suplente', 'Candidatura TSE 2016, Manaus/AM, vereador, SQ 40000001600, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('roberto-cidade', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'AM', 2018, 2018, 'PV', 'eleito por QP', 'Candidatura TSE 2018, AM, deputado estadual, SQ 40000609263, situacao APTO, resultado ELEITO POR QP.', 'tse'),
  ('roberto-cidade', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'AM', 2022, 2022, 'UNIAO', 'eleito por QP', 'Candidatura TSE 2022, AM, deputado estadual, SQ 40001618472, situacao APTO, resultado ELEITO POR QP.', 'tse'),
  ('roberto-cidade', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'AM', 2024, 2024, 'UNIAO', 'nao eleito', 'Candidatura TSE 2024, Manaus/AM, prefeito, SQ 40002079169, resultado NAO ELEITO.', 'tse'),

  ('sergio-goncalves', 'candidatura', 'Candidatura a Vice-Governador', 'Candidatura a Vice-Governador', 'RO', 2022, 2022, 'UNIAO', 'segundo turno', 'Candidatura TSE 2022, RO, vice-governador, SQ 220001609510, situacao APTO, resultado 2o TURNO.', 'tse'),

  ('wilson-witzel', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'RJ', 2018, 2018, 'PSC', 'segundo turno', 'Candidatura TSE 2018, RJ, governador, SQ 190000612301, situacao APTO, resultado 2o TURNO.', 'tse'),

  ('vera-lucia', 'candidatura', 'Candidatura a Presidente', 'Candidatura a Presidente', 'BR', 2018, 2018, 'PSTU', 'nao eleito', 'Candidatura TSE 2018, Brasil, presidente, SQ 280000601173, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('vera-lucia', 'candidatura', 'Candidatura a Presidente', 'Candidatura a Presidente', 'BR', 2022, 2022, 'PSTU', 'nao eleito', 'Candidatura TSE 2022, Brasil, presidente, SQ 280001607831, situacao APTO, resultado NAO ELEITO.', 'tse');

INSERT INTO public.historico_politico (
  candidato_id,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
)
SELECT
  c.id,
  h.tipo_evento,
  h.cargo,
  h.cargo_canonico,
  h.estado,
  h.periodo_inicio,
  h.periodo_fim,
  h.partido,
  h.eleito_por,
  h.observacoes,
  h.proveniencia
FROM raw_core_history_lote1 h
JOIN public.candidatos c ON c.slug = h.slug
ON CONFLICT (candidato_id, cargo_canonico, periodo_inicio)
WHERE periodo_inicio IS NOT NULL AND cargo_canonico IS NOT NULL
DO UPDATE SET
  tipo_evento = EXCLUDED.tipo_evento,
  cargo = EXCLUDED.cargo,
  estado = EXCLUDED.estado,
  periodo_fim = EXCLUDED.periodo_fim,
  partido = EXCLUDED.partido,
  eleito_por = EXCLUDED.eleito_por,
  observacoes = EXCLUDED.observacoes,
  proveniencia = EXCLUDED.proveniencia;

CREATE TEMP TABLE raw_core_patrimonio_lote1 (
  slug text PRIMARY KEY,
  ano_eleicao integer NOT NULL,
  valor_total numeric(15, 2) NOT NULL,
  sq_candidato text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_patrimonio_lote1 (slug, ano_eleicao, valor_total, sq_candidato)
VALUES
  ('izalci-lucas', 2022, 17410892.06, '70001651176'),
  ('jesus-rodrigues', 2024, 2876888.00, '180001955836'),
  ('elizeu-aguiar', 2022, 1500000.00, '180001604040'),
  ('ravenna-castro', 2022, 180000.00, '180001713732'),
  ('roberio-paulino', 2024, 4299369.56, '200002231543'),
  ('mario-couto', 2022, 931454.40, '140001600249'),
  ('roberto-cidade', 2024, 8676570.54, '40002079169'),
  ('sergio-goncalves', 2022, 1140000.00, '220001609510'),
  ('wilson-witzel', 2018, 800000.00, '190000612301'),
  ('vera-lucia', 2022, 17610.00, '280001607831');

INSERT INTO public.patrimonio (
  candidato_id,
  ano_eleicao,
  valor_total,
  bens,
  fonte
)
SELECT
  c.id,
  p.ano_eleicao,
  p.valor_total,
  '[]'::jsonb,
  'TSE Dados Abertos bem_candidato_' || p.ano_eleicao || ' SQ ' || p.sq_candidato || ' (total agregado)'
FROM raw_core_patrimonio_lote1 p
JOIN public.candidatos c ON c.slug = p.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio existing
  WHERE existing.candidato_id = c.id
    AND existing.ano_eleicao = p.ano_eleicao
    AND existing.fonte = 'TSE Dados Abertos bem_candidato_' || p.ano_eleicao || ' SQ ' || p.sq_candidato || ' (total agregado)'
);

DO $$
DECLARE
  expected_history integer;
  actual_history integer;
  expected_patrimonio integer;
  actual_patrimonio integer;
  still_raw integer;
BEGIN
  SELECT count(*) INTO expected_history FROM raw_core_history_lote1;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote1 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote1 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_patrimonio FROM raw_core_patrimonio_lote1;

  SELECT count(*) INTO actual_patrimonio
  FROM raw_core_patrimonio_lote1 p
  JOIN public.candidatos c ON c.slug = p.slug
  JOIN public.patrimonio pat
    ON pat.candidato_id = c.id
   AND pat.ano_eleicao = p.ano_eleicao
   AND pat.valor_total = p.valor_total;

  IF actual_patrimonio <> expected_patrimonio THEN
    RAISE EXCEPTION 'raw core lote1 patrimonio mismatch: expected %, got %', expected_patrimonio, actual_patrimonio;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote1
  ),
  counts AS (
    SELECT
      c.slug,
      (SELECT count(*) FROM public.historico_politico hp WHERE hp.candidato_id = c.id) AS historico_count,
      (SELECT count(*) FROM public.patrimonio pat WHERE pat.candidato_id = c.id) AS patrimonio_count,
      (SELECT count(*) FROM public.financiamento f WHERE f.candidato_id = c.id) AS financiamento_count,
      (SELECT count(*) FROM public.votos_candidato v WHERE v.candidato_id = c.id) AS votos_count,
      (SELECT count(*) FROM public.projetos_lei pl WHERE pl.candidato_id = c.id) AS projetos_count,
      (SELECT count(*) FROM public.legislacao_mandato_executivo lme WHERE lme.candidato_id = c.id) AS legislacao_count,
      (SELECT count(*) FROM public.gastos_parlamentares gp WHERE gp.candidato_id = c.id) AS gastos_count
    FROM lote_slugs l
    JOIN public.candidatos_publico c ON c.slug = l.slug
  )
  SELECT count(*) INTO still_raw
  FROM counts
  WHERE historico_count <= 1
    AND patrimonio_count = 0
    AND financiamento_count = 0
    AND votos_count = 0
    AND projetos_count = 0
    AND legislacao_count = 0
    AND gastos_count = 0;

  IF still_raw <> 0 THEN
    RAISE EXCEPTION 'raw core lote1 still raw after enrichment: %', still_raw;
  END IF;
END $$;

COMMIT;
