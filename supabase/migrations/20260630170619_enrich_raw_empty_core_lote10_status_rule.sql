BEGIN;

CREATE TEMP TABLE raw_core_identity_lote10 (
  slug text PRIMARY KEY,
  nome_completo text NOT NULL,
  nome_urna text NOT NULL,
  data_nascimento date NOT NULL,
  formacao text NOT NULL,
  profissao_declarada text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_identity_lote10 (
  slug,
  nome_completo,
  nome_urna,
  data_nascimento,
  formacao,
  profissao_declarada
)
VALUES
  ('jarbas-soares', 'Jarbas Soares', 'Jarbas Soares', DATE '1954-03-17', 'Superior completo', 'Engenheiro'),
  ('renato-gomes', 'Renato da Silveira Gomes', 'Renato Gomes', DATE '1959-10-18', 'Ensino médio completo', 'Empresário'),
  ('santiago-belizario', 'José Santiago Belizário', 'Santiago Belizário', DATE '1993-06-11', 'Superior incompleto', 'Estudante, bolsista, estagiário e assemelhados');

UPDATE public.candidatos c
SET
  nome_completo = i.nome_completo,
  nome_urna = i.nome_urna,
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
FROM raw_core_identity_lote10 i
WHERE c.slug = i.slug;

CREATE TEMP TABLE raw_core_history_lote10 (
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

INSERT INTO raw_core_history_lote10 (
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
  (
    'jarbas-soares',
    'candidatura',
    'Candidatura a Vereador',
    'Candidatura a Vereador',
    'MG',
    2008,
    2008,
    'PPS',
    'suplente',
    'Candidatura TSE 2008, MG, vereador, SQ 47351, nome civil Jarbas Soares, nome de urna Jarbas, situação APTO, resultado SUPLENTE.',
    'tse'
  ),
  (
    'jarbas-soares',
    'candidatura',
    'Candidatura a Vice-prefeito',
    'Candidatura a Vice-prefeito',
    'MG',
    2020,
    2020,
    'PTB',
    'nao eleito',
    'Candidatura TSE 2020, MG, vice-prefeito, SQ 130000743230, nome civil Jarbas Soares, nome de urna Jarbas Soares, situação APTO, resultado NÃO ELEITO.',
    'tse'
  ),
  (
    'renato-gomes',
    'candidatura',
    'Candidatura a Vereador',
    'Candidatura a Vereador',
    'MS',
    2008,
    2008,
    'PPS',
    'suplente',
    'Candidatura TSE 2008, MS, vereador, SQ 815, nome civil Renato da Silveira Gomes, nome de urna Renato Gomes, situação APTO, resultado SUPLENTE.',
    'tse'
  ),
  (
    'renato-gomes',
    'candidatura',
    'Candidatura a Vereador',
    'Candidatura a Vereador',
    'MS',
    2020,
    2020,
    'MDB',
    'suplente',
    'Candidatura TSE 2020, MS, vereador, SQ 120000886590, nome civil Renato da Silveira Gomes, nome de urna Renato Gomes, situação APTO, resultado SUPLENTE.',
    'tse'
  ),
  (
    'santiago-belizario',
    'candidatura',
    'Candidatura a Prefeito',
    'Candidatura a Prefeito',
    'PI',
    2024,
    2024,
    'UP',
    'nao eleito',
    'Candidatura TSE 2024, PI, prefeito, SQ 180001905702, nome civil José Santiago Belizário, nome de urna Santiago Belizário, situação TSE #NE, resultado NÃO ELEITO.',
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
FROM raw_core_history_lote10 h
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

CREATE TEMP TABLE raw_core_patrimonio_lote10 (
  slug text NOT NULL,
  ano_eleicao integer NOT NULL,
  valor_total numeric(15, 2) NOT NULL,
  sq_candidato text NOT NULL,
  PRIMARY KEY (slug, ano_eleicao)
) ON COMMIT DROP;

INSERT INTO raw_core_patrimonio_lote10 (slug, ano_eleicao, valor_total, sq_candidato)
VALUES
  ('jarbas-soares', 2008, 161474.24, '47351'),
  ('jarbas-soares', 2020, 304741.04, '130000743230'),
  ('renato-gomes', 2008, 99000.00, '815'),
  ('renato-gomes', 2020, 1235000.00, '120000886590'),
  ('santiago-belizario', 2024, 103.65, '180001905702');

UPDATE public.patrimonio p
SET
  valor_total = rp.valor_total,
  bens = '[]'::jsonb,
  fonte = 'TSE Dados Abertos bem_candidato_' || rp.ano_eleicao || ' SQ ' || rp.sq_candidato || ' (total agregado)'
FROM raw_core_patrimonio_lote10 rp
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
FROM raw_core_patrimonio_lote10 rp
JOIN public.candidatos c ON c.slug = rp.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio existing
  WHERE existing.candidato_id = c.id
    AND existing.ano_eleicao = rp.ano_eleicao
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
  SELECT count(*) INTO expected_identity FROM raw_core_identity_lote10;

  SELECT count(*) INTO actual_identity
  FROM raw_core_identity_lote10 i
  JOIN public.candidatos c
    ON c.slug = i.slug
   AND c.nome_completo = i.nome_completo
   AND c.nome_urna = i.nome_urna
   AND c.data_nascimento = i.data_nascimento
   AND c.idade IS NULL
   AND c.formacao = i.formacao
   AND c.profissao_declarada = i.profissao_declarada
   AND 'TSE' = ANY(c.fonte_dados);

  IF actual_identity <> expected_identity THEN
    RAISE EXCEPTION 'raw core lote10 identity mismatch: expected %, got %', expected_identity, actual_identity;
  END IF;

  SELECT count(*) INTO expected_history FROM raw_core_history_lote10;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote10 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio
   AND hp.observacoes = h.observacoes
   AND hp.proveniencia = h.proveniencia;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote10 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_patrimonio FROM raw_core_patrimonio_lote10;

  SELECT count(*) INTO actual_patrimonio
  FROM raw_core_patrimonio_lote10 rp
  JOIN public.candidatos c ON c.slug = rp.slug
  JOIN public.patrimonio p
    ON p.candidato_id = c.id
   AND p.ano_eleicao = rp.ano_eleicao
   AND p.valor_total = rp.valor_total
   AND p.fonte = 'TSE Dados Abertos bem_candidato_' || rp.ano_eleicao || ' SQ ' || rp.sq_candidato || ' (total agregado)';

  IF actual_patrimonio <> expected_patrimonio THEN
    RAISE EXCEPTION 'raw core lote10 patrimonio mismatch: expected %, got %', expected_patrimonio, actual_patrimonio;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_identity_lote10
  ),
  counts AS (
    SELECT
      c.slug,
      count(DISTINCT hp.id) AS historico,
      count(DISTINCT p.id) AS patrimonio,
      count(DISTINCT f.id) AS financiamento
    FROM lote_slugs ls
    JOIN public.candidatos c ON c.slug = ls.slug
    LEFT JOIN public.historico_politico hp ON hp.candidato_id = c.id
    LEFT JOIN public.patrimonio p ON p.candidato_id = c.id
    LEFT JOIN public.financiamento f ON f.candidato_id = c.id
    GROUP BY c.slug
  )
  SELECT count(*) INTO still_raw
  FROM counts
  WHERE historico <= 1
    AND patrimonio = 0
    AND financiamento = 0;

  IF still_raw <> 0 THEN
    RAISE EXCEPTION 'raw core lote10 still raw after apply: %', still_raw;
  END IF;
END $$;

COMMIT;
