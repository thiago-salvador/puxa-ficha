BEGIN;

CREATE TEMP TABLE raw_core_identity_lote8 (
  slug text PRIMARY KEY,
  nome_completo text NOT NULL,
  nome_urna text NOT NULL,
  data_nascimento date NOT NULL,
  naturalidade text NOT NULL,
  formacao text NOT NULL,
  profissao_declarada text NOT NULL,
  foto_url text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_identity_lote8 (
  slug,
  nome_completo,
  nome_urna,
  data_nascimento,
  naturalidade,
  formacao,
  profissao_declarada,
  foto_url
)
VALUES (
  'andre-portugues',
  'André Pinto de Afonseca',
  'André Português',
  DATE '1975-01-30',
  'Miguel Pereira (RJ)',
  'Ensino médio completo',
  'Prefeito',
  'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2030402020/190000874427/58572'
);

UPDATE public.candidatos c
SET
  nome_completo = i.nome_completo,
  nome_urna = i.nome_urna,
  data_nascimento = i.data_nascimento,
  idade = NULL,
  naturalidade = i.naturalidade,
  formacao = i.formacao,
  profissao_declarada = i.profissao_declarada,
  foto_url = i.foto_url,
  fonte_dados = CASE
    WHEN c.fonte_dados IS NULL THEN ARRAY['curadoria', 'TSE']::text[]
    WHEN NOT ('TSE' = ANY(c.fonte_dados)) THEN array_append(c.fonte_dados, 'TSE')
    ELSE c.fonte_dados
  END,
  ultima_atualizacao = now()
FROM raw_core_identity_lote8 i
WHERE c.slug = i.slug;

CREATE TEMP TABLE raw_core_history_lote8 (
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

INSERT INTO raw_core_history_lote8 (
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
  ('andre-portugues', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RJ', 2012, 2012, 'PR', 'nao eleito', 'Candidatura TSE 2012, Miguel Pereira/RJ, prefeito, SQ 190000025768, nome civil André Pinto de Afonseca, situação APTO/DEFERIDO COM RECURSO, resultado NÃO ELEITO.', 'tse'),
  ('andre-portugues', 'candidatura', 'Candidatura a Deputado Estadual', 'Candidatura a Deputado Estadual', 'RJ', 2014, 2014, 'PR', 'suplente', 'Candidatura TSE 2014, RJ, deputado estadual, SQ 190000001796, nome civil André Pinto de Afonseca, situação APTO, resultado SUPLENTE.', 'tse'),
  ('andre-portugues', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RJ', 2016, 2016, 'PR', 'eleito', 'Candidatura TSE 2016, Miguel Pereira/RJ, prefeito, SQ 190000006287, nome civil André Pinto de Afonseca, situação APTO/DEFERIDO, resultado ELEITO.', 'tse'),
  ('andre-portugues', 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RJ', 2020, 2020, 'PSC', 'eleito', 'Candidatura TSE 2020, Miguel Pereira/RJ, prefeito, SQ 190000874427, nome civil André Pinto de Afonseca, situação APTO/DEFERIDO, resultado ELEITO.', 'tse');

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
FROM raw_core_history_lote8 h
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

CREATE TEMP TABLE raw_core_patrimonio_lote8 (
  slug text NOT NULL,
  ano_eleicao integer NOT NULL,
  valor_total numeric(15, 2) NOT NULL,
  sq_candidato text NOT NULL,
  PRIMARY KEY (slug, ano_eleicao)
) ON COMMIT DROP;

INSERT INTO raw_core_patrimonio_lote8 (slug, ano_eleicao, valor_total, sq_candidato)
VALUES
  ('andre-portugues', 2016, 153544.26, '190000006287'),
  ('andre-portugues', 2020, 774744.86, '190000874427');

UPDATE public.patrimonio p
SET
  valor_total = rp.valor_total,
  bens = '[]'::jsonb,
  fonte = 'TSE Dados Abertos bem_candidato_' || rp.ano_eleicao || ' SQ ' || rp.sq_candidato || ' (total agregado)'
FROM raw_core_patrimonio_lote8 rp
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
FROM raw_core_patrimonio_lote8 rp
JOIN public.candidatos c ON c.slug = rp.slug
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio existing
  WHERE existing.candidato_id = c.id
    AND existing.ano_eleicao = rp.ano_eleicao
);

CREATE TEMP TABLE raw_core_financiamento_lote8 (
  slug text NOT NULL,
  ano_eleicao integer NOT NULL,
  total_arrecadado numeric(15, 2) NOT NULL,
  total_fundo_partidario numeric(15, 2) NOT NULL,
  total_fundo_eleitoral numeric(15, 2) NOT NULL,
  total_pessoa_fisica numeric(15, 2) NOT NULL,
  total_recursos_proprios numeric(15, 2) NOT NULL,
  maiores_doadores jsonb NOT NULL,
  fonte text NOT NULL,
  PRIMARY KEY (slug, ano_eleicao)
) ON COMMIT DROP;

INSERT INTO raw_core_financiamento_lote8 (
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
    'andre-portugues',
    2016,
    127335.00,
    30000.00,
    0,
    64335.00,
    33000.00,
    '[{"nome":"Direção Nacional","valor":30000.00,"tipo":"fundo_partidario"},{"nome":"PEDRO PAULO SAD COELHO","valor":25000.00,"tipo":"recursos_proprios"},{"nome":"CARLOS EDUARDO BATISTA LIMA","valor":22000.00,"tipo":"PF"},{"nome":"GILSELE FREIRE","valor":11655.00,"tipo":"PF"},{"nome":"ANDRE PINTO DE AFONSECA","valor":8000.00,"tipo":"recursos_proprios"},{"nome":"JOSE PAULO DE GUSMÃO","valor":8000.00,"tipo":"PF"}]'::jsonb,
    'TSE Dados Abertos receitas_candidatos_prestacao_contas_final_2016 SQ 190000006287 (total agregado)'
  ),
  (
    'andre-portugues',
    2020,
    140955.00,
    0,
    0,
    3300.00,
    0,
    '[{"nome":"DIRETORIO NACIONAL DO PARTIDO SOCIAL CRISTAO","valor":100000.00,"tipo":"PJ"},{"nome":"COMISSAO MUNICIPAL PROVISORIA DO PSC EM MIGUEL PEREIRA","valor":27655.00,"tipo":"PJ"},{"nome":"PROGRESSISTAS-RIO DE JANEIRO-RJ-ESTADUAL","valor":10000.00,"tipo":"PJ"},{"nome":"ROBSON CAMPOS DA COSTA","valor":1100.00,"tipo":"PF"},{"nome":"RUDIMAR SILVA PEREIRA","valor":1100.00,"tipo":"PF"},{"nome":"JORDAN AGUIAR DA SILVA","valor":1100.00,"tipo":"PF"}]'::jsonb,
    'TSE Dados Abertos receitas_candidatos_2020 SQ 190000874427 (total agregado)'
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
FROM raw_core_financiamento_lote8 rf
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
FROM raw_core_financiamento_lote8 rf
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
  wrong_homonym_fields integer;
  expected_history integer;
  actual_history integer;
  expected_patrimonio integer;
  actual_patrimonio integer;
  expected_financiamento integer;
  actual_financiamento integer;
  still_raw integer;
BEGIN
  SELECT count(*) INTO expected_identity FROM raw_core_identity_lote8;

  SELECT count(*) INTO actual_identity
  FROM raw_core_identity_lote8 i
  JOIN public.candidatos c
    ON c.slug = i.slug
   AND c.nome_completo = i.nome_completo
   AND c.nome_urna = i.nome_urna
   AND c.data_nascimento = i.data_nascimento
   AND c.idade IS NULL
   AND c.naturalidade = i.naturalidade
   AND c.formacao = i.formacao
   AND c.profissao_declarada = i.profissao_declarada
   AND c.foto_url = i.foto_url
   AND 'TSE' = ANY(c.fonte_dados);

  IF actual_identity <> expected_identity THEN
    RAISE EXCEPTION 'raw core lote8 identity mismatch: expected %, got %', expected_identity, actual_identity;
  END IF;

  SELECT count(*) INTO wrong_homonym_fields
  FROM public.candidatos c
  WHERE c.slug = 'andre-portugues'
    AND (
      c.data_nascimento = DATE '1978-10-07'
      OR c.naturalidade = 'Nova Iguaçu (RJ)'
      OR c.profissao_declarada = 'Empresário'
      OR c.foto_url = 'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2045202024/190001987220/58467'
    );

  IF wrong_homonym_fields <> 0 THEN
    RAISE EXCEPTION 'raw core lote8 homonym fields still present: %', wrong_homonym_fields;
  END IF;

  SELECT count(*) INTO expected_history FROM raw_core_history_lote8;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote8 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio
   AND hp.observacoes = h.observacoes
   AND hp.proveniencia = h.proveniencia;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote8 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  SELECT count(*) INTO expected_patrimonio FROM raw_core_patrimonio_lote8;

  SELECT count(*) INTO actual_patrimonio
  FROM raw_core_patrimonio_lote8 rp
  JOIN public.candidatos c ON c.slug = rp.slug
  JOIN public.patrimonio p
    ON p.candidato_id = c.id
   AND p.ano_eleicao = rp.ano_eleicao
   AND p.valor_total = rp.valor_total
   AND p.fonte = 'TSE Dados Abertos bem_candidato_' || rp.ano_eleicao || ' SQ ' || rp.sq_candidato || ' (total agregado)';

  IF actual_patrimonio <> expected_patrimonio THEN
    RAISE EXCEPTION 'raw core lote8 patrimonio mismatch: expected %, got %', expected_patrimonio, actual_patrimonio;
  END IF;

  SELECT count(*) INTO expected_financiamento FROM raw_core_financiamento_lote8;

  SELECT count(*) INTO actual_financiamento
  FROM raw_core_financiamento_lote8 rf
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
    RAISE EXCEPTION 'raw core lote8 financiamento mismatch: expected %, got %', expected_financiamento, actual_financiamento;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote8
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
    RAISE EXCEPTION 'raw core lote8 still raw after enrichment: %', still_raw;
  END IF;
END $$;

COMMIT;
