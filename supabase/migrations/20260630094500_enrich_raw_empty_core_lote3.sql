BEGIN;

CREATE TEMP TABLE raw_core_history_lote3 (
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

INSERT INTO raw_core_history_lote3 (
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
  ('aecio-neves', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'MG', 2010, 2010, 'PSDB', 'eleito', 'Candidatura TSE 2010, MG, senador, SQ 130000000952, situacao APTO, resultado ELEITO.', 'tse'),
  ('aecio-neves', 'candidatura', 'Candidatura a Presidente', 'Candidatura a Presidente', 'BR', 2014, 2014, 'PSDB', 'nao eleito', 'Candidatura TSE 2014, Brasil, presidente, SQ 280000000085, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('aecio-neves', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'MG', 2018, 2018, 'PSDB', 'eleito por QP', 'Candidatura TSE 2018, MG, deputado federal, SQ 130000613206, situacao APTO, resultado ELEITO POR QP.', 'tse'),
  ('aecio-neves', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'MG', 2022, 2022, 'PSDB', 'eleito por media', 'Candidatura TSE 2022, MG, deputado federal, SQ 130001613348, situacao APTO, resultado ELEITO POR MEDIA.', 'tse'),

  ('alex-pucineli', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MT', 2012, 2012, 'PSB', 'suplente', 'Candidatura TSE 2012, Cuiaba/MT, vereador, SQ 110000010149, situacao APTO, resultado SUPLENTE.', 'tse'),

  ('araceli-lemos', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'PA', 2010, 2010, 'PSOL', 'suplente', 'Candidatura TSE 2010, PA, deputado estadual, SQ 140000000143, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('araceli-lemos', 'candidatura', 'Candidatura a 1o Suplente Senador', 'Candidatura a 1o Suplente Senador', 'PA', 2018, 2018, 'PSOL', 'nao eleito', 'Candidatura TSE 2018, PA, 1o suplente, SQ 140000604416, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('caiubi-kuhn', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'MT', 2014, 2014, 'PDT', 'suplente', 'Candidatura TSE 2014, MT, deputado federal, SQ 110000000008, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('caiubi-kuhn', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MT', 2024, 2024, 'PDT', 'nao eleito', 'Candidatura TSE 2024, Cuiaba/MT, vereador, SQ 110002246420, resultado NAO ELEITO.', 'tse'),

  ('gelson-merisio', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'SC', 2010, 2010, 'DEM', 'eleito', 'Candidatura TSE 2010, SC, deputado estadual, SQ 240000000349, situacao APTO, resultado ELEITO.', 'tse'),
  ('gelson-merisio', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'SC', 2014, 2014, 'PSD', 'eleito por QP', 'Candidatura TSE 2014, SC, deputado estadual, SQ 240000000255, situacao APTO, resultado ELEITO POR QP.', 'tse'),
  ('gelson-merisio', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'SC', 2018, 2018, 'PSD', 'nao eleito', 'Candidatura TSE 2018, SC, governador, SQ 240000621321, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('jose-roberto-arruda', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'DF', 2022, 2022, 'PL', 'nao eleito', 'Candidatura TSE 2022, DF, deputado federal, SQ 70001615918, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('luan-monteiro', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RJ', 2020, 2020, 'PCO', 'nao eleito', 'Candidatura TSE 2020, Rio de Janeiro/RJ, vereador, SQ 190001092078, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('luan-monteiro', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'RJ', 2022, 2022, 'PCO', 'nao eleito', 'Candidatura TSE 2022, RJ, deputado estadual, SQ 190001717287, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('luan-monteiro', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RJ', 2024, 2024, 'PCO', 'nao eleito', 'Candidatura TSE 2024, Rio de Janeiro/RJ, vereador, SQ 190002346684, resultado NAO ELEITO.', 'tse'),

  ('lucia-santos', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'PI', 2018, 2018, 'PSDB', 'suplente', 'Candidatura TSE 2018, PI, deputado federal, SQ 180000604119, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('lucia-santos', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2020, 2020, 'PATRIOTA', 'suplente', 'Candidatura TSE 2020, Teresina/PI, vereador, SQ 180001057808, situacao APTO, resultado SUPLENTE.', 'tse'),

  ('luiz-carlos-teodoro', 'candidatura', 'Candidatura a Vice-Prefeito', 'Candidatura a Vice-Prefeito', 'RO', 2020, 2020, 'PSC', 'nao eleito', 'Candidatura TSE 2020, Guajara-Mirim/RO, vice-prefeito, SQ 220000977509, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('mauricio-coelho', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MT', 2012, 2012, 'PMDB', 'suplente', 'Candidatura TSE 2012, Pontal do Araguaia/MT, vereador, SQ 110000010928, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('mauricio-coelho', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MT', 2020, 2020, 'PSB', 'suplente', 'Candidatura TSE 2020, Pontal do Araguaia/MT, vereador, SQ 110000951550, situacao APTO, resultado SUPLENTE.', 'tse'),

  ('mauricio-tonha', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'MT', 2020, 2020, 'DEM', 'nao eleito', 'Candidatura TSE 2020, Agua Boa/MT, prefeito, SQ 110001033922, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('paulo-serra', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'SP', 2016, 2016, 'PSDB', 'eleito', 'Candidatura TSE 2016, Santo Andre/SP, prefeito, SQ 250000033808, situacao APTO, resultado ELEITO.', 'tse'),
  ('paulo-serra', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'SP', 2020, 2020, 'PSDB', 'eleito', 'Candidatura TSE 2020, Santo Andre/SP, prefeito, SQ 250000959444, situacao APTO, resultado ELEITO.', 'tse'),

  ('priscila-voigt', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RS', 2016, 2016, 'PSOL', 'suplente', 'Candidatura TSE 2016, Porto Alegre/RS, vereador, SQ 210000006967, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('priscila-voigt', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RS', 2020, 2020, 'UP', 'nao eleito', 'Candidatura TSE 2020, Porto Alegre/RS, vereador, SQ 210000636284, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('priscila-voigt', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'RS', 2022, 2022, 'UP', 'nao eleito', 'Candidatura TSE 2022, RS, deputado federal, SQ 210001597514, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('priscila-voigt', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RS', 2024, 2024, 'UP', 'nao eleito', 'Candidatura TSE 2024, Porto Alegre/RS, vereador, SQ 210001945324, resultado NAO ELEITO.', 'tse'),

  ('ralf-zimmer', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'SC', 2022, 2022, 'PROS', 'nao eleito', 'Candidatura TSE 2022, SC, governador, SQ 240001611148, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('rejane-oliveira', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'RS', 2022, 2022, 'PSTU', 'nao eleito', 'Candidatura TSE 2022, RS, governador, SQ 210001605930, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('telemaco-brandao', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'GO', 2020, 2020, 'PROS', 'suplente', 'Candidatura TSE 2020, Goiania/GO, vereador, SQ 90001221414, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('telemaco-brandao', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'GO', 2022, 2022, 'PROS', 'nao eleito', 'Candidatura TSE 2022, GO, deputado federal, SQ 90001715444, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('tonny-kerley', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PI', 2024, 2024, 'NOVO', 'nao eleito', 'Candidatura TSE 2024, Teresina/PI, prefeito, SQ 180001885637, resultado NAO ELEITO.', 'tse'),

  ('tulio-lopes', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'MG', 2014, 2014, 'PCB', 'nao eleito', 'Candidatura TSE 2014, MG, governador, SQ 130000001766, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('tulio-lopes', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'MG', 2016, 2016, 'PCB', 'suplente', 'Candidatura TSE 2016, Belo Horizonte/MG, vereador, SQ 130000083665, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('tulio-lopes', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'MG', 2018, 2018, 'PCB', 'nao eleito', 'Candidatura TSE 2018, MG, senador, SQ 130000606639, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('vittorio-medioli', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'MG', 2016, 2016, 'PHS', 'eleito', 'Candidatura TSE 2016, Betim/MG, prefeito, SQ 130000080259, situacao APTO, resultado ELEITO.', 'tse'),
  ('vittorio-medioli', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'MG', 2020, 2020, 'PSD', 'eleito', 'Candidatura TSE 2020, Betim/MG, prefeito, SQ 130000692020, situacao APTO, resultado ELEITO.', 'tse');

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
FROM raw_core_history_lote3 h
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

CREATE TEMP TABLE raw_core_patrimonio_lote3 (
  slug text PRIMARY KEY,
  ano_eleicao integer NOT NULL,
  valor_total numeric(15, 2) NOT NULL,
  sq_candidato text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_patrimonio_lote3 (slug, ano_eleicao, valor_total, sq_candidato)
VALUES
  ('aecio-neves', 2022, 3887866.86, '130001613348'),
  ('alex-pucineli', 2012, 164800.00, '110000010149'),
  ('araceli-lemos', 2018, 319441.40, '140000604416'),
  ('caiubi-kuhn', 2024, 817000.00, '110002246420'),
  ('gelson-merisio', 2018, 1445689.18, '240000621321'),
  ('jose-roberto-arruda', 2022, 1580750.80, '70001615918'),
  ('lucia-santos', 2020, 398312.30, '180001057808'),
  ('luiz-carlos-teodoro', 2020, 180000.00, '220000977509'),
  ('mauricio-coelho', 2020, 509575.12, '110000951550'),
  ('mauricio-tonha', 2020, 41044914.60, '110001033922'),
  ('paulo-serra', 2020, 3459987.72, '250000959444'),
  ('priscila-voigt', 2024, 800.00, '210001945324'),
  ('ralf-zimmer', 2022, 3536000.00, '240001611148'),
  ('rejane-oliveira', 2022, 1040000.00, '210001605930'),
  ('telemaco-brandao', 2022, 8355315.54, '90001715444'),
  ('tonny-kerley', 2024, 1412543.60, '180001885637'),
  ('tulio-lopes', 2014, 14000.00, '130000001766'),
  ('vittorio-medioli', 2020, 703448773.62, '130000692020');

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
FROM raw_core_patrimonio_lote3 p
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
  SELECT count(*) INTO expected_history FROM raw_core_history_lote3;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote3 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote3 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_patrimonio FROM raw_core_patrimonio_lote3;

  SELECT count(*) INTO actual_patrimonio
  FROM raw_core_patrimonio_lote3 p
  JOIN public.candidatos c ON c.slug = p.slug
  JOIN public.patrimonio pat
    ON pat.candidato_id = c.id
   AND pat.ano_eleicao = p.ano_eleicao
   AND pat.valor_total = p.valor_total;

  IF actual_patrimonio <> expected_patrimonio THEN
    RAISE EXCEPTION 'raw core lote3 patrimonio mismatch: expected %, got %', expected_patrimonio, actual_patrimonio;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote3
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
    RAISE EXCEPTION 'raw core lote3 still raw after enrichment: %', still_raw;
  END IF;
END $$;

COMMIT;
