-- ============================================
-- Fluxo 5B expansao factual PR ampliada parcial
-- Seed parcial ampliado: Lote A Ratinho Junior / PR
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Sistema Legislacao do Estado do Parana
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Preflight remoto read-only:
--   fonte interna de curadoria
-- Coverage scope: inventario_ampliado_parcial_pr_lote_a_20260428
-- Linhas verificadas: 5

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    WHERE c.slug = 'ratinho-junior'
  ) THEN
    RAISE EXCEPTION 'ratinho-junior nao encontrado em candidatos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'ratinho-junior'
      AND hp.tipo_evento = 'mandato'
      AND hp.estado = 'PR'
      AND (
        hp.cargo ILIKE '%Governador%'
        OR hp.cargo_canonico = 'Governador'
      )
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
  ) THEN
    RAISE EXCEPTION 'mandato Governador/PR de ratinho-junior em 2023 nao encontrado';
  END IF;
END $$;

CREATE TEMP TABLE _seed_ratinho_pr_lote_a_legislacao ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.350', 2023, '2023-01-01', 'Fixa, a partir de 1º de janeiro de 2023, o piso salarial no Estado do Paraná e sua política de valorização, e adota outras providências.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279026&codItemAto=1770606', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:279026:1770606', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-a-lei-21350","curation_batch_id":"ratinho-junior-pr-lote-a-20260428","coverage_scope":"inventario_ampliado_parcial_pr_lote_a_20260428","codAto":279026,"codItemAto":1770606,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.351', 2023, '2023-01-01', 'Dispõe sobre a extinção do Fundo de Atendimento à Saúde dos Policiais Militares do Paraná, criado pela Lei nº 14.605, de 5 de janeiro de 2005.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=278064&codItemAto=1763930', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:278064:1763930', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-a-lei-21351","curation_batch_id":"ratinho-junior-pr-lote-a-20260428","coverage_scope":"inventario_ampliado_parcial_pr_lote_a_20260428","codAto":278064,"codItemAto":1763930,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.352', 2023, '2023-01-01', 'Dispõe sobre a organização administrativa básica do Poder Executivo Estadual e dá outras providências.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=278128&codItemAto=1764420', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:278128:1764420', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-a-lei-21352","curation_batch_id":"ratinho-junior-pr-lote-a-20260428","coverage_scope":"inventario_ampliado_parcial_pr_lote_a_20260428","codAto":278128,"codItemAto":1764420,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.353', 2023, '2023-01-01', 'Cria a Agência de Assuntos Metropolitanos do Paraná.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279028&codItemAto=1770637', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:279028:1770637', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-a-lei-21353","curation_batch_id":"ratinho-junior-pr-lote-a-20260428","coverage_scope":"inventario_ampliado_parcial_pr_lote_a_20260428","codAto":279028,"codItemAto":1770637,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.354', 2023, '2023-01-01', 'Regulamenta o Fundo Paraná, destinado a apoiar o desenvolvimento científico e tecnológico do Estado do Paraná, nos termos do art. 205 da Constituição Estadual e adota outras providências.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=279029&codItemAto=1770640', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:279029:1770640', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-a-lei-21354","curation_batch_id":"ratinho-junior-pr-lote-a-20260428","coverage_scope":"inventario_ampliado_parcial_pr_lote_a_20260428","codAto":279029,"codItemAto":1770640,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}')
) AS v(
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  fonte_tramitacao_url,
  identificador_fonte,
  metadata
);

WITH target AS (
  SELECT
    c.id AS candidato_id,
    (
      SELECT hp.id
      FROM historico_politico hp
      WHERE hp.candidato_id = c.id
        AND hp.tipo_evento = 'mandato'
        AND hp.estado = 'PR'
        AND (
          hp.cargo ILIKE '%Governador%'
          OR hp.cargo_canonico = 'Governador'
        )
        AND hp.periodo_inicio <= 2023
        AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
      ORDER BY hp.periodo_inicio DESC
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  WHERE c.slug = 'ratinho-junior'
)
INSERT INTO legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  tipo_norma,
  numero,
  ano,
  data_norma,
  ementa,
  signatario,
  autoridade_papel,
  fonte_primaria_url,
  fonte_primaria_titulo,
  fonte_tramitacao_url,
  identificador_fonte,
  metadata
)
SELECT
  target.candidato_id,
  target.historico_politico_id,
  seed.tipo_relacao,
  seed.esfera,
  seed.uf_norma,
  seed.tipo_norma,
  seed.numero,
  seed.ano,
  seed.data_norma::date,
  seed.ementa,
  seed.signatario,
  seed.autoridade_papel,
  seed.fonte_primaria_url,
  seed.fonte_primaria_titulo,
  seed.fonte_tramitacao_url,
  seed.identificador_fonte,
  seed.metadata::jsonb
FROM target
CROSS JOIN _seed_ratinho_pr_lote_a_legislacao seed
WHERE target.historico_politico_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = target.candidato_id
      AND lme.tipo_relacao = seed.tipo_relacao
      AND lme.tipo_norma = seed.tipo_norma
      AND lme.numero = seed.numero
      AND lme.ano = seed.ano
      AND lme.fonte_primaria_url = seed.fonte_primaria_url
  );
