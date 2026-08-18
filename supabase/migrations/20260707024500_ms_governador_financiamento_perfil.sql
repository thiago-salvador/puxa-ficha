-- MS Governador closeout: TSE profile normalization and campaign finance rows.
-- Idempotent because the rows were also materialized directly during the closeout.

UPDATE candidatos
SET
  formacao = 'Superior completo',
  profissao_declarada = 'Empresário',
  genero = 'Masculino',
  estado_civil = 'Casado(a)',
  cor_raca = 'Branca',
  fonte_dados = ARRAY['curadoria', 'TSE'],
  ultima_atualizacao = NOW()
WHERE slug = 'eduardo-riedel';

UPDATE candidatos
SET
  data_nascimento = '1973-06-15',
  naturalidade = 'Dourados/MS',
  formacao = 'Ensino médio completo',
  profissao_declarada = 'Jornalista e redator',
  genero = 'Masculino',
  estado_civil = 'Casado(a)',
  cor_raca = 'Branca',
  fonte_dados = ARRAY['TSE', 'curadoria'],
  ultima_atualizacao = NOW()
WHERE slug = 'jeferson-bezerra';

WITH candidate AS (
  SELECT id AS candidato_id FROM candidatos WHERE slug = 'jeferson-bezerra'
),
updated AS (
  UPDATE financiamento f
  SET
    total_arrecadado = 1000,
    total_fundo_partidario = 0,
    total_fundo_eleitoral = 0,
    total_pessoa_fisica = 1000,
    total_recursos_proprios = 0,
    maiores_doadores = '[{"nome":"PERICLES GARCIA SANTOS","valor":1000,"tipo":"PF"}]'::jsonb,
    fonte = 'TSE'
  FROM candidate
  WHERE f.candidato_id = candidate.candidato_id
    AND f.ano_eleicao = 2016
  RETURNING f.id
)
INSERT INTO financiamento (
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
  candidate.candidato_id,
  2016,
  1000,
  0,
  0,
  1000,
  0,
  '[{"nome":"PERICLES GARCIA SANTOS","valor":1000,"tipo":"PF"}]'::jsonb,
  'TSE'
FROM candidate
WHERE NOT EXISTS (SELECT 1 FROM updated);

WITH candidate AS (
  SELECT id AS candidato_id FROM candidatos WHERE slug = 'jeferson-bezerra'
),
years AS (
  SELECT unnest(ARRAY[2020, 2022, 2024]) AS ano_eleicao
),
updated AS (
  UPDATE financiamento f
  SET
    total_arrecadado = 0,
    total_fundo_partidario = 0,
    total_fundo_eleitoral = 0,
    total_pessoa_fisica = 0,
    total_recursos_proprios = 0,
    maiores_doadores = '[]'::jsonb,
    fonte = 'TSE'
  FROM candidate, years
  WHERE f.candidato_id = candidate.candidato_id
    AND f.ano_eleicao = years.ano_eleicao
  RETURNING f.ano_eleicao
)
INSERT INTO financiamento (
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
  candidate.candidato_id,
  years.ano_eleicao,
  0,
  0,
  0,
  0,
  0,
  '[]'::jsonb,
  'TSE'
FROM candidate, years
WHERE NOT EXISTS (
  SELECT 1 FROM updated WHERE updated.ano_eleicao = years.ano_eleicao
);

WITH candidate AS (
  SELECT id AS candidato_id FROM candidatos WHERE slug = 'renato-gomes'
),
updated AS (
  UPDATE financiamento f
  SET
    total_arrecadado = 34355,
    total_fundo_partidario = 0,
    total_fundo_eleitoral = 0,
    total_pessoa_fisica = 0,
    total_recursos_proprios = 0,
    maiores_doadores = '[
      {"nome":"MARCIO FERNANDES","valor":15000,"tipo":"PJ"},
      {"nome":"NIVALDO DE SOUZA MORAES","valor":10000,"tipo":"PF"},
      {"nome":"FLAVIO RENATO ROCHA LIMA","valor":5000,"tipo":"PF"},
      {"nome":"JULIANA ZORZO SILVA MIRANDA","valor":2355,"tipo":"PJ"},
      {"nome":"RAIANA SABRINA BARBOSA","valor":2000,"tipo":"PF"}
    ]'::jsonb,
    fonte = 'TSE'
  FROM candidate
  WHERE f.candidato_id = candidate.candidato_id
    AND f.ano_eleicao = 2020
  RETURNING f.id
)
INSERT INTO financiamento (
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
  candidate.candidato_id,
  2020,
  34355,
  0,
  0,
  0,
  0,
  '[
    {"nome":"MARCIO FERNANDES","valor":15000,"tipo":"PJ"},
    {"nome":"NIVALDO DE SOUZA MORAES","valor":10000,"tipo":"PF"},
    {"nome":"FLAVIO RENATO ROCHA LIMA","valor":5000,"tipo":"PF"},
    {"nome":"JULIANA ZORZO SILVA MIRANDA","valor":2355,"tipo":"PJ"},
    {"nome":"RAIANA SABRINA BARBOSA","valor":2000,"tipo":"PF"}
  ]'::jsonb,
  'TSE'
FROM candidate
WHERE NOT EXISTS (SELECT 1 FROM updated);
