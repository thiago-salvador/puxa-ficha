-- ============================================
-- Legislacao full-site: Lote C Executivo residuais
-- Seed ampliado parcial: 6 slugs / fontes oficiais primarias
-- ============================================
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = legislacao-lote-c-executivo-residuais-20260508
--   coverage_scope = inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508
--
-- Esta migration escreve somente em legislacao_mandato_executivo.
-- Esta migration NAO escreve em projetos_lei.
-- Esta migration NAO escreve em historico_politico.
-- ============================================

CREATE TEMP TABLE _seed_lote_c_executivo_residuais_lme ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    ('edilson-damiao', 'governador', 'lei_sancionada', 'estadual', 'RR', NULL, 'lei', '1.887', 2023, '2023-12-06', 'Altera a ementa e acrescenta o artigo 44-A a Lei no 965, de 17 de abril de 2014, que institui o Estatuto da Pessoa com Deficiencia nos limites territoriais do Estado de Roraima e da outras providencias.', 'EDILSON DAMIAO LIMA', 'vice_interino', 'https://api.transparencia.rr.gov.br/storage/legislacoes/3821fac1-c06f-40f6-9af9-9b6ab4161d4b.pdf', 'Diario Oficial do Estado de Roraima - Edicao 4574', NULL, 'DOE-RR:2023-12-06:LEI-1887', '{"source":"Diario Oficial do Estado de Roraima - Edicao 4574","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governador do Estado de Roraima em Exercicio","official_source_origin":"https://api.transparencia.rr.gov.br","official_source_cutoff":"PDF oficial especifico da legislacao RR publicado em 06/12/2023; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"edilson-damiao","identificador_fonte":"DOE-RR:2023-12-06:LEI-1887","fonte_primaria_url":"https://api.transparencia.rr.gov.br/storage/legislacoes/3821fac1-c06f-40f6-9af9-9b6ab4161d4b.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":396957}}'::jsonb),
    ('edilson-damiao', 'governador', 'lei_sancionada', 'estadual', 'RR', NULL, 'lei', '1.888', 2023, '2023-12-06', 'Dispoe sobre o atendimento prioritario a pessoas portadoras de Lupus Eritematoso Sistemico - LES, nos hospitais, ambulatorios, unidades de saude e demais estabelecimentos congeneres da rede publica e privada de saude do Estado de Roraima.', 'EDILSON DAMIAO LIMA', 'vice_interino', 'https://api.transparencia.rr.gov.br/storage/legislacoes/3821fac1-c06f-40f6-9af9-9b6ab4161d4b.pdf', 'Diario Oficial do Estado de Roraima - Edicao 4574', NULL, 'DOE-RR:2023-12-06:LEI-1888', '{"source":"Diario Oficial do Estado de Roraima - Edicao 4574","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governador do Estado de Roraima em Exercicio","official_source_origin":"https://api.transparencia.rr.gov.br","official_source_cutoff":"PDF oficial especifico da legislacao RR publicado em 06/12/2023; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"edilson-damiao","identificador_fonte":"DOE-RR:2023-12-06:LEI-1888","fonte_primaria_url":"https://api.transparencia.rr.gov.br/storage/legislacoes/3821fac1-c06f-40f6-9af9-9b6ab4161d4b.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":396957}}'::jsonb),
    ('edilson-damiao', 'governador', 'lei_sancionada', 'estadual', 'RR', NULL, 'lei', '1.889', 2023, '2023-12-06', 'Altera a Lei no 1.497, de 9 de agosto de 2021, que dispoe sobre a definicao, ordenacao e regularizacao da area do Distrito Industrial Governador Aquilino Mota Duarte, e da outras providencias.', 'EDILSON DAMIAO LIMA', 'vice_interino', 'https://api.transparencia.rr.gov.br/storage/legislacoes/3821fac1-c06f-40f6-9af9-9b6ab4161d4b.pdf', 'Diario Oficial do Estado de Roraima - Edicao 4574', NULL, 'DOE-RR:2023-12-06:LEI-1889', '{"source":"Diario Oficial do Estado de Roraima - Edicao 4574","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governador do Estado de Roraima em Exercicio","official_source_origin":"https://api.transparencia.rr.gov.br","official_source_cutoff":"PDF oficial especifico da legislacao RR publicado em 06/12/2023; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"edilson-damiao","identificador_fonte":"DOE-RR:2023-12-06:LEI-1889","fonte_primaria_url":"https://api.transparencia.rr.gov.br/storage/legislacoes/3821fac1-c06f-40f6-9af9-9b6ab4161d4b.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":396957}}'::jsonb),
    ('edilson-damiao', 'governador', 'lei_sancionada', 'estadual', 'RR', NULL, 'lei', '1.890', 2023, '2023-12-06', 'Autoriza o Poder Executivo a remanejar recursos provenientes de receita de alienacoes de terras publicas do Estado de Roraima, no valor global de R$ 37.000.000,00, para reforco de dotacoes constantes da Lei Orcamentaria vigente, para aplicacao em investimentos no desenvolvimento do Estado de Roraima.', 'EDILSON DAMIAO LIMA', 'vice_interino', 'https://api.transparencia.rr.gov.br/storage/legislacoes/3821fac1-c06f-40f6-9af9-9b6ab4161d4b.pdf', 'Diario Oficial do Estado de Roraima - Edicao 4574', NULL, 'DOE-RR:2023-12-06:LEI-1890', '{"source":"Diario Oficial do Estado de Roraima - Edicao 4574","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governador do Estado de Roraima em Exercicio","official_source_origin":"https://api.transparencia.rr.gov.br","official_source_cutoff":"PDF oficial especifico da legislacao RR publicado em 06/12/2023; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"edilson-damiao","identificador_fonte":"DOE-RR:2023-12-06:LEI-1890","fonte_primaria_url":"https://api.transparencia.rr.gov.br/storage/legislacoes/3821fac1-c06f-40f6-9af9-9b6ab4161d4b.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":396957}}'::jsonb),
    ('hana-ghassan', 'governador', 'lei_sancionada', 'estadual', 'PA', NULL, 'lei', '11.359', 2026, '2026-04-07', 'Institui a Semana Estadual de Atencao, Conscientizacao e Prevencao sobre as Doencas Causadas pelo Vicio em Jogos de Apostas Online, no ambito do Estado do Para.', 'HANA GHASSAN TUMA', 'titular', 'https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf', 'Diario Oficial do Estado do Para - IOEPA - 08/04/2026', NULL, 'IOEPA:2026-04-08:LEI-11359', '{"source":"Diario Oficial do Estado do Para - IOEPA - 08/04/2026","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governadora do Estado","official_source_origin":"https://www.ioepa.com.br","official_source_cutoff":"PDF oficial especifico do DOE/PA de 08/04/2026; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"hana-ghassan","identificador_fonte":"IOEPA:2026-04-08:LEI-11359","fonte_primaria_url":"https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":4232480}}'::jsonb),
    ('hana-ghassan', 'governador', 'lei_sancionada', 'estadual', 'PA', NULL, 'lei', '11.360', 2026, '2026-04-07', 'Declara como patrimonio cultural de natureza imaterial do Estado do Para, o Festival da Gurijuba do Municipio de Vigia de Nazare.', 'HANA GHASSAN TUMA', 'titular', 'https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf', 'Diario Oficial do Estado do Para - IOEPA - 08/04/2026', NULL, 'IOEPA:2026-04-08:LEI-11360', '{"source":"Diario Oficial do Estado do Para - IOEPA - 08/04/2026","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governadora do Estado","official_source_origin":"https://www.ioepa.com.br","official_source_cutoff":"PDF oficial especifico do DOE/PA de 08/04/2026; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"hana-ghassan","identificador_fonte":"IOEPA:2026-04-08:LEI-11360","fonte_primaria_url":"https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":4232480}}'::jsonb),
    ('hana-ghassan', 'governador', 'lei_sancionada', 'estadual', 'PA', NULL, 'lei', '11.361', 2026, '2026-04-07', 'Declara e reconhece como de utilidade publica para o Estado do Para, a Associacao Esportiva de Brazilian Jiu-Jitsu (ASEBJJ), localizada no Municipio de Santarem.', 'HANA GHASSAN TUMA', 'titular', 'https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf', 'Diario Oficial do Estado do Para - IOEPA - 08/04/2026', NULL, 'IOEPA:2026-04-08:LEI-11361', '{"source":"Diario Oficial do Estado do Para - IOEPA - 08/04/2026","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governadora do Estado","official_source_origin":"https://www.ioepa.com.br","official_source_cutoff":"PDF oficial especifico do DOE/PA de 08/04/2026; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"hana-ghassan","identificador_fonte":"IOEPA:2026-04-08:LEI-11361","fonte_primaria_url":"https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":4232480}}'::jsonb),
    ('hana-ghassan', 'governador', 'lei_sancionada', 'estadual', 'PA', NULL, 'lei', '11.362', 2026, '2026-04-07', 'Denomina de Usina da Paz Avenir Carlos de Freitas a Usina da Paz que integra o Programa Territorios pela Paz (TerPaz), em construcao no Complexo VS-10, no Municipio de Parauapebas.', 'HANA GHASSAN TUMA', 'titular', 'https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf', 'Diario Oficial do Estado do Para - IOEPA - 08/04/2026', NULL, 'IOEPA:2026-04-08:LEI-11362', '{"source":"Diario Oficial do Estado do Para - IOEPA - 08/04/2026","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governadora do Estado","official_source_origin":"https://www.ioepa.com.br","official_source_cutoff":"PDF oficial especifico do DOE/PA de 08/04/2026; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"hana-ghassan","identificador_fonte":"IOEPA:2026-04-08:LEI-11362","fonte_primaria_url":"https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":4232480}}'::jsonb),
    ('hana-ghassan', 'governador', 'lei_sancionada', 'estadual', 'PA', NULL, 'lei', '11.363', 2026, '2026-04-07', 'Declara e reconhece como de utilidade publica para o Estado do Para, o Instituto Flamenguinho (INFLA).', 'HANA GHASSAN TUMA', 'titular', 'https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf', 'Diario Oficial do Estado do Para - IOEPA - 08/04/2026', NULL, 'IOEPA:2026-04-08:LEI-11363', '{"source":"Diario Oficial do Estado do Para - IOEPA - 08/04/2026","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governadora do Estado","official_source_origin":"https://www.ioepa.com.br","official_source_cutoff":"PDF oficial especifico do DOE/PA de 08/04/2026; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"hana-ghassan","identificador_fonte":"IOEPA:2026-04-08:LEI-11363","fonte_primaria_url":"https://www.ioepa.com.br/pages/2026/2026.04.08.DOE.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":4232480}}'::jsonb),
    ('lucas-ribeiro', 'governador', 'lei_sancionada', 'estadual', 'PB', NULL, 'lei', '14.343', 2026, '2026-04-14', 'Dispoe sobre os emolumentos dos servicos notariais e de registros publicos no ambito do Estado da Paraiba.', 'LUCAS RIBEIRO NOVAIS DE ARAUJO', 'titular', 'https://auniao.pb.gov.br/servicos/doe/2026/abril/diario-oficial-15-04-2026-portal.pdf', 'Diario Oficial do Estado da Paraiba - A Uniao - 15/04/2026', NULL, 'AUNIAO-PB:2026-04-15:LEI-14343', '{"source":"Diario Oficial do Estado da Paraiba - A Uniao - 15/04/2026","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"DOE/PB traz a lei sancionada pelo Governador do Estado e identifica o governador Lucas Ribeiro Novais de Araujo no expediente da mesma edicao.","official_source_origin":"https://auniao.pb.gov.br","official_source_cutoff":"PDF oficial especifico do DOE/PB de 15/04/2026; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"lucas-ribeiro","identificador_fonte":"AUNIAO-PB:2026-04-15:LEI-14343","fonte_primaria_url":"https://auniao.pb.gov.br/servicos/doe/2026/abril/diario-oficial-15-04-2026-portal.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":1164153}}'::jsonb),
    ('mailza-assis', 'governador', 'lei_sancionada', 'estadual', 'AC', NULL, 'lei', '4.666', 2025, '2025-11-04', 'Fica instituido, no Estado do Acre, o Selo da Agricultura Familiar, com o objetivo de identificar, valorizar e promover a producao agropecuaria artesanal oriunda da agricultura familiar.', 'MAILZA ASSIS DA SILVA', 'vice_interino', 'https://legis.ac.gov.br/detalhar/6686', 'Sistema de Legislacao do Acre - Lei no 4.666', NULL, 'LEGIS-AC:6686:LEI-4666', '{"source":"Sistema de Legislacao do Acre - Lei no 4.666","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei assinada nominalmente como Governadora do Estado do Acre em exercicio","official_source_origin":"https://legis.ac.gov.br","official_source_cutoff":"Pagina oficial individual do Sistema de Legislacao do Acre; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"mailza-assis","identificador_fonte":"LEGIS-AC:6686:LEI-4666","fonte_primaria_url":"https://legis.ac.gov.br/detalhar/6686","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":65014}}'::jsonb),
    ('lahesio-bonfim', 'prefeito', 'lei_sancionada', 'municipal', 'MA', 'Sao Pedro dos Crentes', 'lei municipal', '341/2019', 2019, '2019-07-11', 'Dispoe sobre a reestruturacao do Conselho Municipal de Saude de Sao Pedro dos Crentes e revoga Leis que especifica.', 'LAHESIO RODRIGUES BONFIM', 'titular', 'https://www.saopedrodoscrentes.ma.gov.br/upload/leis/fad28ea147c04dd3060df70be141a317.pdf', 'Prefeitura Municipal de Sao Pedro dos Crentes - Lei no 341/2019', NULL, 'PMSPC-MA:LEI-341-2019', '{"source":"Prefeitura Municipal de Sao Pedro dos Crentes - Lei no 341/2019","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei municipal assinada nominalmente como Prefeito Municipal de Sao Pedro dos Crentes","official_source_origin":"https://www.saopedrodoscrentes.ma.gov.br","official_source_cutoff":"PDF oficial individual listado no portal de leis da Prefeitura de Sao Pedro dos Crentes; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"lahesio-bonfim","identificador_fonte":"PMSPC-MA:LEI-341-2019","fonte_primaria_url":"https://www.saopedrodoscrentes.ma.gov.br/upload/leis/fad28ea147c04dd3060df70be141a317.pdf","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":20080}}'::jsonb),
    ('marcelo-maranata', 'prefeito', 'lei_sancionada', 'municipal', 'RS', 'Guaiba', 'lei municipal', '4.353', 2023, '2023-05-04', 'Institui, no Municipio de Guaiba, o Dia Municipal das Criancas e dos Adolescentes Desaparecidos.', 'MARCELO SOARES REINALDO', 'titular', 'https://www.diariomunicipal.com.br/famurs/load/0B67E9AD', 'Diario Oficial dos Municipios do Estado do Rio Grande do Sul - FAMURS - Guaiba', NULL, 'DOM-RS-FAMURS:0B67E9AD:LEI-4353', '{"source":"Diario Oficial dos Municipios do Estado do Rio Grande do Sul - FAMURS - Guaiba","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_id":"legislacao-lote-c-executivo-residuais-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508","tabela_alvo":"legislacao_mandato_executivo","legislacao_mandato_executivo_mixed":false,"projetos_lei_mixed":false,"historico_politico_id_inferido_por_data":false,"autoridade_papel_basis":"lei municipal assinada nominalmente como Prefeito Municipal de Guaiba","official_source_origin":"https://www.diariomunicipal.com.br","official_source_cutoff":"Materia individual publicada no DOM/RS FAMURS, edicao 3563 de 05/05/2023; sublote nao declara inventario completo.","fonte_oficial_verificada_em":"2026-05-08T12:21:50.052Z","source_proof":{"slug":"marcelo-maranata","identificador_fonte":"DOM-RS-FAMURS:0B67E9AD:LEI-4353","fonte_primaria_url":"https://www.diariomunicipal.com.br/famurs/load/0B67E9AD","http_status":200,"contains_numero":true,"contains_data":true,"contains_ementa":true,"contains_signatario":true,"contains_autoridade":true,"contains_all_needles":true,"source_text_length":31404}}'::jsonb)
) AS v(
  slug,
  mandato_cargo,
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
);

