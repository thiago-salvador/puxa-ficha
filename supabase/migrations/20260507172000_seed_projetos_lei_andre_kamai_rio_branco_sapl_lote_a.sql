-- ============================================
-- Legislacao full-site: andre-kamai / SAPL Rio Branco / projetos_lei
-- Seed ampliado_parcial: autoria principal municipal SAPL Rio Branco
-- ============================================
-- Fonte oficial: SAPL Rio Branco
--   https://sapl.riobranco.ac.leg.br/api/parlamentares/parlamentar/?nome_parlamentar=Andr%C3%A9%20Kamai
--   https://sapl.riobranco.ac.leg.br/api/base/autor/?page_size=1000
--   https://sapl.riobranco.ac.leg.br/api/materia/autoria/?autor=138&page_size=100
--   https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/{id}/
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507
--   coverage_scope = inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507
--
-- Filtro factual: autor SAPL 138, parlamentar SAPL 177,
-- primeiro_autor=true, tipos aceitos PLO, PLC, PDL, PRE, PELO,
-- campos oficiais basicos presentes e zero escrita em legislacao_mandato_executivo.

DO $$
DECLARE
  cand_id uuid;
  current_pl_count int;
  current_lme_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'andre-kamai' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'andre-kamai: pre-condicao pulada porque candidato publico nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO current_pl_count FROM projetos_lei WHERE candidato_id = cand_id;
  SELECT count(*) INTO current_lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;

  IF current_pl_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao andre-kamai: projetos_lei esperado 0, encontrado %', current_pl_count;
  END IF;

  IF current_lme_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao andre-kamai: legislacao_mandato_executivo esperado 0, encontrado %', current_lme_count;
  END IF;
END $$;

