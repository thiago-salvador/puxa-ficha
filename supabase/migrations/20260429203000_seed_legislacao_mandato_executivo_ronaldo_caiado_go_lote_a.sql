-- ============================================
-- Fluxo 5B expansao factual GO ampliada parcial
-- Seed parcial ampliado: Lote A Ronaldo Caiado / GO
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Casa Civil do Estado de Goias - Legisla Goias
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Roadmap:
--   fonte interna de curadoria
-- Coverage scope: inventario_ampliado_parcial_go_lote_a_20260429
-- Linhas verificadas: 5

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    WHERE c.slug = 'ronaldo-caiado'
  ) THEN
    RAISE EXCEPTION 'ronaldo-caiado nao encontrado em candidatos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'ronaldo-caiado'
      AND hp.tipo_evento = 'mandato'
      AND hp.estado = 'GO'
      AND (
        hp.cargo ILIKE '%Governador%'
        OR hp.cargo_canonico = 'Governador'
      )
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
  ) THEN
    RAISE EXCEPTION 'mandato Governador/GO de ronaldo-caiado em 2023 nao encontrado';
  END IF;
END $$;

CREATE TEMP TABLE _seed_ronaldo_caiado_go_lote_a_legislacao ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  ('lei_sancionada', 'estadual', 'GO', 'lei', '22.523', 2023, '2023-12-29', 'Altera a Lei nº 13.460, de 05 de maio de 1999, que fixa a tabela de vencimentos dos cargos constantes do Quadro de Pessoal da Secretaria da Assembleia Legislativa do Estado de Goiás e a dos Quadros de Pessoal da Procuradoria Geral da Assembleia Legislativa do Estado de Goiás.', 'RONALDO CAIADO', 'titular', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/108306', 'Casa Civil do Estado de Goiás - Legisla Goiás', NULL, 'GO-LEGISLA:108306', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"5B","case_id":"ronaldo-caiado-go-lote-a-lei-22523","curation_batch_id":"ronaldo-caiado-go-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_go_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":108306}'),
  ('lei_sancionada', 'estadual', 'GO', 'lei', '22.522', 2023, '2023-12-28', 'Institui o Dia Estadual do Associativismo.', 'RONALDO CAIADO', 'titular', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/108303', 'Casa Civil do Estado de Goiás - Legisla Goiás', NULL, 'GO-LEGISLA:108303', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"5B","case_id":"ronaldo-caiado-go-lote-a-lei-22522","curation_batch_id":"ronaldo-caiado-go-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_go_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":108303}'),
  ('lei_sancionada', 'estadual', 'GO', 'lei', '22.521', 2023, '2023-12-28', 'Dispõe sobre o reconhecimento do bem que especifica como patrimônio cultural imaterial goiano.', 'RONALDO CAIADO', 'titular', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/108302', 'Casa Civil do Estado de Goiás - Legisla Goiás', NULL, 'GO-LEGISLA:108302', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"5B","case_id":"ronaldo-caiado-go-lote-a-lei-22521","curation_batch_id":"ronaldo-caiado-go-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_go_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":108302}'),
  ('lei_sancionada', 'estadual', 'GO', 'lei', '22.520', 2023, '2023-12-28', 'Veda a solicitação abusiva de dados pessoais do consumidor, na forma que especifica.', 'RONALDO CAIADO', 'titular', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/108301', 'Casa Civil do Estado de Goiás - Legisla Goiás', NULL, 'GO-LEGISLA:108301', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"5B","case_id":"ronaldo-caiado-go-lote-a-lei-22520","curation_batch_id":"ronaldo-caiado-go-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_go_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":108301}'),
  ('lei_sancionada', 'estadual', 'GO', 'lei', '22.519', 2023, '2023-12-28', 'Dispõe sobre o reconhecimento do bem que especifica como patrimônio cultural imaterial goiano.', 'RONALDO CAIADO', 'titular', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/108300', 'Casa Civil do Estado de Goiás - Legisla Goiás', NULL, 'GO-LEGISLA:108300', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"5B","case_id":"ronaldo-caiado-go-lote-a-lei-22519","curation_batch_id":"ronaldo-caiado-go-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_go_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":108300}')
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
        AND hp.estado = 'GO'
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
  WHERE c.slug = 'ronaldo-caiado'
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
CROSS JOIN _seed_ronaldo_caiado_go_lote_a_legislacao seed
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
