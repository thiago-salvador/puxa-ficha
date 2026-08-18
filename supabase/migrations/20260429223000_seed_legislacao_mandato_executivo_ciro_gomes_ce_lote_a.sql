-- ============================================
-- Fluxo 5B expansao presidencial CE ampliada parcial
-- Seed parcial ampliado: Lote A Ciro Gomes / CE
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Assembleia Legislativa do Estado do Ceara - Banco Eletronico de Leis Tematicas
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Roadmap:
--   fonte interna de curadoria
-- Coverage scope: inventario_ampliado_parcial_ce_lote_a_20260429
-- Linhas verificadas: 5

DO $$
DECLARE
  compatible_mandate_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    WHERE c.slug = 'ciro-gomes'
  ) THEN
    RAISE EXCEPTION 'ciro-gomes nao encontrado em candidatos';
  END IF;

  SELECT COUNT(*)
  INTO compatible_mandate_count
  FROM candidatos c
  JOIN historico_politico hp ON hp.candidato_id = c.id
  WHERE c.slug = 'ciro-gomes'
    AND hp.tipo_evento = 'mandato'
    AND hp.estado = 'CE'
    AND (
      hp.cargo ILIKE '%Governador%'
      OR hp.cargo_canonico = 'Governador'
    )
    AND hp.periodo_inicio <= 1991
    AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 1994);

  IF compatible_mandate_count <> 1 THEN
    RAISE EXCEPTION 'mandato Governador/CE de ciro-gomes para 1991-1994 nao encontrado de forma unica';
  END IF;
END $$;

CREATE TEMP TABLE _seed_ciro_gomes_ce_lote_a_legislacao ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  ('lei_sancionada', 'estadual', 'CE', 'lei', '11.889', 1991, '1991-12-20', 'Dispõe sobre a política estadual de atendimento dos direitos da criança e do adolescente, cria o Conselho Estadual dos Direitos da Criança e do Adolescente, e dá outras providências.', 'CIRO FERREIRA GOMES', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/direitos-humanos-e-cidadania/item/2692-lei-n-11-889-de-20-12-91-d-o-de-23-12-91', 'Assembleia Legislativa do Estado do Ceará - Banco Eletrônico de Leis Temáticas', NULL, 'CE-BELT:LEI:11889:1991', '{"source":"BELT ALECE","data_real":true,"fluxo":"5B","case_id":"ciro-gomes-ce-lote-a-lei-11889","curation_batch_id":"ciro-gomes-ce-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_ce_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'CE', 'lei', '12.010', 1992, '1992-10-05', 'Autoriza a Constituiçao da Companhia de Gás do Ceará - CEGÁS, e dá outras providências.', 'CIRO FERREIRA GOMES', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/ciencia-e-tecnologia-e-educacao-superior/item/1074-lei-n-12-010-de-05-10-92-d-o-de-08-10-92', 'Assembleia Legislativa do Estado do Ceará - Banco Eletrônico de Leis Temáticas', NULL, 'CE-BELT:LEI:12010:1992', '{"source":"BELT ALECE","data_real":true,"fluxo":"5B","case_id":"ciro-gomes-ce-lote-a-lei-12010","curation_batch_id":"ciro-gomes-ce-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_ce_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'CE', 'lei', '12.207', 1993, '1993-11-11', 'Institui a Gratificação de Execução de Obras e Transportes e dá outras providências.', 'CIRO FERREIRA GOMES', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/orcamento-financas-e-tributacao/item/1643-lei-n-12-207-de-11-11-93-d-o-de-16-11-93', 'Assembleia Legislativa do Estado do Ceará - Banco Eletrônico de Leis Temáticas', NULL, 'CE-BELT:LEI:12207:1993', '{"source":"BELT ALECE","data_real":true,"fluxo":"5B","case_id":"ciro-gomes-ce-lote-a-lei-12207","curation_batch_id":"ciro-gomes-ce-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_ce_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'CE', 'lei', '12.215', 1993, '1993-11-18', 'Dispõe sobre a revisão do Plano Plurianual para o biênio 1994-1995 e dá outras providências.', 'CIRO FERREIRA GOMES', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/orcamento-financas-e-tributacao/item/1658-lei-n-12-215-de-18-11-93-d-o-de-27-12-93', 'Assembleia Legislativa do Estado do Ceará - Banco Eletrônico de Leis Temáticas', NULL, 'CE-BELT:LEI:12215:1993', '{"source":"BELT ALECE","data_real":true,"fluxo":"5B","case_id":"ciro-gomes-ce-lote-a-lei-12215","curation_batch_id":"ciro-gomes-ce-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_ce_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'CE', 'lei', '12.269', 1994, '1994-03-23', 'Concede a pensão que indica.', 'CIRO FERREIRA GOMES', 'titular', 'https://belt.al.ce.gov.br/index.php/legislacao-do-ceara/organizacao-tematica/educacao/item/1287-lei-n-12-269-de-23-03-94-d-o-de-24-03-94', 'Assembleia Legislativa do Estado do Ceará - Banco Eletrônico de Leis Temáticas', NULL, 'CE-BELT:LEI:12269:1994', '{"source":"BELT ALECE","data_real":true,"fluxo":"5B","case_id":"ciro-gomes-ce-lote-a-lei-12269","curation_batch_id":"ciro-gomes-ce-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_ce_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}')
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
        AND hp.estado = 'CE'
        AND (
          hp.cargo ILIKE '%Governador%'
          OR hp.cargo_canonico = 'Governador'
        )
        AND hp.periodo_inicio <= 1991
        AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 1994)
      ORDER BY hp.periodo_inicio DESC
      LIMIT 1
    ) AS historico_politico_id
  FROM candidatos c
  WHERE c.slug = 'ciro-gomes'
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
CROSS JOIN _seed_ciro_gomes_ce_lote_a_legislacao seed
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
