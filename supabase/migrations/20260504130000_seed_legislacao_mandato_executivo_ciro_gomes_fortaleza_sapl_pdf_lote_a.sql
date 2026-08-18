-- ============================================================================
-- Lote A Ciro Gomes Fortaleza 1989 (10 rows)
--
-- Fonte oficial unica: SAPL - Camara Municipal de Fortaleza
--   https://sapl.fortaleza.ce.leg.br/api/norma/normajuridica/<id>
--
-- Origem dos dados:
--   fonte interna de curadoria
--   (auditoria SAPL + extracao de signatario via pdftotext em texto_integral)
--
-- Criterio de aceitacao (executado no script auditor):
--   1. esfera_federacao=M (municipal) no SAPL
--   2. tipo = "Lei Ordinaria" (whitelist conservadora; exclui Decreto Legislativo, Resolucao, etc.)
--   3. PDF de texto_integral baixado e extraido com pdftotext
--   4. Texto contem "CIRO FERREIRA GOMES" como evidencia textual + marcador
--      "PAÇO DA PREFEITURA MUNICIPAL DE FORTALEZA" ou "Prefeito Municipal"
--   5. Texto NAO contem "Prefeito em Exercicio" sem nome Ciro (sem ambiguidade vice)
--   6. data_norma em 1989 (todas pre 1990-04-04, antes da saida antecipada de
--      Ciro para concorrer ao Governo do Ceara, sem risco de mandato vice)
--
-- Mandato resolvido por subselect (slug + cargo + estado + ano).
-- Sem UUID hardcoded.
--
-- Idempotente: INSERT ... WHERE NOT EXISTS por identificador_fonte = SAPL-FOR:<id>.
-- coverage_id intencionalmente NULL (lote ampliado parcial, NAO completo).
-- coverage_scope: fortaleza_municipal_lote_a_pdf_signatario_20260504
--
-- DRAFT: nao aplicar ao Supabase remoto sem autorizacao explicita.
-- ============================================================================

DO $$
DECLARE
  v_candidato_id UUID;
  v_historico_id UUID;
  v_historico_count INTEGER;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'ciro-gomes';
  IF v_candidato_id IS NULL THEN
    RAISE EXCEPTION 'Pre-condicao falha: candidato ciro-gomes nao encontrado';
  END IF;

  SELECT COUNT(*) INTO v_historico_count
    FROM historico_politico
   WHERE candidato_id = v_candidato_id
     AND UPPER(cargo) LIKE '%PREFEITO%FORTALEZA%'
     AND UPPER(COALESCE(estado, '')) = 'CE'
     AND COALESCE(periodo_inicio, 0) BETWEEN 1988 AND 1989
     AND COALESCE(periodo_fim, 0) BETWEEN 1990 AND 1991;

  IF v_historico_count <> 1 THEN
    RAISE EXCEPTION 'Pre-condicao falha: esperava exatamente 1 mandato Prefeito de Fortaleza CE 1989-1990 para ciro-gomes, encontrei %', v_historico_count;
  END IF;

  SELECT id INTO v_historico_id
    FROM historico_politico
   WHERE candidato_id = v_candidato_id
     AND UPPER(cargo) LIKE '%PREFEITO%FORTALEZA%'
     AND UPPER(COALESCE(estado, '')) = 'CE'
     AND COALESCE(periodo_inicio, 0) BETWEEN 1988 AND 1989
     AND COALESCE(periodo_fim, 0) BETWEEN 1990 AND 1991;
END $$;

