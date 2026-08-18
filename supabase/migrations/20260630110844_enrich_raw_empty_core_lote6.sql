BEGIN;

CREATE TEMP TABLE raw_core_identity_lote6 (
  slug text PRIMARY KEY,
  nome_completo text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_identity_lote6 (slug, nome_completo)
VALUES
  ('ze-batista', 'José Batista Neto'),
  ('ricardo-marques', 'José Ricardo Marques dos Santos'),
  ('tony-garcia', 'Antônio Celso Garcia'),
  ('antonia-pedrosa', 'Antônia Pedrosa Vieira'),
  ('ricardo-frota', 'Ricardo Furtado da Frota');

UPDATE public.candidatos c
SET
  nome_completo = i.nome_completo,
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['curadoria', 'TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
FROM raw_core_identity_lote6 i
WHERE c.slug = i.slug;

CREATE TEMP TABLE raw_core_history_lote6 (
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

INSERT INTO raw_core_history_lote6 (
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
  ('ze-batista', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'CE', 2020, 2020, 'PSTU', 'nao eleito', 'Candidatura TSE 2020, Fortaleza/CE, vereador, SQ 60001133056, nome civil José Batista Neto, situação APTO, resultado NÃO ELEITO.', 'tse'),
  ('ze-batista', 'candidatura', 'Candidatura a Governador', 'Candidatura a Governador', 'CE', 2022, 2022, 'PSTU', 'nao eleito', 'Candidatura TSE 2022, CE, governador, SQ 60001608950, nome civil José Batista Neto, situação APTO, resultado NÃO ELEITO.', 'tse'),

  ('ricardo-marques', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'SE', 2020, 2020, 'CIDADANIA', 'eleito por media', 'Candidatura TSE 2020, Aracaju/SE, vereador, SQ 260000657536, nome civil José Ricardo Marques dos Santos, situação APTO, resultado ELEITO POR MÉDIA.', 'tse'),
  ('ricardo-marques', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'SE', 2022, 2022, 'CIDADANIA', 'suplente', 'Candidatura TSE 2022, SE, deputado estadual, SQ 260001600206, nome civil José Ricardo Marques dos Santos, situação APTO, resultado SUPLENTE.', 'tse'),

  ('tony-garcia', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'PR', 1998, 1998, 'PPB', 'eleito', 'Candidatura TSE 1998, PR, deputado estadual, SQ 160001607111121, nome civil Antônio Celso Garcia, situação DEFERIDO, resultado ELEITO.', 'tse'),
  ('tony-garcia', 'candidatura', 'Candidatura a Senador', 'Candidatura a Senador', 'PR', 2002, 2002, 'PPB', 'nao eleito', 'Candidatura TSE 2002, PR, senador, SQ 414, nome civil Antônio Celso Garcia, situação APTO, resultado NÃO ELEITO.', 'tse'),

  ('antonia-pedrosa', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RR', 2020, 2020, 'PT', 'nao eleito', 'Candidatura TSE 2020, Boa Vista/RR, vereador, SQ 230001054008, nome civil Antônia Pedrosa Vieira, situação APTO, resultado NÃO ELEITO.', 'tse'),
  ('antonia-pedrosa', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'RR', 2022, 2022, 'PT', 'nao eleito', 'Candidatura TSE 2022, RR, deputado federal, SQ 230001610860, nome civil Antônia Pedrosa Vieira, situação APTO, resultado NÃO ELEITO.', 'tse'),

  ('ricardo-frota', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RO', 2012, 2012, 'PR', 'suplente', 'Candidatura TSE 2012, Porto Velho/RO, vereador, SQ 220000000288, nome civil Ricardo Furtado da Frota, situação APTO, resultado SUPLENTE.', 'tse');

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
FROM raw_core_history_lote6 h
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

CREATE TEMP TABLE raw_core_patrimonio_lote6 (
  slug text PRIMARY KEY,
  ano_eleicao integer NOT NULL,
  valor_total numeric(15, 2) NOT NULL,
  sq_candidato text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_patrimonio_lote6 (slug, ano_eleicao, valor_total, sq_candidato)
VALUES
  ('ricardo-frota', 2012, 90000.00, '220000000288');

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
FROM raw_core_patrimonio_lote6 p
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
  expected_identity integer;
  actual_identity integer;
  expected_history integer;
  actual_history integer;
  expected_patrimonio integer;
  actual_patrimonio integer;
  still_raw integer;
BEGIN
  SELECT count(*) INTO expected_identity FROM raw_core_identity_lote6;

  SELECT count(*) INTO actual_identity
  FROM raw_core_identity_lote6 i
  JOIN public.candidatos c
    ON c.slug = i.slug
   AND c.nome_completo = i.nome_completo;

  IF actual_identity <> expected_identity THEN
    RAISE EXCEPTION 'raw core lote6 identity mismatch: expected %, got %', expected_identity, actual_identity;
  END IF;

  SELECT count(*) INTO expected_history FROM raw_core_history_lote6;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote6 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote6 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_patrimonio FROM raw_core_patrimonio_lote6;

  SELECT count(*) INTO actual_patrimonio
  FROM raw_core_patrimonio_lote6 p
  JOIN public.candidatos c ON c.slug = p.slug
  JOIN public.patrimonio pat
    ON pat.candidato_id = c.id
   AND pat.ano_eleicao = p.ano_eleicao
   AND pat.valor_total = p.valor_total;

  IF actual_patrimonio <> expected_patrimonio THEN
    RAISE EXCEPTION 'raw core lote6 patrimonio mismatch: expected %, got %', expected_patrimonio, actual_patrimonio;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote6
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
    RAISE EXCEPTION 'raw core lote6 still raw after enrichment: %', still_raw;
  END IF;
END $$;

COMMIT;
