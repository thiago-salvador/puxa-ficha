-- ============================================
-- Fluxo 5B expansao factual MG ampliada parcial
-- Seed parcial ampliado: Lote B Romeu Zema / MG
-- ============================================
-- Nao aplicar ao Supabase remoto sem autorizacao explicita.
-- Fonte oficial: Assembleia Legislativa de Minas Gerais - Legislacao Mineira
-- Artefato de auditoria:
--   fonte interna de curadoria
-- Coverage scope: inventario_ampliado_parcial_mg_lote_b_20260429
-- Linhas verificadas: 5 (todas fora do range numerico/temporal do Lote A)
-- Lote A ja aplicado: 24.304, 24.305, 24.306, 24.307, 24.314 (2023-04-24 a 2023-05-02)
-- Lote B novo:        24.320, 24.330, 24.340, 24.355, 24.470 (2023-05-12 a 2023-09-29)
-- Migration toca somente legislacao_mandato_executivo. projetos_lei intocada.

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

CREATE TEMP TABLE _seed_romeu_zema_mg_lote_b_legislacao ON COMMIT DROP AS
SELECT *
FROM (
VALUES
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.320', 2023, '2023-05-12', 'Declara de utilidade pública a Associação das Artesãs Arte, Mãos e Flores de Antônio Pereira, com sede no Município de Ouro Preto.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24320/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24320:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-b-lei-24320","curation_batch_id":"romeu-zema-mg-lote-b-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_b_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.330', 2023, '2023-05-25', 'Institui o Dia Estadual do Quadrilheiro Junino.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24330/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24330:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-b-lei-24330","curation_batch_id":"romeu-zema-mg-lote-b-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_b_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.340', 2023, '2023-05-29', 'Acrescenta parágrafo ao art. 2º da Lei n° 15.072, de 5 de abril de 2004, que dispõe sobre a promoção da educação alimentar e nutricional nas escolas públicas e privadas do sistema estadual de ensino.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24340/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24340:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-b-lei-24340","curation_batch_id":"romeu-zema-mg-lote-b-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_b_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.355', 2023, '2023-06-16', 'Autoriza a abertura de crédito suplementar ao Orçamento Fiscal do Estado em favor das unidades orçamentárias Procuradoria-Geral de Justiça, Fundo Especial do Ministério Público do Estado de Minas Gerais e Fundo Estadual de Proteção e Defesa do Consumidor.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24355/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24355:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-b-lei-24355","curation_batch_id":"romeu-zema-mg-lote-b-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_b_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}'),
  ('lei_sancionada', 'estadual', 'MG', 'lei', '24.470', 2023, '2023-09-29', 'Altera a Lei nº 6.763, de 26 de dezembro de 1975, que consolida a Legislação Tributária do Estado de Minas Gerais, e dá outras providências.', 'ROMEU ZEMA NETO', 'titular', 'https://www.almg.gov.br/legislacao-mineira/texto/LEI/24470/2023/', 'Assembleia Legislativa de Minas Gerais - Legislação Mineira', NULL, 'ALMG-LEGISLACAO-MINEIRA:LEI:24470:2023', '{"source":"ALMG Legislação Mineira","data_real":true,"fluxo":"5B","case_id":"romeu-zema-mg-lote-b-lei-24470","curation_batch_id":"romeu-zema-mg-lote-b-20260429","coverage_scope":"inventario_ampliado_parcial_mg_lote_b_20260429","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false}')
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
CROSS JOIN _seed_romeu_zema_mg_lote_b_legislacao seed
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
