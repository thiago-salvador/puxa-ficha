-- ============================================================================
-- Lote B Ciro Gomes Fortaleza OCR (Prompt 17) — leis municipais 1989-1990
--
-- Fonte oficial unica: SAPL - Camara Municipal de Fortaleza
--   https://sapl.fortaleza.ce.leg.br/api/norma/normajuridica/<id>
--
-- Origem dos dados:
--   fonte interna de curadoria
--   (auditoria SAPL + extracao via pdftotext + OCR fallback via tesseract eng)
--
-- Criterio de aceitacao (executado no script auditor OCR):
--   1. esfera_federacao=M (municipal) no SAPL
--   2. tipo = "Lei Ordinaria" (whitelist conservadora)
--   3. PDF de texto_integral baixado e OCR via pdftoppm + tesseract
--   4. OCR contem 'CIRO FERREIRA GOMES' + papel 'Prefeito Municipal'/'PACO DA PREFEITURA'
--   5. OCR NAO contem 'Prefeito em Exercicio' sem nome de Ciro
--   6. Ementa NAO indica Ciro como destinatario/homenageado (titulo de cidadao etc)
--   7. Para datas pos 1990-04-04 (saida antecipada de Ciro), exige marker
--      explicito 'PACO DA PREFEITURA' no OCR para aceitar; address line em cover
--      letter de Camara nao prova sancao.
--
-- Mandato resolvido por subselect (slug + cargo + estado + ano).
-- Sem UUID hardcoded.
--
-- Idempotente: INSERT ... WHERE NOT EXISTS por identificador_fonte = SAPL-FOR:<id>.
-- Bloqueia duplicacao do Lote A (ja aplicado remotamente em 2026-05-04) por
-- forca da clausula NOT EXISTS sobre identificador_fonte unico SAPL-FOR:<id>.
-- coverage_id intencionalmente NULL (lote ampliado parcial, NAO completo).
-- coverage_scope: fortaleza_municipal_lote_b_ocr_signatario_20260504
--
-- DRAFT: nao aplicar ao Supabase remoto sem autorizacao explicita.
-- ============================================================================

DO $$
DECLARE
  v_candidato_id UUID;
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
END $$;

