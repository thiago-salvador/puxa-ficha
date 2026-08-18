-- ============================================
-- Fluxo 5B expansao factual MG ampliada parcial
-- Seed parcial ampliado: Lote A Romeu Zema / MG
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Assembleia Legislativa de Minas Gerais - Legislacao Mineira
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Coverage scope: inventario_ampliado_parcial_mg_lote_a_20260429
-- Linhas verificadas: 5

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    WHERE c.slug = 'romeu-zema'
  ) THEN
    RAISE EXCEPTION 'romeu-zema nao encontrado em candidatos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM candidatos c
    JOIN historico_politico hp ON hp.candidato_id = c.id
    WHERE c.slug = 'romeu-zema'
      AND hp.tipo_evento = 'mandato'
      AND hp.estado = 'MG'
      AND (
        hp.cargo ILIKE '%Governador%'
        OR hp.cargo_canonico = 'Governador'
      )
      AND hp.periodo_inicio <= 2023
      AND (hp.periodo_fim IS NULL OR hp.periodo_fim >= 2023)
  ) THEN
    RAISE EXCEPTION 'mandato Governador/MG de romeu-zema em 2023 nao encontrado';
  END IF;
END $$;

CREATE TEMP TABLE _seed_romeu_zema_mg_lote_a_legislacao ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.304', 2023, '2023-04-24', 'Autoriza o Poder Executivo a alienar onerosamente o imóvel que especifica e dá outras providências.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24304/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24304:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-a-lei-24304","curation_batch_id":"romeu-zema-mg-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.305', 2023, '2023-04-24', 'Dispõe sobre a desafetação do trecho de rodovia que especifica e autoriza o Poder Executivo a doar ao Município de Araxá a área correspondente.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24305/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24305:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-a-lei-24305","curation_batch_id":"romeu-zema-mg-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.306', 2023, '2023-04-24', 'Autoriza o Poder Executivo a doar ao Município de São Roque de Minas o imóvel que especifica.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24306/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24306:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-a-lei-24306","curation_batch_id":"romeu-zema-mg-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.307', 2023, '2023-04-24', 'Dá nova redação ao art. 1º da Lei nº 1.842, de 13 de dezembro de 1958, que autoriza a doação do terreno e benfeitorias da Subestação Experimental do Estado, no Município de Governador Valadares, às Obras Sociais da Diocese local.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24307/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24307:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-a-lei-24307","curation_batch_id":"romeu-zema-mg-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.314', 2023, '2023-05-02', 'Fixa os subsídios do Governador, do Vice-Governador, dos Secretários de Estado e dos Secretários Adjuntos de Estado e dá outras providências.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24314/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24314:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-a-lei-24314","curation_batch_id":"romeu-zema-mg-lote-a-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_a_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}')
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
        AND hp.estado = 'MG'
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
  WHERE c.slug = 'romeu-zema'
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
CROSS JOIN _seed_romeu_zema_mg_lote_a_legislacao seed
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
