-- ============================================================================
-- Full-site Legislacao: Marconi Perillo GO - Legisla Goias Lote A
-- Tabela alvo: legislacao_mandato_executivo
-- Fonte oficial: Casa Civil do Estado de Goias - Legisla Goias
-- Artefato: fonte interna de curadoria
-- Sem escrita em projetos_lei ou historico_politico.
-- Coverage parcial: marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506
-- ============================================================================

DO $$
DECLARE
  v_candidato_id uuid;
  v_hp_count integer;
  v_lme_count integer;
  v_target_count integer;
  v_projetos integer;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'marconi-perillo';
  IF v_candidato_id IS NULL THEN
    RAISE NOTICE 'marconi-perillo: candidato ausente neste banco local/CI minimo; seed LME GO Legisla Goias pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO v_hp_count
  FROM historico_politico hp
  WHERE hp.candidato_id = v_candidato_id
    AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
    AND hp.cargo_canonico = 'Governador'
    AND upper(coalesce(hp.estado, '')) = 'GO'
    AND coalesce(hp.periodo_inicio, 9999) <= 2018
    AND coalesce(hp.periodo_fim, 9999) >= 2018;
  IF v_hp_count < 1 THEN
    RAISE EXCEPTION 'Pre-condicao marconi-perillo: mandato Governador/GO compativel com 2018 nao encontrado';
  END IF;

  SELECT count(*) INTO v_lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id;

  SELECT count(*) INTO v_target_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id
    AND metadata->>'coverage_id' = 'marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506';

  IF v_lme_count NOT IN (0, 20) THEN
    RAISE EXCEPTION 'Pre-condicao marconi-perillo: esperadas 0 rows atuais ou 20 rows alvo idempotentes em LME, encontrei %', v_lme_count;
  END IF;
  IF v_lme_count = 20 AND v_target_count <> 20 THEN
    RAISE EXCEPTION 'Pre-condicao marconi-perillo: 20 rows LME existentes, mas apenas % com coverage_id alvo', v_target_count;
  END IF;

  SELECT count(*) INTO v_projetos
  FROM projetos_lei
  WHERE candidato_id = v_candidato_id;
  IF v_projetos <> 177 THEN
    RAISE EXCEPTION 'Pre-condicao marconi-perillo: projetos_lei deve permanecer 177 rows, encontrei %', v_projetos;
  END IF;
END $$;