WITH seed_rows(
  id_sapl, numero, ano, data_norma, ementa, veiculo_publicacao
) AS (
  VALUES
    (576::INT, '6421', 1989, DATE '1989-01-30', 'INSTITUI O IMPOSTO SOBRE A TRANSMISSÃO INTER VIVOS, BENS IMÓVEIS E DE DIREITOS REAIS A ELES RELATIVOS E DÁ OUTRAS PROVIDÊNCIAS.', 'DOM Nº 9.050'),
    (5833::INT, '6422', 1989, DATE '1989-03-21', 'Concede o Título de Cidadão de Fortaleza ao Coronel Adelson Leite Julião, na forma que indica.', 'DOM Nº 9094'),
    (3236::INT, '6427', 1989, DATE '1989-04-18', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO BENEFICENTE DE ANTONIO BEZERRA.', '9113'),
    (3234::INT, '6425', 1989, DATE '1989-04-18', 'CONSIDERA DE UTILIDADE PÚBLICA A UNIÃO DO MORADORES DO BAIRRO BOM JARDIM', '9113'),
    (3244::INT, '6436', 1989, DATE '1989-04-25', 'CONSIDERA DE UTILIDADE PÚBLICA A LOJA MAÇÔNICA NOBRE E EXCELSOS CAVALEIROS DO TEMPLO DA ARTE REAL NÉCTAR 64', '9117'),
    (3245::INT, '6435', 1989, DATE '1989-04-25', 'CONSIDERA DE UTILIDADE PÚBLICA A SOCIEDADE BENEFICENTE E RECREATIVA DO PAN AMERICANO', '9116'),
    (3246::INT, '6434', 1989, DATE '1989-04-25', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO EVANGÉLICA DE ASSISTÊNCIA AO IDOSO.', '9116'),
    (3242::INT, '6433', 1989, DATE '1989-04-25', 'CONSIDERA DE UTILIDADE PÚBLICA A UNIÃO DE APOIO AOS MORADORES DA LAGOA FUNDA E ADJACÊNCIAS.', '9116'),
    (3241::INT, '6432', 1989, DATE '1989-04-25', 'CONSIDERA DE UTILIDADE PÚBLICA O CONSELHO COMUNITÁRIO DO PARQUE SÃO JOSÉ', '9116'),
    (3240::INT, '6431', 1989, DATE '1989-04-25', 'CONSIDERA DE UTILIDADE PÚBLICA A ALIANÇA COMUNITÁRIA TANCREDO NEVES', '9115'),
    (3239::INT, '6430', 1989, DATE '1989-04-25', 'CONSIDERA DE UTILIDADE PÚBLICA A LEGIÃO DA BOA VONTADE', '9115'),
    (3238::INT, '6429', 1989, DATE '1989-04-25', 'CONCEDE O TÍTULO DE CIDADÃO DE FORTALEZA AO SR. ABÍLIO NOGUEIRA DUARTE. (ASSIS-SP)', '9115'),
    (3237::INT, '6428', 1989, DATE '1989-04-25', 'CONSIDERA DE UTILIDADE PÚBLICA O CENTRO BENEFICENTE DO ESTUDANTE CARENTE.', '9113'),
    (5837::INT, '6444', 1989, DATE '1989-05-03', 'Dá nova redação ao artigo 58 da Lei nº 5.869/84, na forma que indica.', 'DOM Nº 9121'),
    (5836::INT, '6443', 1989, DATE '1989-05-03', 'Denomina de Dr. Hélio Abreu uma artéria de Fortaleza.', 'DOM Nº 9121'),
    (5838::INT, '6445', 1989, DATE '1989-05-11', 'Concede o Título de CIDADÃO DE FORTALEZA, ao Dr. CLODOMIR TEÓFILO GIRÃO.', 'DOM Nº 9123'),
    (5842::INT, '6451', 1989, DATE '1989-05-23', 'Considera de utilidade pública a ASSOCIAÇÃO DE PAIS E AMIGOS DO DEFICIENTE AUDITIVO (APADA), na forma que indica.', 'DOM Nº 9128'),
    (5841::INT, '6450', 1989, DATE '1989-05-23', 'Considera de utilidade pública o CONSELHO DOS MORADORES DO PARQUE APOLO XI, na forma que indica.', 'DOM Nº 9128'),
    (5852::INT, '6464', 1989, DATE '1989-06-07', 'Considera de utilidade pública a ASSOCIAÇÃO COMUNITÁRIA DO CENTRO SOCIAL ALTO DA PAZ, na forma que indica.', 'DOM Nº 9146'),
    (5851::INT, '6462', 1989, DATE '1989-06-07', 'Concede o TÍTULO DE CIDADÃO DE FORTALEZA ao Sr. RAIMUNDO HÉLIO LEITE.', 'DOM Nº 9146'),
    (5850::INT, '6461', 1989, DATE '1989-06-07', 'Considera de utilidade pública a UNIÃO BENEFICENTE FRANCISCO CABRAL DIAS, na forma que indica.', 'DOM Nº 9146'),
    (5849::INT, '6460', 1989, DATE '1989-06-07', 'Considera de utilidade pública a UNIÃO DOS MORADORES DO BAIRRO DE SANTA CECÍLIA, na forma que indica.', 'DOM Nº 9146'),
    (5848::INT, '6459', 1989, DATE '1989-06-07', 'Considera de utilidade pública a ASSOCIAÇÃO ATLÉTICA JUVENTOS, na forma que indica.', 'DOM Nº 9145'),
    (5847::INT, '6458', 1989, DATE '1989-06-07', 'Considera de utilidade pública a ASSOCIAÇÃO IPIRANGA DOS MORADORES DA SERRINHA, na forma que indica.', 'DOM Nº 9145'),
    (5846::INT, '6457', 1989, DATE '1989-06-07', 'Considera de utilidade pública o CONSELHO UNIÃO DE COMUNIDADE, que compreende os bairros de Monte Castelo, Ellery, Morro do Ouro, Santa Maria e adjacentes, na forma que indica.', 'DOM Nº 9145'),
    (5845::INT, '6456', 1989, DATE '1989-06-07', 'Considera de utilidade pública a ASSOCIAÇÃO DOS MORADORES DO PARQUE ÁGUA FRIA, na forma que indica.', 'DOM Nº 9144'),
    (5855::INT, '6468', 1989, DATE '1989-06-14', 'Oficializa o congnome da Via Pública de denominação RUA DONA FILÓ, na forma que indica.', 'DOM Nº 9148'),
    (5854::INT, '6467', 1989, DATE '1989-06-14', 'Denomina de BERTRAND ALPHONSE BORIS uma artéria de Fortaleza.', 'DOM Nº 9148'),
    (5853::INT, '6466', 1989, DATE '1989-06-14', 'Autoriza os valores dos Vencimentos mensais dos servidores da Câmara Municipal de Fortaleza e adota outras providências.', 'DOM Nº 9147'),
    (5856::INT, '6471', 1989, DATE '1989-06-21', 'Revoga as Leis de nºs 5.934, de 21 de dezembro de 1984 e 6.159, de 01 de dezembro de 1986 que desafetam bens de uso comum do povo, que autorizam permuta com os terrenos que indicam e dá outras providências.', 'DOM Nº 9151'),
    (3182::INT, '6470', 1989, DATE '1989-06-21', 'DISPÕE SOBRE AS ISENÇÕES DE TRIBUTOS MUNICIPAIS.', '9151'),
    (5878::INT, '6487', 1989, DATE '1989-09-08', 'Considera de utilidade pública a ASSOCIAÇÃO ESPORTIVA DO BAIRRO JOÃO ARRUDA -AEBJA, na forma que indica.', 'DOM Nº 6487'),
    (4927::INT, '6526', 1989, DATE '1989-09-09', 'DENOMINA DE RUA CELESTE ARRUDA UMA ARTÉRIA DE FORTALEZA. (EDSON QUEIROZ 	FORTALEZA/CE	60834-455)', '9252'),
    (3890::INT, '6490', 1989, DATE '1989-09-26', 'ATUALIZA OS VALORES DOS VENCIMENTOS DOS SERVIDORES DA CÂMARA MUNICIPAL DE FORTALEZA E ADOTA OUTRAS PROVIDÊNCIAS.', '9214'),
    (5880::INT, '6491', 1989, DATE '1989-09-28', 'Concede o Título de CIDADÃO DE FORTALEZA ao DR. JOSÉ PEREIRA E SILVA, na forma que indica.', 'DOM Nº 9236'),
    (5885::INT, '6496', 1989, DATE '1989-09-29', 'Desafeta do domínio público a área que indica e adota outras providências.', 'DOM Nº 9231'),
    (5883::INT, '6494', 1989, DATE '1989-09-29', 'Considera de utilidade pública a ASSOCIAÇÃO DOS MORADORES LUÍS COELHO, na forma que indica.', 'DOM Nº 9236'),
    (3889::INT, '6513', 1989, DATE '1989-10-11', 'ESTABELECE NORMAS PARA DISCIPLINAR A ABERTURA DE OBRAS NAS VIAS PÚBLICAS E DÁ OUTRAS PROVIDÊNCIAS.', '9254'),
    (5898::INT, '6511', 1989, DATE '1989-10-11', 'Considera de utilidade pública a ASSOCIAÇÃO BENEFICENTE DOS MORADORES DE CANINDEZINHO, na forma que indica.', 'DOM Nº 9254'),
    (5897::INT, '6510', 1989, DATE '1989-10-11', 'Considera de utilidade pública a ASSOCIAÇÃO COMUNITÁRIA DO BAIRRO DA SERRINHA, na forma que indica.', 'DOM N 9254'),
    (5896::INT, '6509', 1989, DATE '1989-10-11', 'Considera de utilidade pública a UNIÃO DOS MORADORES DO PARQUE IRACEMA, na forma que indica.', 'DOM Nº 9254'),
    (5894::INT, '6507', 1989, DATE '1989-10-11', 'Considera de utilidade pública a ASSOCIAÇÃO DOS MORADORES DA PRAIA DE IRACEMA - AMPI, na forma que indica.', 'DOM Nº 9254'),
    (5892::INT, '6505', 1989, DATE '1989-10-11', 'Considera de utilidade pública o CONSELHO COMUNITÁRIO DO PARQUE SANTA ROSA, na forma que indica.', 'DOM Nº 9254'),
    (5890::INT, '6502', 1989, DATE '1989-10-11', 'Denomina de Travessa Izaura, uma artéria de Fortaleza.', 'DOM Nº 9254'),
    (5889::INT, '6501', 1989, DATE '1989-10-11', 'Denomina de rua Dna. Sara Mesquita, uma artéria de Fortaleza.', 'DOM Nº 9254'),
    (5888::INT, '6500', 1989, DATE '1989-10-11', 'Denomina de FREI TITO ALENCAR uma artéria de Fortaleza.', 'DOM Nº 9254'),
    (5907::INT, '6521', 1989, DATE '1989-10-26', 'Oficializa a denominação da Rua Graciosa na forma que indica.', 'DOM Nº 9241'),
    (5903::INT, '6517', 1989, DATE '1989-10-26', 'Considera de utilidade pública a ASSOCIAÇÃO DE MORADORES UNIÃO POPULAR', 'DOM Nº 9241'),
    (5902::INT, '6516', 1989, DATE '1989-10-26', 'Considera de utilidade pública a ASSOCIAÇÃO DOS MORADORES DO BAIRRO DIAS MACEDO, na forma que indica.', 'DOM Nº 9241'),
    (3882::INT, '6539', 1989, DATE '1989-11-09', 'CONSIDERA DE UTILIDADE PÚBLICA A SOCIEDADE COMUNITÁRIA QUINTINO CUNHA - SCQC, NA FORMA QUE INDICA.([CNPJ removido])', NULL),
    (3880::INT, '6538', 1989, DATE '1989-11-09', 'CONSIDERA DE UTILIDADE PÚBLICA A COMUNIDADE RECANTO DO NOSSO SONHO NA FORMA QUE INDICA.', '9252'),
    (3881::INT, '6537', 1989, DATE '1989-11-09', 'CONSIDERA DE UTILIDADE PÚBLICA A SOCIEDADE ALTERNATIVA LAR DE ARUANDA NA FORMA QUE INDICA.([CNPJ removido])', '9252'),
    (3879::INT, '6536', 1989, DATE '1989-11-09', 'CONSIDERA DE UTILIDADE PÚBLICA A LOJA SIMBÓLICA LUZ E UNIÃO Nº 70 NA FORMA QUE INDICA.', '9252'),
    (3878::INT, '6535', 1989, DATE '1989-11-09', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO COMUNITÁRIA DOS MORADORES DA PARQUELÂNDIA  NA FORMA QUE INDICA ([CNPJ removido])', '9252'),
    (3877::INT, '6534', 1989, DATE '1989-11-09', 'CONSIDERA DE UTILIDADE PÚBLICA A LOJA SIMBÓLICA TIRADENTES Nº 53 NA FORMA QUE INDICA ([CNPJ removido])', '9252'),
    (3883::INT, '6533', 1989, DATE '1989-11-09', 'CONSIDERA DE UTILIDADE PÚBLICA O CONSELHO PRO-MELHORAMENTO DO PARQUE SANTA ROSA, NA FORMA QUE INDICA.([CNPJ removido])', '9252'),
    (3885::INT, '6531', 1989, DATE '1989-11-09', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO DE MORADORES DE MARAPONGA, NA FORMA QUE INDICA.([CNPJ removido])', '9252'),
    (3886::INT, '6530', 1989, DATE '1989-11-09', 'DENOMINA DE DR CARLOS RIBEIRO PAMPLONA UMA ARTÉRIA DE FORTALEZA', '9252'),
    (3887::INT, '6529', 1989, DATE '1989-11-09', 'DENOMINA JORNALISTA PAES DE CASTRO UM LOGRADOURO PÚBLICO DA CIDADE.', '9252'),
    (4925::INT, '6528', 1989, DATE '1989-11-09', 'DENOMINA DE RAIMUNDO GIRÃO UMA ARTÉRIA DE FORTALEZA.', '9252'),
    (4926::INT, '6527', 1989, DATE '1989-11-09', 'DISPÕE SOBRE A OBRIGATORIEDADE DE INSTALAÇÃO DE SISTEMA DE ESCAPAMENTOS NOS ÔNIBUS URBANOS DE FORTALEZA E DÁ OUTRAS PROVIDÊNCIAS.', '9252'),
    (4929::INT, '6525', 1989, DATE '1989-11-09', 'DENOMINA DE PRAÇA SENADOR CARLOS JEREISSATI, A ÁREA QUE INDICA.', '9252'),
    (4930::INT, '6524', 1989, DATE '1989-11-09', 'DENOMINA DE RUA ADOLFO MOREIRA CARVALHO UMA ARTÉRIA DE FORTALEZA. (EDSON QUEIROZ 	FORTALEZA/CE	60811-740)', '9252'),
    (4931::INT, '6523', 1989, DATE '1989-11-09', 'CONCEDE O TÍTULO DE CIDADÃO DE FORTALEZA AO DR. PAULO CARLOS SILVA DUARTE, NA FORMA QUE INDICA (LIMOEIRO DO NORTE)', '9252'),
    (3888::INT, '6522', 1989, DATE '1989-11-09', 'CONCEDE O TÍTULO DE CIDADÃO DE FORTALEZA AO SR. RAIMUNDO DELFINO DA SILVA. (CASCAVEL-CE)', '9252'),
    (3269::INT, '6542', 1989, DATE '1989-11-21', 'DENOMINA DE JUSCELINO KUBSTCHEK UMA AVENIDA DE FORTALEZA.', '9256'),
    (3876::INT, '6541', 1989, DATE '1989-11-21', 'CRIA O FUNDO DE TERRAS NO MUNICÍPIO DE FORTALEZA E DÁ OUTRAS PROVIDÊNCIAS.', '9256'),
    (3248::INT, '6565', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO COMUNITÁRIA SÃO PEDRO (CONJUNTO CEARÁ 2ª ETAPA)', '9256'),
    (3249::INT, '6564', 1989, DATE '1989-11-29', 'CONCEDE O TÍTULO DE CIDADÃ DE FORTALEZA A SRA. SILVIA SOUSA MACÊDO (RIO BRANCO - AC)', '9256'),
    (3250::INT, '6563', 1989, DATE '1989-11-29', 'CONCEDE PASSE LIVRE LIVRE AO EXCEPCIONAL APARENTE NOS TRANSPORTES COLETIVOS DE FORTALEZA.', '9256'),
    (3251::INT, '6562', 1989, DATE '1989-11-29', 'INSTITUI O DIA MUNICIPAL DO TRABALHADOR GRÁFICO (07 DE FEVEREIRO).', '9256'),
    (3258::INT, '6561', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO BENEFICENTE E EDUCACIONAL DO CONJUNTO ESPERANÇA.', '9256'),
    (3252::INT, '6560', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO DOS MORADORES E AMIGOS DO CARLITO PAMPLONA.', '9256'),
    (3253::INT, '6559', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO DOS MORADORES DO BAIRRO MONTESE.', '9256'),
    (2996::INT, '6558', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA O CENTRO EVANGÉLICO DE REABILITAÇÃO INFANTIL - CERI. ([CNPJ removido])', '9256'),
    (3259::INT, '6557', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A SOCIEDADE DA UNIÃO DOS MORADORES BAIRRO DAS PEDREIRAS.', '9256'),
    (3260::INT, '6555', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA O CONSELHO COMUNITÁRIO DE SEGURANÇA', '9256'),
    (2994::INT, '6554', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO BATISTA BENEFICENTE E MISSIONÁRIA.', '9256'),
    (3263::INT, '6551', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO DOS MORADORES DO BAIRRO SERVILUZ', '9256'),
    (3265::INT, '6550', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A UNIÃO DOS MORADORES DO CONJUNTO ESPERANÇA. [ [CNPJ removido] ]', '9256'),
    (3266::INT, '6549', 1989, DATE '1989-11-29', 'CONSIDERA DE UTILIDADE PÚBLICA A ASSOCIAÇÃO DOS MORADORES DO BAIRRO DA AEROLÂNDIA. [ [CNPJ removido] ]', '9256'),
    (3267::INT, '6548', 1989, DATE '1989-11-29', 'CONCEDE O TÍTULO DE CIDADÃO DE FORTALEZA AO SR. FELIPE TIAGO GOMES (PICUÍ-PB)', '9256'),
    (3264::INT, '6547', 1989, DATE '1989-11-29', 'ATUALIZA OS VALORES DOS VENCIMENTOS DOS SERVIDORES DA CÃMARA MUNICIPAL DE FORTALEZA', '9256'),
    (3875::INT, '6546', 1989, DATE '1989-11-29', 'REAJUSTA OS VALORES DOS VENCIMENTOS, SALÁRIOS, GRATIFICAÇÕES, PROVENTOS E PENSÕES DO PODER EXECUTIVO E DÁ OUTRAS PROVIDÊNCIAS.', '9256'),
    (3001::INT, '6585', 1989, DATE '1989-12-11', 'CRIA O BAIRRO CONJUNTO ESPERANÇA E DÁ OUTRAS PROVIDÊNCIAS.', '9275'),
    (3007::INT, '6584', 1989, DATE '1989-12-11', 'TORNA OBRIGATÓRIO O USO DO SILENCIOSO NO ESCAPAMENTO DE VEÍCULOS AUTOMOTORES NAS ÁREAS URBANAS E PERIFÉRICAS DE FORTALEZA, NA FORMA QUE INDICA.', '9275'),
    (3116::INT, '6579', 1989, DATE '1989-12-11', 'DENOMINA DE JOSÉ SOARES PASSOS UMA ARTÉRIA DE FORTALEZA', '9270'),
    (3120::INT, '6574', 1989, DATE '1989-12-11', 'CONCEDE O TÍTULO DE CIDADÃO DE FORTALEZA AO DR. ANTÔNIO BATISTA VIEIRA. (PADRE ANTÔNIO VIEIRA - VÁRZEA ALEGRE)', '9268'),
    (5831::INT, '6587', 1989, DATE '1989-12-27', 'Estima a Receita e fixa a Despesa do Município para o Exercício financeiro de 1990.', 'DOM Nº 9277'),
    (786::INT, '6590', 1990, DATE '1990-02-05', 'CRIA O SISTEMA MUNICIPAL DE DEFESA CIVIL DE FORTALEZA (SIMDEC), E DA OUTRAS PROVIDENCIAS.', 'DOM n. 9.303'),
    (776::INT, '6589', 1990, DATE '1990-02-05', 'REAJUSTA OS VALORES DOS VENCIMENTOS DOS SERVIDORES DA CÂMARA MUNICIPAL DE FORTALEZA E ADOTA OUTRAS PROVIDÊNCIAS.', 'DOM n. 9.305'),
    (928::INT, '6595', 1990, DATE '1990-03-28', 'REAJUSTA OS VALORES DOS VENCIMENTOS, SALÁRIOS, REPRESENTAÇÕES, GRATIFICAÇÕES, PROVENTOS E PENSÕES DO PODER EXECUTIVO E DÁ OUTRAS PROVIDÊNCIAS.', 'DOM n. 9.340'),
    (926::INT, '6594', 1990, DATE '1990-03-28', 'REAJUSTA OS VALORES DOS VENCIMENTOS, REPRESENTAÇÕES, E GRATIFICAÇÕES DOS SERVIDORES DO PODER LEGISLATIVO MUNICIPAL E ADOTA OUTRAS PROVIDÊNCIAS.', 'DOM n. 9.340')
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
    'coverage_scope', 'fortaleza_municipal_lote_b_ocr_signatario_20260504',
    'audit_artifact', 'fonte interna de curadoria',
    'fonte_pdf_texto_integral', 'https://sapl.fortaleza.ce.leg.br/media/sapl/public/normajuridica/' || s.ano::TEXT || '/' || s.id_sapl::TEXT || '/' || s.id_sapl::TEXT || '_texto_integral.pdf',
    'veiculo_publicacao', s.veiculo_publicacao,
    'signature_method', 'pdftoppm_200dpi_plus_tesseract_eng_fallback',
    'signature_evidence_pattern', 'CIRO FERREIRA GOMES + Prefeito Municipal/Paco Prefeitura'
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
     AND metadata->>'coverage_scope' = 'fortaleza_municipal_lote_b_ocr_signatario_20260504';
  SELECT COUNT(DISTINCT signatario) INTO v_signatarios
    FROM legislacao_mandato_executivo
   WHERE candidato_id = v_candidato_id
     AND esfera = 'municipal'
     AND metadata->>'coverage_scope' = 'fortaleza_municipal_lote_b_ocr_signatario_20260504';
  RAISE NOTICE 'Pos-apply ciro-gomes Fortaleza Lote B (OCR): rows=% signatarios_distintos=% (esperado 93/1)', v_count, v_signatarios;
  IF v_count <> 93 THEN
    RAISE EXCEPTION 'Pos-condicao falha: esperava 93 rows fortaleza_municipal_lote_b_ocr_signatario_20260504, encontrei %', v_count;
  END IF;
  IF v_signatarios <> 1 THEN
    RAISE EXCEPTION 'Pos-condicao falha: esperava 1 signatario distinto (CIRO FERREIRA GOMES), encontrei %', v_signatarios;
  END IF;
END $$;
