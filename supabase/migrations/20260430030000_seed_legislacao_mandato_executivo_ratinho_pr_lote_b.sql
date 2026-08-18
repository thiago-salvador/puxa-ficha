-- ============================================
-- Fluxo 5B expansao factual PR ampliada parcial
-- Seed parcial ampliado: Lote B Ratinho Junior / PR
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Sistema Legislacao do Estado do Parana (https://www.legislacao.pr.gov.br)
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Coverage scope: inventario_ampliado_parcial_pr_lote_b_20260430
-- Linhas verificadas: 5 (todas fora do range numerico/temporal do Lote A)
-- Lote A ja aplicado: 21.350, 21.351, 21.352, 21.353, 21.354 (todas 2023-01-01) + legacy 21.355
-- Lote B novo:        21.393 (2023-04-10), 21.627 (2023-09-13), 21.640 (2023-09-25),
--                     21.661 (2023-10-02), 21.693 (2023-10-17)
-- Migration toca somente legislacao_mandato_executivo. projetos_lei intocada.

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

CREATE TEMP TABLE _seed_ratinho_pr_lote_b_legislacao ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.393', 2023, '2023-04-10', 'Institui a Semana de Conscientização sobre a Importância da Liberdade de Imprensa para a Democracia, a ser comemorada na primeira semana do mês de abril.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=289900&codItemAto=1832168', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:289900:1832168', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-b-lei-21393","curation_batch_id":"ratinho-junior-pr-lote-b-20260430","coverage_scope":"inventario_ampliado_parcial_pr_lote_b_20260430","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.627', 2023, '2023-09-13', 'Concede o Título de Utilidade Pública à Fundação Marta Kaiser, com sede no Município de Campo Mourão.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=305300&codItemAto=1929496', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:305300:1929496', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-b-lei-21627","curation_batch_id":"ratinho-junior-pr-lote-b-20260430","coverage_scope":"inventario_ampliado_parcial_pr_lote_b_20260430","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.640', 2023, '2023-09-25', 'Institui o Código de Ética e Conduta da Polícia Científica do Paraná.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=305900&codItemAto=1933288', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:305900:1933288', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-b-lei-21640","curation_batch_id":"ratinho-junior-pr-lote-b-20260430","coverage_scope":"inventario_ampliado_parcial_pr_lote_b_20260430","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.661', 2023, '2023-10-02', 'Autoriza a Companhia de Habitação do Paraná a efetuar a doação dos imóveis que especifica ao Município de Porto Barreiro.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=306700&codItemAto=1938344', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:306700:1938344', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-b-lei-21661","curation_batch_id":"ratinho-junior-pr-lote-b-20260430","coverage_scope":"inventario_ampliado_parcial_pr_lote_b_20260430","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'PR', 'lei', '21.693', 2023, '2023-10-17', 'Autoriza o Tribunal de Justiça do Estado do Paraná a efetuar a doação do imóvel que especifica ao Município de Laranjeiras do Sul.', 'CARLOS MASSA RATINHO JUNIOR', 'titular', 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=307700&codItemAto=1944664', 'Sistema Legislação do Estado do Paraná', NULL, 'PR-LEGISLACAO:307700:1944664', '{"source":"Sistema Legislação PR","data_real":true,"fluxo":"5B","case_id":"ratinho-junior-pr-lote-b-lei-21693","curation_batch_id":"ratinho-junior-pr-lote-b-20260430","coverage_scope":"inventario_ampliado_parcial_pr_lote_b_20260430","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}')
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
CROSS JOIN _seed_ratinho_pr_lote_b_legislacao seed
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