CREATE TEMP TABLE _seed_andre_kamai_rio_branco_sapl_lote_a (
  tipo text NOT NULL,
  numero text NOT NULL,
  ano int NOT NULL,
  ementa text NOT NULL,
  fonte text NOT NULL,
  proposicao_id_api text NOT NULL,
  url_inteiro_teor text NOT NULL,
  coverage_id text NOT NULL,
  coverage_scope text NOT NULL,
  metadata jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _seed_andre_kamai_rio_branco_sapl_lote_a (
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor,
  coverage_id,
  coverage_scope,
  metadata
)
VALUES
    ('PLO', '42', 2026, 'Denomina de “Charles Vieira da Silva” a Unidade de Saúde da Família USF Maria Áurea Vila Bela, localizada na Avenida dos Ipês, sem número, Loteamento Santa Luzia, no Município de Rio Branco, Estado do Acre, e dá outras providências.', 'SAPL Rio Branco', 'SAPL-RB:43165', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2026/43165/pl_usf_charlesvieira_da_silva_2026.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":43191,"sapl_materia_id":43165,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/43165/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/43191/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '15', 2026, 'Altera dispositivos da Lei Municipal nº 2.654, de 30 de janeiro de 2026, para instituir a Carteira de Identificação da Pessoa com Fibromialgia como meio preferencial de comprovação do atendimento prioritário, dispor sobre sua emissão gratuita pela SEMSA, estabelecer obrigações aos estabelecimentos e vedar exigências e constrangimentos indevidos.', 'SAPL Rio Branco', 'SAPL-RB:41684', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2026/41684/projeto_de_lei_cria_carteirinha_pessoa_com_fibromialgia.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":41713,"sapl_materia_id":41684,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/41684/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/41713/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '6', 2026, 'Dispõe sobre a instituição de mecanismos de incentivo cívico e de responsabilidade viária no Município de Rio Branco, autorizando a conversão do pagamento de multas de trânsito de natureza leve, de competência municipal, em doação de sangue ou cadastro como doador de medula óssea, e estabelece benefício fiscal condicionado à inexistência de infrações de trânsito e à doação regular de sangue, e dá outras providências. A', 'SAPL Rio Branco', 'SAPL-RB:40859', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2026/40859/projeto_de_lei_institui_incentivo_civico_com_doacao_de_sangue_para_pagamento.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":40878,"sapl_materia_id":40859,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/40859/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/40878/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '214', 2025, 'Dispõe sobre a concessão de desconto de 50% (cinquenta por cento) do Imposto Predial e Territorial Urbano (IPTU) para proprietários de imóveis residenciais afetados pela ausência ou deficiência grave de serviços e infraestrutura básica na porta ou no quarteirão de suas residências, e altera o Código Tributário Municipal de Rio Branco.', 'SAPL Rio Branco', 'SAPL-RB:38831', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/38831/pl_isencao_iptu_pavimentacao.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":38821,"sapl_materia_id":38831,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/38831/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/38821/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '213', 2025, 'Institui garantias de inclusão e acessibilidade à criança com deficiência e/ou transtornos do neurodesenvolvimento no ambiente escolar, público e privado, no âmbito do Município de Rio Branco, Estado do Acre, e dá outras providências.', 'SAPL Rio Branco', 'SAPL-RB:38826', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/38826/projeto_de_lei_municipal_de_inclusao_de_criancas_com_deficiencia_na_escola_-_minuta.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":38816,"sapl_materia_id":38826,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/38826/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/38816/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '153', 2025, 'Concede o título de Guardiã da Cultura, da História e da Memória de Rio Branco à senhora Guajarina Lima Margarido.', 'SAPL Rio Branco', 'SAPL-RB:37254', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/37254/projeto_de_resolucao_legislativa_titulo_de_guardiao_da_cultura.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":37226,"sapl_materia_id":37254,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/37254/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/37226/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '145', 2025, 'Reconhece o calendário de eventos diocesanos da Diocese de Rio Branco como, Patrimônio Cultural Imaterial do Município de Rio Branco e dá outras providências.', 'SAPL Rio Branco', 'SAPL-RB:36486', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/36486/pl_pag_1.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":36460,"sapl_materia_id":36486,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/36486/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/36460/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '118', 2025, 'Dispõe sobre a criação do CONSELHO MUNICIPAL DE DESENVOLVIMENTO RURAL E FLORESTAL SUSTENTAVEL-CMDRS de Rio Branco e dá outras providências.', 'SAPL Rio Branco', 'SAPL-RB:35815', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/35815/projeto_de_lei_conselho_mun_desenvolvimento_rural_sustentavel.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":35789,"sapl_materia_id":35815,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/35815/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/35789/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '117', 2025, 'Dispõe sobre a criação da Política Municipal de Linguagem Simples nos Órgãos da Administração Pública Direta e Indireta do município de Rio Branco e dá outras providências.', 'SAPL Rio Branco', 'SAPL-RB:35744', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/35744/projeto_de_lei_politica_municipal_linguagem_simples_orgaos_publicos_da_administracao.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":35709,"sapl_materia_id":35744,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/35744/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/35709/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PDL', '92', 2025, 'Concede o título Campos Pereira ao Senhor Afranio Moura de Lima.', 'SAPL Rio Branco', 'SAPL-RB:38531', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/38531/projeto_de_decreto_legislativo_campos_pereira_do_municipio.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":38521,"sapl_materia_id":38531,"tipo_sigla":"PDL","tipo_descricao":"Projeto de Decreto Legislativo","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/38531/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/38521/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PDL', '83', 2025, 'Concede o título de Cidadão rio-branquense ao senhor Mário Marques Neto.', 'SAPL Rio Branco', 'SAPL-RB:38289', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/38289/projeto_e_documento.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":38278,"sapl_materia_id":38289,"tipo_sigla":"PDL","tipo_descricao":"Projeto de Decreto Legislativo","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/38289/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/38278/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PDL', '79', 2025, 'Concede o título de Cidadão rio-branquense ao senhor Ricardo Alexandre Xavier Gomes.', 'SAPL Rio Branco', 'SAPL-RB:38129', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/38129/projeto__documento.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":38118,"sapl_materia_id":38129,"tipo_sigla":"PDL","tipo_descricao":"Projeto de Decreto Legislativo","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/38129/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/38118/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PDL', '78', 2025, 'Concede o título de Cidadã rio-branquense à senhora Esperanza Lucila Hernández Angulo.', 'SAPL Rio Branco', 'SAPL-RB:38115', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/38115/projeto_e_documento.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":38104,"sapl_materia_id":38115,"tipo_sigla":"PDL","tipo_descricao":"Projeto de Decreto Legislativo","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/38115/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/38104/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PDL', '77', 2025, 'Concede o título de Cidadão rio-branquense ao senhor Roraima Moreira da Rocha.', 'SAPL Rio Branco', 'SAPL-RB:38094', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/38094/projeto__documento.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":38083,"sapl_materia_id":38094,"tipo_sigla":"PDL","tipo_descricao":"Projeto de Decreto Legislativo","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/38094/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/38083/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PLO', '68', 2025, 'CRIA A CENTRAL DE INTÉRPRETES DA LÍNGUA BRASILEIRA DE SINAIS – LIBRAS E GUIAS-INTÉRPRETES NO MUNICÍPIO DE RIO BRANCO E DA OUTRAS PROVIDÊNCIAS.', 'SAPL Rio Branco', 'SAPL-RB:32129', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/32129/projeto_de_lei_central_revisado_assinado.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":32063,"sapl_materia_id":32129,"tipo_sigla":"PLO","tipo_descricao":"Projeto de Lei Ordinária","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/32129/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/32063/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PDL', '47', 2025, 'Concede o título de Empreendedor do Município ao Senhor Alex Costa Cruz.', 'SAPL Rio Branco', 'SAPL-RB:37126', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/37126/projeto_de_decreto_legislativo_empreendedor_do_municipio.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":37098,"sapl_materia_id":37126,"tipo_sigla":"PDL","tipo_descricao":"Projeto de Decreto Legislativo","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/37126/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/37098/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PRE', '38', 2025, 'Dispõe sobre a criação, no âmbito da Câmara Municipal de Rio Branco, da Frente Parlamentar do Cooperativismo, e estabelece suas finalidades e modo de funcionamento.', 'SAPL Rio Branco', 'SAPL-RB:38835', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/38835/projeto_de_resolucao_criacao_da_frente_parlamentar_do_cooperativismo.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":38825,"sapl_materia_id":38835,"tipo_sigla":"PRE","tipo_descricao":"Projeto de Resolução","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/38835/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/38825/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb),
    ('PRE', '25', 2025, 'Concede o Prêmio Mulher Destaque à Senhora Dulcinéa Benício de Araújo.', 'SAPL Rio Branco', 'SAPL-RB:37520', 'http://sapl.riobranco.ac.leg.br/media/sapl/public/materialegislativa/2025/37520/projeto_de_resolucao_premio_mulher_destaque.pdf', 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507', 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507', '{"source":"SAPL Rio Branco","data_real":true,"fluxo":"Legislacao full-site","curation_batch_id":"andre-kamai-rio-branco-sapl-lote-a-20260507","coverage_id":"andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507","coverage_scope":"inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"sapl_base_url":"https://sapl.riobranco.ac.leg.br/api","sapl_autor_id":138,"sapl_parlamentar_id":177,"sapl_autoria_id":37491,"sapl_materia_id":37520,"tipo_sigla":"PRE","tipo_descricao":"Projeto de Resolução","autoria_principal_verificada":true,"primeiro_autor":true,"official_detail_url":"https://sapl.riobranco.ac.leg.br/api/materia/materialegislativa/37520/","official_author_url":"https://sapl.riobranco.ac.leg.br/api/materia/autoria/37491/","fonte_oficial_verificada_em":"2026-05-07T21:27:41.339Z"}'::jsonb);

WITH target AS (
  SELECT c.id AS candidato_id
  FROM candidatos c
  WHERE c.slug = 'andre-kamai' AND c.publicavel = true
)
INSERT INTO projetos_lei (
  candidato_id,
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor,
  coverage_id,
  coverage_scope,
  metadata
)
SELECT
  target.candidato_id,
  seed.tipo,
  seed.numero,
  seed.ano,
  seed.ementa,
  seed.fonte,
  seed.proposicao_id_api,
  seed.url_inteiro_teor,
  seed.coverage_id,
  seed.coverage_scope,
  seed.metadata
FROM target
CROSS JOIN _seed_andre_kamai_rio_branco_sapl_lote_a AS seed
ON CONFLICT (candidato_id, proposicao_id_api) DO UPDATE SET
  tipo = EXCLUDED.tipo,
  numero = EXCLUDED.numero,
  ano = EXCLUDED.ano,
  ementa = EXCLUDED.ementa,
  fonte = EXCLUDED.fonte,
  url_inteiro_teor = EXCLUDED.url_inteiro_teor,
  coverage_id = EXCLUDED.coverage_id,
  coverage_scope = EXCLUDED.coverage_scope,
  metadata = COALESCE(projetos_lei.metadata, '{}'::jsonb) || EXCLUDED.metadata
WHERE projetos_lei.coverage_id IS NULL
   OR projetos_lei.coverage_id = EXCLUDED.coverage_id;

DO $$
DECLARE
  cand_id uuid;
  total_count int;
  target_count int;
  coverage_count int;
  wrong_lme_count int;
  rejected_present_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'andre-kamai' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'andre-kamai: pos-condicao pulada porque candidato publico nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO total_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('SAPL-RB:43165', 'SAPL-RB:41684', 'SAPL-RB:40859', 'SAPL-RB:38831', 'SAPL-RB:38826', 'SAPL-RB:37254', 'SAPL-RB:36486', 'SAPL-RB:35815', 'SAPL-RB:35744', 'SAPL-RB:38531', 'SAPL-RB:38289', 'SAPL-RB:38129', 'SAPL-RB:38115', 'SAPL-RB:38094', 'SAPL-RB:32129', 'SAPL-RB:37126', 'SAPL-RB:38835', 'SAPL-RB:37520');

  SELECT count(*) INTO coverage_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'andre-kamai-rio-branco-sapl-autoria-principal-ampliado-parcial-20260507'
    AND coverage_scope = 'inventario_ampliado_parcial_sapl_rio_branco_autoria_principal_20260507';

  SELECT count(*) INTO wrong_lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO rejected_present_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('SAPL-RB:27961', 'SAPL-RB:27962', 'SAPL-RB:28007', 'SAPL-RB:28034', 'SAPL-RB:28035', 'SAPL-RB:28036', 'SAPL-RB:28037', 'SAPL-RB:28047', 'SAPL-RB:28114', 'SAPL-RB:28141', 'SAPL-RB:28173', 'SAPL-RB:28174', 'SAPL-RB:28175', 'SAPL-RB:28176', 'SAPL-RB:28177', 'SAPL-RB:28178', 'SAPL-RB:28179', 'SAPL-RB:28180', 'SAPL-RB:28181', 'SAPL-RB:28182', 'SAPL-RB:28281', 'SAPL-RB:28304', 'SAPL-RB:28422', 'SAPL-RB:28585', 'SAPL-RB:28913', 'SAPL-RB:28914', 'SAPL-RB:28915', 'SAPL-RB:28916', 'SAPL-RB:29169', 'SAPL-RB:29243', 'SAPL-RB:29244', 'SAPL-RB:29245', 'SAPL-RB:29246', 'SAPL-RB:29247', 'SAPL-RB:29521', 'SAPL-RB:29522', 'SAPL-RB:29523', 'SAPL-RB:29524', 'SAPL-RB:29525', 'SAPL-RB:29757', 'SAPL-RB:29758', 'SAPL-RB:29759', 'SAPL-RB:30238', 'SAPL-RB:30239', 'SAPL-RB:30240', 'SAPL-RB:30241', 'SAPL-RB:30242', 'SAPL-RB:30462', 'SAPL-RB:30526', 'SAPL-RB:30527', 'SAPL-RB:30675', 'SAPL-RB:31152', 'SAPL-RB:31468', 'SAPL-RB:31875', 'SAPL-RB:32201', 'SAPL-RB:33241', 'SAPL-RB:33242', 'SAPL-RB:33243', 'SAPL-RB:33244', 'SAPL-RB:33245', 'SAPL-RB:33246', 'SAPL-RB:33247', 'SAPL-RB:33566', 'SAPL-RB:33631', 'SAPL-RB:34001', 'SAPL-RB:34169', 'SAPL-RB:34228', 'SAPL-RB:34229', 'SAPL-RB:34473', 'SAPL-RB:34474', 'SAPL-RB:34557', 'SAPL-RB:34659', 'SAPL-RB:34660', 'SAPL-RB:34661', 'SAPL-RB:34662', 'SAPL-RB:34663', 'SAPL-RB:34664', 'SAPL-RB:34665', 'SAPL-RB:34666', 'SAPL-RB:34667', 'SAPL-RB:34668', 'SAPL-RB:34669', 'SAPL-RB:34670', 'SAPL-RB:34671', 'SAPL-RB:34672', 'SAPL-RB:34673', 'SAPL-RB:34674', 'SAPL-RB:34675', 'SAPL-RB:34676', 'SAPL-RB:34677', 'SAPL-RB:34678', 'SAPL-RB:34679', 'SAPL-RB:34680', 'SAPL-RB:34681', 'SAPL-RB:34682', 'SAPL-RB:34683', 'SAPL-RB:34683', 'SAPL-RB:34684', 'SAPL-RB:34684', 'SAPL-RB:34685', 'SAPL-RB:34685', 'SAPL-RB:34686', 'SAPL-RB:34686', 'SAPL-RB:34687', 'SAPL-RB:34687', 'SAPL-RB:34688', 'SAPL-RB:34688', 'SAPL-RB:34693', 'SAPL-RB:34693', 'SAPL-RB:35157', 'SAPL-RB:35158', 'SAPL-RB:35159', 'SAPL-RB:35160', 'SAPL-RB:35161', 'SAPL-RB:35162', 'SAPL-RB:35163', 'SAPL-RB:35164', 'SAPL-RB:35173', 'SAPL-RB:35926', 'SAPL-RB:35927', 'SAPL-RB:35928', 'SAPL-RB:35929', 'SAPL-RB:35930', 'SAPL-RB:35931', 'SAPL-RB:35932', 'SAPL-RB:35933', 'SAPL-RB:35934', 'SAPL-RB:35935', 'SAPL-RB:35936', 'SAPL-RB:35937', 'SAPL-RB:35938', 'SAPL-RB:35939', 'SAPL-RB:35940', 'SAPL-RB:35941', 'SAPL-RB:35942', 'SAPL-RB:36386', 'SAPL-RB:36696', 'SAPL-RB:36705', 'SAPL-RB:36766', 'SAPL-RB:37012', 'SAPL-RB:37013', 'SAPL-RB:37015', 'SAPL-RB:37016', 'SAPL-RB:37017', 'SAPL-RB:37018', 'SAPL-RB:37020', 'SAPL-RB:37125', 'SAPL-RB:37325', 'SAPL-RB:38005', 'SAPL-RB:38010', 'SAPL-RB:38011', 'SAPL-RB:38012', 'SAPL-RB:38166', 'SAPL-RB:38589', 'SAPL-RB:38620', 'SAPL-RB:38890', 'SAPL-RB:38891', 'SAPL-RB:38892', 'SAPL-RB:38893', 'SAPL-RB:38894', 'SAPL-RB:38895', 'SAPL-RB:38896', 'SAPL-RB:38897', 'SAPL-RB:38898', 'SAPL-RB:38899', 'SAPL-RB:38900', 'SAPL-RB:38901', 'SAPL-RB:38902', 'SAPL-RB:38903', 'SAPL-RB:38904', 'SAPL-RB:38905', 'SAPL-RB:38906', 'SAPL-RB:39087', 'SAPL-RB:39366', 'SAPL-RB:39367', 'SAPL-RB:39368', 'SAPL-RB:39369', 'SAPL-RB:39370', 'SAPL-RB:39371', 'SAPL-RB:39372', 'SAPL-RB:39373', 'SAPL-RB:39374', 'SAPL-RB:39375', 'SAPL-RB:39376', 'SAPL-RB:39377', 'SAPL-RB:39378', 'SAPL-RB:39379', 'SAPL-RB:39380', 'SAPL-RB:39404', 'SAPL-RB:39547', 'SAPL-RB:39910', 'SAPL-RB:39911', 'SAPL-RB:39912', 'SAPL-RB:39913', 'SAPL-RB:39914', 'SAPL-RB:39956', 'SAPL-RB:40133', 'SAPL-RB:40134', 'SAPL-RB:40135', 'SAPL-RB:40136', 'SAPL-RB:40137', 'SAPL-RB:40141', 'SAPL-RB:40142', 'SAPL-RB:40399', 'SAPL-RB:40400', 'SAPL-RB:40401', 'SAPL-RB:40402', 'SAPL-RB:40403', 'SAPL-RB:40404', 'SAPL-RB:40405', 'SAPL-RB:40406', 'SAPL-RB:40407', 'SAPL-RB:40408', 'SAPL-RB:40409', 'SAPL-RB:40410', 'SAPL-RB:40411', 'SAPL-RB:40412', 'SAPL-RB:40413', 'SAPL-RB:40414', 'SAPL-RB:40415', 'SAPL-RB:40416', 'SAPL-RB:40417', 'SAPL-RB:40418', 'SAPL-RB:40419', 'SAPL-RB:40420', 'SAPL-RB:40421', 'SAPL-RB:40422', 'SAPL-RB:40423', 'SAPL-RB:40424', 'SAPL-RB:40425', 'SAPL-RB:40426', 'SAPL-RB:40427', 'SAPL-RB:40428', 'SAPL-RB:40429', 'SAPL-RB:40430', 'SAPL-RB:40431', 'SAPL-RB:40432', 'SAPL-RB:40433', 'SAPL-RB:40434', 'SAPL-RB:40435', 'SAPL-RB:40436', 'SAPL-RB:40437', 'SAPL-RB:40438', 'SAPL-RB:40439', 'SAPL-RB:40440', 'SAPL-RB:40441', 'SAPL-RB:40442', 'SAPL-RB:40451', 'SAPL-RB:40452', 'SAPL-RB:40453', 'SAPL-RB:40454', 'SAPL-RB:40455', 'SAPL-RB:40456', 'SAPL-RB:40457', 'SAPL-RB:40458', 'SAPL-RB:41102', 'SAPL-RB:41103', 'SAPL-RB:41104', 'SAPL-RB:41105', 'SAPL-RB:41285', 'SAPL-RB:41286', 'SAPL-RB:41287', 'SAPL-RB:41425', 'SAPL-RB:41543', 'SAPL-RB:41544', 'SAPL-RB:41545', 'SAPL-RB:41546', 'SAPL-RB:41703', 'SAPL-RB:41704', 'SAPL-RB:42105', 'SAPL-RB:42106', 'SAPL-RB:42209', 'SAPL-RB:42293', 'SAPL-RB:42476', 'SAPL-RB:42514', 'SAPL-RB:42520', 'SAPL-RB:42521', 'SAPL-RB:42538', 'SAPL-RB:42539', 'SAPL-RB:42911', 'SAPL-RB:43169', 'SAPL-RB:43170', 'SAPL-RB:43171', 'SAPL-RB:43172', 'SAPL-RB:43173', 'SAPL-RB:43174', 'SAPL-RB:43175', 'SAPL-RB:43176', 'SAPL-RB:43177', 'SAPL-RB:43178', 'SAPL-RB:43179', 'SAPL-RB:43180', 'SAPL-RB:43453', 'SAPL-RB:43454', 'SAPL-RB:43455', 'SAPL-RB:43456', 'SAPL-RB:43457');

  IF target_count <> 18 THEN
    RAISE EXCEPTION 'Pos-apply andre-kamai: esperadas 18 rows alvo em projetos_lei, encontradas %', target_count;
  END IF;

  IF coverage_count <> 18 THEN
    RAISE EXCEPTION 'Pos-apply andre-kamai: esperadas 18 rows com coverage_id/scope alvo, encontradas %', coverage_count;
  END IF;

  IF total_count <> 18 THEN
    RAISE EXCEPTION 'Pos-apply andre-kamai: total projetos_lei esperado 18, encontrado %', total_count;
  END IF;

  IF wrong_lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply andre-kamai: legislacao_mandato_executivo deveria permanecer 0, encontrado %', wrong_lme_count;
  END IF;

  IF rejected_present_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply andre-kamai: % rejected rows foram inseridas indevidamente', rejected_present_count;
  END IF;

  RAISE NOTICE 'Pos-apply andre-kamai SAPL Rio Branco Lote A: projetos_lei=% coverage_rows=%', total_count, coverage_count;
END $$;