DO $$
DECLARE
  rec record;
  cand_id uuid;
  is_public boolean;
  lme_total int;
  target_count int;
  expected_count int;
  projetos_count int;
  mandato_count int;
BEGIN
  FOR rec IN SELECT slug, count(*)::int AS expected_count FROM _seed_lote_c_executivo_residuais_lme GROUP BY slug LOOP
    SELECT id, publicavel INTO cand_id, is_public FROM candidatos WHERE slug = rec.slug;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: candidato ausente neste banco local/CI minimo; seed Lote C pulado', rec.slug;
      CONTINUE;
    END IF;

    IF is_public IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'Pre-condicao Lote C %: candidato nao publicavel', rec.slug;
    END IF;

    expected_count := rec.expected_count;

    SELECT count(*) INTO lme_total
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id;

    SELECT count(*) INTO target_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id
      AND metadata->>'coverage_id' = 'legislacao-lote-c-executivo-residuais-20260508';

    IF lme_total NOT IN (0, expected_count) THEN
      RAISE EXCEPTION 'Pre-condicao Lote C %: esperadas 0 rows atuais ou % rows idempotentes em legislacao_mandato_executivo, encontradas %', rec.slug, expected_count, lme_total;
    END IF;

    IF lme_total = expected_count AND target_count <> expected_count THEN
      RAISE EXCEPTION 'Pre-condicao Lote C %: % rows existentes, mas apenas % com coverage_id alvo', rec.slug, expected_count, target_count;
    END IF;

    SELECT count(*) INTO projetos_count
    FROM projetos_lei
    WHERE candidato_id = cand_id;

    IF projetos_count <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao Lote C %: projetos_lei deve permanecer 0, encontrado %', rec.slug, projetos_count;
    END IF;

    SELECT count(*) INTO mandato_count
    FROM historico_politico hp
    WHERE hp.candidato_id = cand_id
      AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
      AND UPPER(COALESCE(hp.estado, '')) IN (
        SELECT DISTINCT uf_norma FROM _seed_lote_c_executivo_residuais_lme WHERE slug = rec.slug
      )
      AND EXISTS (
        SELECT 1
        FROM _seed_lote_c_executivo_residuais_lme s
        WHERE s.slug = rec.slug
          AND COALESCE(hp.periodo_inicio, s.ano) <= s.ano
          AND COALESCE(hp.periodo_fim, s.ano) >= s.ano
          AND (
            (s.mandato_cargo = 'governador' AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico ILIKE '%Governador%'))
            OR
            (s.mandato_cargo = 'prefeito' AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico ILIKE '%Prefeito%'))
          )
          AND (
            s.municipio_norma IS NULL
            OR hp.cargo ILIKE '%' || s.municipio_norma || '%'
            OR hp.observacoes ILIKE '%' || s.municipio_norma || '%'
            OR (rec.slug = 'lahesio-bonfim' AND hp.observacoes ILIKE '%Pedro dos Crentes%')
            OR (rec.slug = 'marcelo-maranata' AND s.mandato_cargo = 'prefeito' AND UPPER(COALESCE(hp.estado, '')) = 'RS')
          )
      );

    IF mandato_count < 1 THEN
      RAISE EXCEPTION 'Pre-condicao Lote C %: mandato executivo compativel nao encontrado em historico_politico', rec.slug;
    END IF;
  END LOOP;
