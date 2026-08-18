BEGIN;

CREATE TEMP TABLE raw_core_history_lote4 (
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

INSERT INTO raw_core_history_lote4 (
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
  ('camilo-terra', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'SP', 2022, 2022, 'PCB', 'nao eleito', 'Candidatura TSE 2022, SP, deputado federal, SQ 250001640572, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('giovanni-sampaio', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'CE', 2010, 2010, 'PR', 'suplente', 'Candidatura TSE 2010, CE, deputado estadual, SQ 60000000034, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('giovanni-sampaio', 'candidatura', 'Candidatura a Vice-Prefeito', 'Candidatura a Vice-Prefeito', 'CE', 2016, 2016, 'PSD', 'eleito', 'Candidatura TSE 2016, Juazeiro do Norte/CE, vice-prefeito, SQ 60000016045, situacao APTO, resultado ELEITO.', 'tse'),
  ('giovanni-sampaio', 'candidatura', 'Candidatura a Vice-Prefeito', 'Candidatura a Vice-Prefeito', 'CE', 2020, 2020, 'PODE', 'eleito', 'Candidatura TSE 2020, Juazeiro do Norte/CE, vice-prefeito, SQ 60000916886, situacao APTO, resultado ELEITO.', 'tse'),

  ('indira-xavier', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'MG', 2022, 2022, 'UP', 'nao eleito', 'Candidatura TSE 2022, MG, governador, SQ 130001693598, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('olimpio-rocha', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'PB', 2020, 2020, 'PSOL', 'nao eleito', 'Candidatura TSE 2020, Campina Grande/PB, prefeito, SQ 150001021436, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('olimpio-rocha', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'PB', 2022, 2022, 'PSOL', 'suplente', 'Candidatura TSE 2022, PB, deputado estadual, SQ 150001621568, situacao APTO, resultado SUPLENTE.', 'tse'),

  ('rafael-duda', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'MG', 2020, 2020, 'PSTU', 'nao eleito', 'Candidatura TSE 2020, Congonhas/MG, prefeito, SQ 130000788972, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('rafael-duda', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'MG', 2022, 2022, 'PSTU', 'nao eleito', 'Candidatura TSE 2022, MG, deputado federal, SQ 130001644584, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('raquel-bricio', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PA', 2020, 2020, 'UP', 'nao eleito', 'Candidatura TSE 2020, Belem/PA, vereador, SQ 140000698916, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('raquel-bricio', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'PA', 2022, 2022, 'UP', 'nao eleito', 'Candidatura TSE 2022, PA, deputado estadual, SQ 140001607779, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('serley-leal', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'CE', 2012, 2012, 'PT', 'suplente', 'Candidatura TSE 2012, Fortaleza/CE, vereador, SQ 60000015399, situacao APTO, resultado SUPLENTE.', 'tse'),
  ('serley-leal', 'candidatura', 'Candidatura a Vice-Prefeito', 'Candidatura a Vice-Prefeito', 'CE', 2020, 2020, 'UP', 'nao eleito', 'Candidatura TSE 2020, Fortaleza/CE, vice-prefeito, SQ 60000717317, situacao APTO, resultado NAO ELEITO.', 'tse'),
  ('serley-leal', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'CE', 2022, 2022, 'UP', 'nao eleito', 'Candidatura TSE 2022, CE, governador, SQ 60001634109, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('toni-rodrigues', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2012, 2012, 'PTB', 'eleito por QP', 'Candidatura TSE 2012, Altos/PI, vereador, SQ 180000012070, situacao APTO, resultado ELEITO POR QP.', 'tse'),
  ('toni-rodrigues', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'PI', 2016, 2016, 'PSDB', 'suplente', 'Candidatura TSE 2016, Altos/PI, vereador, SQ 180000004911, situacao APTO, resultado SUPLENTE.', 'tse'),

  ('emanuel-cacho', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'SE', 2010, 2010, 'PPS', 'nao eleito', 'Candidatura TSE 2010, SE, senador, SQ 260000000243, situacao APTO, resultado NAO ELEITO.', 'tse'),

  ('vivian-mendes', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'SP', 2022, 2022, 'UP', 'nao eleito', 'Candidatura TSE 2022, SP, senador, SQ 250001602002, situacao APTO, resultado NAO ELEITO.', 'tse');

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
FROM raw_core_history_lote4 h
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

CREATE TEMP TABLE raw_core_patrimonio_lote4 (
  slug text PRIMARY KEY,
  ano_eleicao integer NOT NULL,
  valor_total numeric(15, 2) NOT NULL,
  sq_candidato text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_patrimonio_lote4 (slug, ano_eleicao, valor_total, sq_candidato)
VALUES
  ('camilo-terra', 2022, 490600.00, '250001640572'),
  ('giovanni-sampaio', 2020, 1033536.86, '60000916886'),
  ('indira-xavier', 2022, 272.14, '130001693598'),
  ('olimpio-rocha', 2022, 930000.00, '150001621568'),
  ('rafael-duda', 2022, 150000.00, '130001644584'),
  ('serley-leal', 2022, 355831.00, '60001634109'),
  ('toni-rodrigues', 2016, 569400.00, '180000004911'),
  ('emanuel-cacho', 2010, 2580094.12, '260000000243'),
  ('vivian-mendes', 2022, 233190.68, '250001602002');

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
FROM raw_core_patrimonio_lote4 p
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
  SELECT count(*) INTO expected_history FROM raw_core_history_lote4;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote4 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote4 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_patrimonio FROM raw_core_patrimonio_lote4;

  SELECT count(*) INTO actual_patrimonio
  FROM raw_core_patrimonio_lote4 p
  JOIN public.candidatos c ON c.slug = p.slug
  JOIN public.patrimonio pat
    ON pat.candidato_id = c.id
   AND pat.ano_eleicao = p.ano_eleicao
   AND pat.valor_total = p.valor_total;

  IF actual_patrimonio <> expected_patrimonio THEN
    RAISE EXCEPTION 'raw core lote4 patrimonio mismatch: expected %, got %', expected_patrimonio, actual_patrimonio;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote4
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
    RAISE EXCEPTION 'raw core lote4 still raw after enrichment: %', still_raw;
  END IF;
END $$;

COMMIT;