WITH seed_rows(
  id_sapl, numero, ano, data_norma, ementa, veiculo_publicacao
) AS (
  VALUES
    (3004::INT, '6586', 1989, DATE '1989-12-14', 'FIXA O VALOR DO METRO QUADRADO DOS TERRENOS E EDIFICAÇÕES PARA EFEITO DE LANÇAMENTO DO IMPOSTO SOBRE A PROPRIEDADE PREDIAL E TERRITORIAL URBANA.', 'DOM 9269'),
    (3121::INT, '6573', 1989, DATE '1989-12-11', 'DISPÕE SOBRE CONVÊNIOS ENTRE A SECRETARIA DE EDUCAÇAO DO MUNICÍPIO E ESCOLAS PARTICULARES.', NULL),
    (3122::INT, '6572', 1989, DATE '1989-12-11', 'DENOMINA DE RUA EGBERTO DE PAULA PESSOA, UMA ARTÉRIA DE FORTALEZA.', NULL),
    (3123::INT, '6571', 1989, DATE '1989-12-06', 'DENOMINA DE RUA HUGO DE BRITO FIRMEZA UMA ARTÉRIA DE FORTALEZA.', NULL),
    (3231::INT, '6567', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A ALIANÇA COMUNITÁRIA TANCREDO NEVES.', NULL),
    (3262::INT, '6552', 1989, DATE '1989-11-29', 'INSTITUI O DIA MUNICIPAL DA SOLIDARIEDADE AO POVO PALESTINO.', NULL),
    (486::INT,  '6540', 1989, DATE '1989-11-21', 'EXTINGUE OS CARGOS EM COMISSÃO SIMBOLOGIA APV E API, CRIA OS CARGOS DE ASSESSOR PARLAMENTAR APV E API NA ESTRUTURA DA CAMARA MUNICIPAL.', NULL),
    (2967::INT, '6498', 1989, DATE '1989-09-29', 'ASSEGURA AOS ESTUDANTES CINQUENTA POR CENTO (50%) DE ABATIMENTOS NOS ESTABELECIMENTOS DE DIVERSAO E LAZER NO MUNICIPIO.', NULL),
    (3181::INT, '6465', 1989, DATE '1989-06-14', 'DISPÕE SOBRE O LIVRE ESTACIONAMENTO DE VEÍCULOS EM FRENTE A TODAS AS FARMÁCIAS DE PLANTAO NO MUNICIPIO.', NULL),
    (2862::INT, '6453', 1989, DATE '1989-06-06', 'CRIA A ZONA DE PRESERVAÇÃO HISTÓRICA - ZPH, E ESTABELECE NORMAS GERAIS DE PROTEÇÃO.', NULL)
)
INSERT INTO legislacao_mandato_executivo (
  candidato_id,
  historico_politico_id,
  tipo_relacao,
  esfera,
  uf_norma,
  municipio_norma,
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
  c.id AS candidato_id,
  hp.id AS historico_politico_id,
  'lei_sancionada' AS tipo_relacao,
  'municipal' AS esfera,
  'CE' AS uf_norma,
  'Fortaleza' AS municipio_norma,
  'Lei Ordinária' AS tipo_norma,
  s.numero,
  s.ano,
  s.data_norma,
  s.ementa,
  'CIRO FERREIRA GOMES' AS signatario,
  'titular' AS autoridade_papel,
  'https://sapl.fortaleza.ce.leg.br/norma/' || s.id_sapl::TEXT AS fonte_primaria_url,
  'SAPL - Camara Municipal de Fortaleza' AS fonte_primaria_titulo,
  NULL AS fonte_tramitacao_url,
  'SAPL-FOR:' || s.id_sapl::TEXT AS identificador_fonte,
  jsonb_build_object(
    'coverage_scope', 'fortaleza_municipal_lote_a_pdf_signatario_20260504',
    'audit_artifact', 'fonte interna de curadoria',
    'fonte_pdf_texto_integral', 'https://sapl.fortaleza.ce.leg.br/media/sapl/public/normajuridica/' || s.ano::TEXT || '/' || s.id_sapl::TEXT || '/' || s.id_sapl::TEXT || '_texto_integral.pdf',
    'veiculo_publicacao', s.veiculo_publicacao,
    'signature_method', 'pdftotext_textual_evidence',
    'signature_evidence_pattern', 'CIRO FERREIRA GOMES + Prefeito Municipal'
  ) AS metadata
FROM seed_rows s
CROSS JOIN candidatos c
JOIN historico_politico hp
  ON hp.candidato_id = c.id
 AND UPPER(hp.cargo) LIKE '%PREFEITO%FORTALEZA%'
 AND UPPER(COALESCE(hp.estado, '')) = 'CE'
 AND COALESCE(hp.periodo_inicio, 0) BETWEEN 1988 AND 1989
 AND COALESCE(hp.periodo_fim, 0) BETWEEN 1990 AND 1991
WHERE c.slug = 'ciro-gomes'
  AND NOT EXISTS (
    SELECT 1 FROM legislacao_mandato_executivo lme
     WHERE lme.identificador_fonte = 'SAPL-FOR:' || s.id_sapl::TEXT
  );

DO $$
DECLARE
  v_count INTEGER;
  v_signatarios INTEGER;
  v_candidato_id UUID;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'ciro-gomes';
  SELECT COUNT(*) INTO v_count
    FROM legislacao_mandato_executivo
   WHERE candidato_id = v_candidato_id
     AND esfera = 'municipal'
     AND uf_norma = 'CE'
     AND municipio_norma = 'Fortaleza'
     AND metadata->>'coverage_scope' = 'fortaleza_municipal_lote_a_pdf_signatario_20260504';
  SELECT COUNT(DISTINCT signatario) INTO v_signatarios
    FROM legislacao_mandato_executivo
   WHERE candidato_id = v_candidato_id
     AND esfera = 'municipal'
     AND metadata->>'coverage_scope' = 'fortaleza_municipal_lote_a_pdf_signatario_20260504';
  RAISE NOTICE 'Pos-apply ciro-gomes Fortaleza Lote A: rows=% signatarios_distintos=% (esperado 10/1)', v_count, v_signatarios;
  IF v_count <> 10 THEN
    RAISE EXCEPTION 'Pos-condicao falha: esperava 10 rows fortaleza_municipal_lote_a_pdf_signatario_20260504, encontrei %', v_count;
  END IF;
  IF v_signatarios <> 1 THEN
    RAISE EXCEPTION 'Pos-condicao falha: esperava 1 signatario distinto (CIRO FERREIRA GOMES), encontrei %', v_signatarios;
  END IF;
END $$;