END $$;

WITH target AS (
  SELECT
    c.id AS candidato_id,
    seed.*,
    (
      SELECT hp.id
      FROM historico_politico hp
      WHERE hp.candidato_id = c.id
        AND COALESCE(hp.tipo_evento, 'mandato') = 'mandato'
        AND UPPER(COALESCE(hp.estado, '')) = seed.uf_norma
        AND COALESCE(hp.periodo_inicio, seed.ano) <= seed.ano
        AND COALESCE(hp.periodo_fim, seed.ano) >= seed.ano
        AND (
          (seed.mandato_cargo = 'governador' AND (hp.cargo ILIKE '%Governador%' OR hp.cargo_canonico ILIKE '%Governador%'))
          OR
          (seed.mandato_cargo = 'prefeito' AND (hp.cargo ILIKE '%Prefeito%' OR hp.cargo_canonico ILIKE '%Prefeito%'))
        )
        AND (
          seed.municipio_norma IS NULL
          OR hp.cargo ILIKE '%' || seed.municipio_norma || '%'
          OR hp.observacoes ILIKE '%' || seed.municipio_norma || '%'
          OR (seed.slug = 'lahesio-bonfim' AND hp.observacoes ILIKE '%Pedro dos Crentes%')
          OR (seed.slug = 'marcelo-maranata' AND seed.mandato_cargo = 'prefeito' AND UPPER(COALESCE(hp.estado, '')) = 'RS')
        )
      ORDER BY
        CASE
          WHEN seed.municipio_norma IS NOT NULL AND (hp.cargo ILIKE '%' || seed.municipio_norma || '%' OR hp.observacoes ILIKE '%' || seed.municipio_norma || '%') THEN 0
          ELSE 1
        END,
        hp.periodo_inicio DESC NULLS LAST,
        hp.id
      LIMIT 1
    ) AS historico_politico_id
  FROM _seed_lote_c_executivo_residuais_lme seed
  JOIN candidatos c ON c.slug = seed.slug
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
  target.candidato_id,
  target.historico_politico_id,
  target.tipo_relacao,
  target.esfera,
  target.uf_norma,
  target.municipio_norma,
  target.tipo_norma,
  target.numero,
  target.ano,
  target.data_norma::date,
  target.ementa,
  target.signatario,
  target.autoridade_papel,
  target.fonte_primaria_url,
  target.fonte_primaria_titulo,
  target.fonte_tramitacao_url,
  target.identificador_fonte,
  target.metadata
FROM target
WHERE target.historico_politico_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM legislacao_mandato_executivo lme
    WHERE lme.candidato_id = target.candidato_id
      AND lme.identificador_fonte = target.identificador_fonte
  );

