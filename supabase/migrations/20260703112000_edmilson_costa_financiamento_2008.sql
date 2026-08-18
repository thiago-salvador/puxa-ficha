-- Materializa financiamento TSE 2008 de Edmilson Costa.
-- Fonte: prestacao_contas_2008/receitas_candidatos_2008_brasil.csv
-- Filtro composto: SQ 8882 + EDMILSON SILVA COSTA + SP + SAO PAULO + PREFEITO/PCB.

CREATE TEMP TABLE raw_edmilson_costa_financiamento_2008 (
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

INSERT INTO raw_edmilson_costa_financiamento_2008 (
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
  'edmilson-costa',
  2008,
  13169.11,
  0,
  0,
  12169.11,
  481.94,
  '[
    {"nome":"RAIMUNDO ARAUJO COSTA FILHO","tipo":"PF","valor":2000},
    {"nome":"Comite Financeiro Municipal Unico","tipo":"PJ","valor":1000},
    {"nome":"MARIO TETILLA MANZANO","tipo":"PF","valor":1000},
    {"nome":"JOAO PADUA MANZANO","tipo":"PF","valor":1000},
    {"nome":"JANO RIBEIRO","tipo":"PF","valor":1000},
    {"nome":"ANGELICA LOVATTO","tipo":"PF","valor":1000},
    {"nome":"FERNANDO A P CANDELARIA","tipo":"PF","valor":900},
    {"nome":"SOFIA PADUA MANZANO","tipo":"PF","valor":827.17},
    {"nome":"IVAN BARBOSA HERMINE","tipo":"PF","valor":510},
    {"nome":"JOSE ROBERTO SILVA","tipo":"PF","valor":500}
  ]'::jsonb,
  'TSE Dados Abertos prestacao_contas_2008/receitas_candidatos_2008_brasil.csv; filtro SQ 8882 + EDMILSON SILVA COSTA + SP/SAO PAULO + PREFEITO/PCB; total agregado de 46 receitas'
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
FROM raw_edmilson_costa_financiamento_2008 rf
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
FROM raw_edmilson_costa_financiamento_2008 rf
JOIN public.candidatos c ON c.slug = rf.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.financiamento f
  WHERE f.candidato_id = c.id
    AND f.ano_eleicao = rf.ano_eleicao
);
