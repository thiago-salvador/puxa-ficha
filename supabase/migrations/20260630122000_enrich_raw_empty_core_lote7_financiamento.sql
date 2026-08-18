BEGIN;

CREATE TEMP TABLE raw_core_identity_lote7 (
  slug text PRIMARY KEY,
  nome_completo text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_identity_lote7 (slug, nome_completo)
VALUES
  ('henrique-areas', 'Henrique Áreas de Araujo'),
  ('izadora-dias', 'Izadora Cristina Dias da Silva'),
  ('francisco-dias', 'Francisco de Assis da Costa Dias');

UPDATE public.candidatos c
SET
  nome_completo = i.nome_completo,
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['curadoria', 'TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
FROM raw_core_identity_lote7 i
WHERE c.slug = i.slug;

CREATE TEMP TABLE raw_core_history_lote7 (
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

INSERT INTO raw_core_history_lote7 (
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
  ('henrique-areas', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'SP', 2016, 2016, 'PCO', 'nao eleito', 'Candidatura TSE 2016, São Paulo/SP, prefeito, SQ 250000077188, nome civil Henrique Áreas de Araujo, situação APTO/DEFERIDO, resultado NÃO ELEITO.', 'tse'),
  ('izadora-dias', 'candidatura', 'Candidatura a Deputado Federal', 'Candidatura a Deputado Federal', 'SP', 2022, 2022, 'PCO', 'nao eleito', 'Candidatura TSE 2022, SP, deputado federal, SQ 250001700018, nome civil Izadora Cristina Dias da Silva, situação APTO, resultado NÃO ELEITO.', 'tse'),
  ('francisco-dias', 'candidatura', 'Candidatura a Vereador', 'Candidatura a Vereador', 'RN', 2020, 2020, 'UP', 'nao eleito', 'Candidatura TSE 2020, Natal/RN, vereador, SQ 200000724020, nome civil Francisco de Assis da Costa Dias, situação APTO, resultado NÃO ELEITO.', 'tse');

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
FROM raw_core_history_lote7 h
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

CREATE TEMP TABLE raw_core_financiamento_lote7 (
  slug text PRIMARY KEY,
  ano_eleicao integer NOT NULL,
  total_arrecadado numeric(15, 2) NOT NULL,
  total_fundo_partidario numeric(15, 2) NOT NULL,
  total_fundo_eleitoral numeric(15, 2) NOT NULL,
  total_pessoa_fisica numeric(15, 2) NOT NULL,
  total_recursos_proprios numeric(15, 2) NOT NULL,
  maiores_doadores jsonb NOT NULL,
  fonte text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_financiamento_lote7 (
  slug,
  ano_eleicao,
  total_arrecadado,
  total_fundo_partidario,
  total_fundo_eleitoral,
  total_pessoa_fisica,
  total_recursos_proprios,
  maiores_doadores,
  fonte
)
VALUES
  (
    'henrique-areas',
    2016,
    1351.41,
    0,
    0,
    0,
    0,
    '[{"nome":"Direção Nacional","valor":1351.41,"tipo":"PJ"}]'::jsonb,
    'TSE Dados Abertos receitas_candidatos_prestacao_contas_final_2016 SQ 250000077188 (total agregado)'
  ),
  (
    'izadora-dias',
    2022,
    11974.36,
    0,
    0,
    0,
    0,
    '[{"nome":"Direção Nacional","valor":11974.36,"tipo":"PJ"}]'::jsonb,
    'TSE Dados Abertos receitas_candidatos_2022 SQ 250001700018 (total agregado)'
  ),
  (
    'francisco-dias',
    2020,
    2892.20,
    0,
    0,
    200.00,
    0,
    '[{"nome":"Direção Estadual/Distrital","valor":2151.30,"tipo":"PJ"},{"nome":"Direção Municipal/Comissão Provisória","valor":540.90,"tipo":"PJ"},{"nome":"INAE NAIARA LOPES MARQUES DE OLIVEIRA","valor":200.00,"tipo":"PF"}]'::jsonb,
    'TSE Dados Abertos receitas_candidatos_2020 SQ 200000724020 (total agregado)'
  );

UPDATE public.financiamento f
SET
  total_arrecadado = rf.total_arrecadado,
  total_fundo_partidario = rf.total_fundo_partidario,
  total_fundo_eleitoral = rf.total_fundo_eleitoral,
  total_pessoa_fisica = rf.total_pessoa_fisica,
  total_recursos_proprios = rf.total_recursos_proprios,
  maiores_doadores = rf.maiores_doadores,
  fonte = rf.fonte
FROM raw_core_financiamento_lote7 rf
JOIN public.candidatos c ON c.slug = rf.slug
WHERE f.candidato_id = c.id
  AND f.ano_eleicao = rf.ano_eleicao;

INSERT INTO public.financiamento (
  candidato_id,
  ano_eleicao,
  total_arrecadado,
  total_fundo_partidario,
  total_fundo_eleitoral,
  total_pessoa_fisica,
  total_recursos_proprios,
  maiores_doadores,
  fonte
)
SELECT
  c.id,
  rf.ano_eleicao,
  rf.total_arrecadado,
  rf.total_fundo_partidario,
  rf.total_fundo_eleitoral,
  rf.total_pessoa_fisica,
  rf.total_recursos_proprios,
  rf.maiores_doadores,
  rf.fonte
FROM raw_core_financiamento_lote7 rf
JOIN public.candidatos c ON c.slug = rf.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.financiamento existing
  WHERE existing.candidato_id = c.id
    AND existing.ano_eleicao = rf.ano_eleicao
);

DO $$
DECLARE
  expected_identity integer;
  actual_identity integer;
  expected_history integer;
  actual_history integer;
  expected_financiamento integer;
  actual_financiamento integer;
  still_raw integer;
BEGIN
  SELECT count(*) INTO expected_identity FROM raw_core_identity_lote7;

  SELECT count(*) INTO actual_identity
  FROM raw_core_identity_lote7 i
  JOIN public.candidatos c
    ON c.slug = i.slug
   AND c.nome_completo = i.nome_completo;

  IF actual_identity <> expected_identity THEN
    RAISE EXCEPTION 'raw core lote7 identity mismatch: expected %, got %', expected_identity, actual_identity;
  END IF;

  SELECT count(*) INTO expected_history FROM raw_core_history_lote7;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote7 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote7 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_financiamento FROM raw_core_financiamento_lote7;

  SELECT count(*) INTO actual_financiamento
  FROM raw_core_financiamento_lote7 rf
  JOIN public.candidatos c ON c.slug = rf.slug
  JOIN public.financiamento f
    ON f.candidato_id = c.id
   AND f.ano_eleicao = rf.ano_eleicao
   AND f.total_arrecadado = rf.total_arrecadado
   AND f.maiores_doadores = rf.maiores_doadores
   AND f.fonte = rf.fonte;

  IF actual_financiamento <> expected_financiamento THEN
    RAISE EXCEPTION 'raw core lote7 financiamento mismatch: expected %, got %', expected_financiamento, actual_financiamento;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote7
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
    RAISE EXCEPTION 'raw core lote7 still raw after enrichment: %', still_raw;
  END IF;
END $$;

COMMIT;