WITH seed_rows(legisla_go_id, numero, ano, data_norma, ementa, fonte_primaria_url, fonte_primaria_titulo, fonte_tramitacao_url, identificador_fonte, metadata) AS (
  VALUES
    (99906, '20.033', 2018, DATE '2018-04-06', 'Altera a Lei estadual nº 17.663/2012, que dispõe sobre a Carreira dos Servidores do Poder Judiciário do Estado de Goiás e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99906', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99906', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99906,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99906","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99906","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3432","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99905, '20.032', 2018, DATE '2018-04-06', 'Altera as Leis nos 13.738, de 30 de outubro de 2000, e 19.569, de 29 de dezembro de 2016.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99905', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99905', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99905,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99905","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99905","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3432","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99904, '20.031', 2018, DATE '2018-04-06', 'Concede título de cidadania que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99904', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99904', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99904,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99904","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99904","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3432","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99903, '20.030', 2018, DATE '2018-04-06', 'Autoriza a abertura de crédito especial à Universidade Estadual de Goiás - UEG -, no valor global de R$ 4.500.000,00.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99903', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99903', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99903,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99903","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99903","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3432","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99902, '20.029', 2018, DATE '2018-04-06', 'Altera a Lei nº 19.554, de 21 de dezembro de 2016, que autoriza a alienação, por doação onerosa, do imóvel que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99902', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99902', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99902,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99902","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99902","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3432","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99901, '20.028', 2018, DATE '2018-04-05', 'Institui o Programa Dinheiro Direto no Campus -PROCAMPUS-, no âmbito da Universidade Estadual de Goiás -UEG-, e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99901', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99901', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99901,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99901","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99901","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3432","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99900, '20.027', 2018, DATE '2018-04-03', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99900', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99900', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99900,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99900","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99900","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3430","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99899, '20.026', 2018, DATE '2018-04-03', 'Transforma em Colégio Estadual da Polícia Militar de Goiás -CEPMG- a unidade de ensino que especifica e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99899', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99899', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99899,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99899","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99899","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3430","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99889, '20.023', 2018, DATE '2018-04-02', 'Introduz alterações na Lei nº 10.460, de 22 de fevereiro de 1988, e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99889', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99889', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99889,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99889","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99889","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3427","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99888, '20.022', 2018, DATE '2018-04-02', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99888', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99888', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99888,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99888","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99888","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3427","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99887, '20.021', 2018, DATE '2018-04-02', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99887', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99887', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99887,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99887","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99887","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3427","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99897, '20.020', 2018, DATE '2018-04-02', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99897', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99897', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99897,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99897","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99897","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3426","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99896, '20.019', 2018, DATE '2018-04-02', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99896', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99896', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99896,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99896","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99896","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3426","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99895, '20.018', 2018, DATE '2018-04-02', 'Concede título de cidadania que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99895', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99895', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99895,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99895","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99895","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3426","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99894, '20.017', 2018, DATE '2018-04-02', 'Concede título de cidadania que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99894', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99894', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99894,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99894","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99894","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3426","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99898, '20.016', 2018, DATE '2018-04-02', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99898', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99898', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99898,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99898","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99898","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3428","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99893, '20.015', 2018, DATE '2018-04-02', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99893', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99893', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99893,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99893","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99893","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3426","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99892, '20.014', 2018, DATE '2018-04-02', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99892', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99892', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99892,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99892","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99892","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3426","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99891, '20.013', 2018, DATE '2018-04-02', 'Declara de utilidade pública a entidade que especifica.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99891', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99891', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99891,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99891","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99891","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3426","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb),
    (99890, '20.012', 2018, DATE '2018-04-02', 'Confere denominação à rodovia que especifica e dá outras providências.', 'https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99890', 'Casa Civil do Estado de Goias - Legisla Goias', NULL, 'GO-LEGISLA:99890', '{"source":"Legisla Goias Casa Civil","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"marconi-perillo-go-lote-a-20260506","coverage_id":"marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506","coverage_scope":"go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506","tabela_alvo":"legislacao_mandato_executivo","projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"legisla_go_id":99890,"tipo_legislacao_api":2,"tipo_legislacao_nome":"Lei Ordinária","api_detail_url":"https://legisla.casacivil.go.gov.br/api/v2/pesquisa/legislacoes/99890","public_url":"https://legisla.casacivil.go.gov.br/pesquisa_legislacao/99890","diario_oficial_url":"https://diariooficial.abc.go.gov.br/portal/edicoes/download/3426","signatario_verificado_por":"conteudo_sem_formatacao_full_text","autoridade_papel_basis":"formula_governador_do_estado_e_assinatura_nominal","fonte_oficial_verificada_em":"2026-05-06T10:54:56.361Z"}'::jsonb)
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
  c.id,
  hp.id,
  'lei_sancionada',
  'estadual',
  'GO',
  NULL,
  'lei',
  s.numero,
  s.ano,
  s.data_norma,
  s.ementa,
  'MARCONI FERREIRA PERILLO JÚNIOR',
  'titular',
  s.fonte_primaria_url,
  s.fonte_primaria_titulo,
  s.fonte_tramitacao_url,
  s.identificador_fonte,
  s.metadata
FROM seed_rows s
CROSS JOIN candidatos c
JOIN historico_politico hp
  ON hp.candidato_id = c.id
 AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
 AND hp.cargo_canonico = 'Governador'
 AND upper(coalesce(hp.estado, '')) = 'GO'
 AND coalesce(hp.periodo_inicio, 9999) <= s.ano
 AND coalesce(hp.periodo_fim, 9999) >= s.ano
WHERE c.slug = 'marconi-perillo'
  AND NOT EXISTS (
    SELECT 1 FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = c.id
      AND lme.identificador_fonte = s.identificador_fonte
  );

DO $$
DECLARE
  v_candidato_id uuid;
  v_total integer;
  v_scope integer;
  v_projetos integer;
BEGIN
  SELECT id INTO v_candidato_id FROM candidatos WHERE slug = 'marconi-perillo';
  IF v_candidato_id IS NULL THEN
    RAISE NOTICE 'marconi-perillo: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO v_total
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id;

  SELECT count(*) INTO v_scope
  FROM legislacao_mandato_executivo
  WHERE candidato_id = v_candidato_id
    AND metadata->>'coverage_id' = 'marconi-perillo-go-legisla-goias-ampliado-parcial-lote-a-20260506'
    AND metadata->>'coverage_scope' = 'go_legisla_goias_leis_ordinarias_2018_signatario_lote_a_20260506'
    AND signatario = 'MARCONI FERREIRA PERILLO JÚNIOR'
    AND autoridade_papel = 'titular';

  SELECT count(*) INTO v_projetos
  FROM projetos_lei
  WHERE candidato_id = v_candidato_id;

  IF v_total <> 20 THEN
    RAISE EXCEPTION 'Pos-condicao marconi-perillo: esperava 20 rows LME totais, encontrei %', v_total;
  END IF;
  IF v_scope <> 20 THEN
    RAISE EXCEPTION 'Pos-condicao marconi-perillo: esperava 20 rows com coverage/signatario/titular, encontrei %', v_scope;
  END IF;
  IF v_projetos <> 177 THEN
    RAISE EXCEPTION 'Pos-condicao marconi-perillo: projetos_lei deveria permanecer 177, encontrei %', v_projetos;
  END IF;
  RAISE NOTICE 'Pos-apply marconi-perillo GO Legisla Goias Lote A: lme=% coverage=% projetos_lei=%', v_total, v_scope, v_projetos;
END $$;