DO $$
DECLARE
  rec record;
  cand_id uuid;
  total_count int;
  scope_count int;
  projetos_count int;
BEGIN
  FOR rec IN SELECT slug, count(*)::int AS expected_count FROM _seed_lote_c_executivo_residuais_lme GROUP BY slug LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = rec.slug;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: pos-condicao pulada porque candidato nao existe neste banco local/CI minimo', rec.slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO total_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id;

    SELECT count(*) INTO scope_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id
      AND metadata->>'coverage_id' = 'legislacao-lote-c-executivo-residuais-20260508'
      AND metadata->>'coverage_scope' = 'inventario_ampliado_parcial_fontes_oficiais_executivo_lote_c_20260508'
      AND metadata->>'tabela_alvo' = 'legislacao_mandato_executivo'
      AND metadata->>'legislacao_mandato_executivo_mixed' = 'false';

    SELECT count(*) INTO projetos_count
    FROM projetos_lei
    WHERE candidato_id = cand_id;

    IF total_count <> rec.expected_count THEN
      RAISE EXCEPTION 'Pos-apply Lote C %: total legislacao_mandato_executivo esperado %, encontrado %', rec.slug, rec.expected_count, total_count;
    END IF;

    IF scope_count <> rec.expected_count THEN
      RAISE EXCEPTION 'Pos-apply Lote C %: esperadas % rows com coverage_id/scope/metadata alvo, encontradas %', rec.slug, rec.expected_count, scope_count;
    END IF;

    IF projetos_count <> 0 THEN
      RAISE EXCEPTION 'Pos-apply Lote C %: projetos_lei deve permanecer 0, encontrado %', rec.slug, projetos_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Pos-apply Lote C Executivo: coverage_id legislacao-lote-c-executivo-residuais-20260508 aplicado e projetos_lei preservada';
END $$;
