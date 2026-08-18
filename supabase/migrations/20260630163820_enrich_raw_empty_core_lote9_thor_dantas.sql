BEGIN;

CREATE TEMP TABLE raw_core_identity_lote9 (
  slug text PRIMARY KEY,
  nome_completo text NOT NULL,
  data_nascimento date NOT NULL,
  formacao text NOT NULL,
  profissao_declarada text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_identity_lote9 (
  slug,
  nome_completo,
  data_nascimento,
  formacao,
  profissao_declarada
)
VALUES (
  'thor-dantas',
  'Thor Oliveira Dantas',
  DATE '1973-10-29',
  'Superior completo',
  'Médico'
);

UPDATE public.candidatos c
SET
  nome_completo = i.nome_completo,
  data_nascimento = i.data_nascimento,
  idade = NULL,
  formacao = i.formacao,
  profissao_declarada = i.profissao_declarada,
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['curadoria', 'TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
FROM raw_core_identity_lote9 i
WHERE c.slug = i.slug;

CREATE TEMP TABLE raw_core_history_lote9 (
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

INSERT INTO raw_core_history_lote9 (
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
VALUES (
  'thor-dantas',
  'candidatura',
  'Candidatura a Deputado Federal',
  'Candidatura a Deputado Federal',
  'AC',
  2022,
  2022,
  'PSB',
  'nao eleito',
  'Candidatura TSE 2022, AC, deputado federal, SQ 10001649411, nome civil Thor Oliveira Dantas, nome de urna Dr Thor Dantas, situação APTO, resultado NÃO ELEITO.',
  'tse'
);

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
FROM raw_core_history_lote9 h
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

CREATE TEMP TABLE raw_core_patrimonio_lote9 (
  slug text PRIMARY KEY,
  ano_eleicao integer NOT NULL,
  valor_total numeric(15, 2) NOT NULL,
  sq_candidato text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_patrimonio_lote9 (slug, ano_eleicao, valor_total, sq_candidato)
VALUES
  ('thor-dantas', 2022, 253396.75, '10001649411');

UPDATE public.patrimonio p
SET
  valor_total = rp.valor_total,
  bens = '[]'::jsonb,
  fonte = 'TSE Dados Abertos bem_candidato_' || rp.ano_eleicao || ' SQ ' || rp.sq_candidato || ' (total agregado)'
FROM raw_core_patrimonio_lote9 rp
JOIN public.candidatos c ON c.slug = rp.slug
WHERE p.candidato_id = c.id
  AND p.ano_eleicao = rp.ano_eleicao;

INSERT INTO public.patrimonio (
  candidato_id,
  ano_eleicao,
  valor_total,
  bens,
  fonte
)
SELECT
  c.id,
  rp.ano_eleicao,
  rp.valor_total,
  '[]'::jsonb,
  'TSE Dados Abertos bem_candidato_' || rp.ano_eleicao || ' SQ ' || rp.sq_candidato || ' (total agregado)'
FROM raw_core_patrimonio_lote9 rp
JOIN public.candidatos c ON c.slug = rp.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio existing
  WHERE existing.candidato_id = c.id
    AND existing.ano_eleicao = rp.ano_eleicao
);

CREATE TEMP TABLE raw_core_financiamento_lote9 (
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

INSERT INTO raw_core_financiamento_lote9 (
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
VALUES (
  'thor-dantas',
  2022,
  322362.98,
  0,
  0,
  67450.00,
  7450.00,
  '[{"nome":"PARTIDO SOCIALISTA BRASILEIRO - ACRE- AC - ESTADUAL","valor":247462.97,"tipo":"PJ"},{"nome":"THOR OLIVEIRA DANTAS","valor":7450.00,"tipo":"recursos_proprios"},{"nome":"FATIMA PESSANHA FAGUNDES","valor":5500.00,"tipo":"PF"},{"nome":"ALBERTINA RODRIGUES DA SILVA","valor":4000.00,"tipo":"PF"},{"nome":"MAURICIO MAGARIFUCHI","valor":2500.00,"tipo":"PF"},{"nome":"VALDIR PINHEIRO LEAL","valor":2300.00,"tipo":"PF"},{"nome":"RICARDO FREIRE DE OLIVEIRA","valor":2300.00,"tipo":"PF"},{"nome":"MATEUS GOMES DE OLIVEIRA","valor":2000.00,"tipo":"PF"}]'::jsonb,
  'TSE Dados Abertos receitas_candidatos_2022 SQ 10001649411 (total agregado)'
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
FROM raw_core_financiamento_lote9 rf
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
FROM raw_core_financiamento_lote9 rf
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
  expected_patrimonio integer;
  actual_patrimonio integer;
  expected_financiamento integer;
  actual_financiamento integer;
  still_raw integer;
BEGIN
  SELECT count(*) INTO expected_identity FROM raw_core_identity_lote9;

  SELECT count(*) INTO actual_identity
  FROM raw_core_identity_lote9 i
  JOIN public.candidatos c
    ON c.slug = i.slug
   AND c.nome_completo = i.nome_completo
   AND c.nome_urna = 'Thor Dantas'
   AND c.data_nascimento = i.data_nascimento
   AND c.idade IS NULL
   AND c.formacao = i.formacao
   AND c.profissao_declarada = i.profissao_declarada
   AND 'TSE' = ANY(c.fonte_dados);

  IF actual_identity <> expected_identity THEN
    RAISE EXCEPTION 'raw core lote9 identity mismatch: expected %, got %', expected_identity, actual_identity;
  END IF;

  SELECT count(*) INTO expected_history FROM raw_core_history_lote9;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote9 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio
   AND hp.observacoes = h.observacoes
   AND hp.proveniencia = h.proveniencia;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote9 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_patrimonio FROM raw_core_patrimonio_lote9;

  SELECT count(*) INTO actual_patrimonio
  FROM raw_core_patrimonio_lote9 rp
  JOIN public.candidatos c ON c.slug = rp.slug
  JOIN public.patrimonio p
    ON p.candidato_id = c.id
   AND p.ano_eleicao = rp.ano_eleicao
   AND p.valor_total = rp.valor_total
   AND p.fonte = 'TSE Dados Abertos bem_candidato_' || rp.ano_eleicao || ' SQ ' || rp.sq_candidato || ' (total agregado)';

  IF actual_patrimonio <> expected_patrimonio THEN
    RAISE EXCEPTION 'raw core lote9 patrimonio mismatch: expected %, got %', expected_patrimonio, actual_patrimonio;
  END IF;

  SELECT count(*) INTO expected_financiamento FROM raw_core_financiamento_lote9;

  SELECT count(*) INTO actual_financiamento
  FROM raw_core_financiamento_lote9 rf
  JOIN public.candidatos c ON c.slug = rf.slug
  JOIN public.financiamento f
    ON f.candidato_id = c.id
   AND f.ano_eleicao = rf.ano_eleicao
   AND f.total_arrecadado = rf.total_arrecadado
   AND f.total_fundo_partidario = rf.total_fundo_partidario
   AND f.total_fundo_eleitoral = rf.total_fundo_eleitoral
   AND f.total_pessoa_fisica = rf.total_pessoa_fisica
   AND f.total_recursos_proprios = rf.total_recursos_proprios
   AND f.maiores_doadores = rf.maiores_doadores
   AND f.fonte = rf.fonte;

  IF actual_financiamento <> expected_financiamento THEN
    RAISE EXCEPTION 'raw core lote9 financiamento mismatch: expected %, got %', expected_financiamento, actual_financiamento;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote9
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
    RAISE EXCEPTION 'raw core lote9 still raw after enrichment: %', still_raw;
  END IF;
END $$;

COMMIT;
