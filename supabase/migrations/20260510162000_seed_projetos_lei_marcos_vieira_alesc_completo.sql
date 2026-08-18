-- ============================================
-- Legislacao full-site P0-A/P0-B / ALESC / projetos_lei
-- Seed + promocao publica: completo escopado da autoria parlamentar principal ALESC
-- Slug: marcos-vieira
-- ============================================
-- Fonte oficial:
--   https://www.alesc.sc.gov.br/deputado/marcos-vieira/
--   https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23
--
-- Artefato de auditoria:
--   fonte interna de curadoria
--
-- Esta migration escreve apenas em projetos_lei.
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO escreve em historico_politico.
-- Esta migration NAO deleta nem trunca rows.
-- ============================================

DO $$
DECLARE
  cand_id uuid;
  projetos_total int;
  old_count int;
  overlap_count int;
  lme_total int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'marcos-vieira' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'marcos-vieira: candidato publico ausente neste banco local/CI minimo; seed ALESC pulado';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total FROM projetos_lei WHERE candidato_id = cand_id;
  SELECT count(*) INTO old_count FROM projetos_lei WHERE candidato_id = cand_id AND coverage_id = 'marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506';
  SELECT count(*) INTO lme_total FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  SELECT count(*) INTO overlap_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('ALESC:ELEGIS:PL:0070:2026:zE6Oe', 'ALESC:ELEGIS:PL:0069:2026:zRljG', 'ALESC:ELEGIS:PL:0043:2026:NpPnW', 'ALESC:ELEGIS:PL:0646:2025:52ZQj', 'ALESC:ELEGIS:PL:0399:2025:zw3DW', 'ALESC:ELEGIS:PL:0225:2025:57lPM', 'ALESC:ELEGIS:PL:0330:2024:5Zb17', 'ALESC:ELEGIS:PL:0151:2024:5kj0e', 'ALESC:ELEGIS:PL:0041:2023:zVdb5');

  IF projetos_total <> 9 THEN
    RAISE EXCEPTION 'Pre-condicao marcos-vieira: projetos_lei esperado 9, encontrado %', projetos_total;
  END IF;
  IF old_count <> 9 THEN
    RAISE EXCEPTION 'Pre-condicao marcos-vieira: coverage antigo esperado 9, encontrado %', old_count;
  END IF;
  IF overlap_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao marcos-vieira: overlap esperado 0, encontrado %', overlap_count;
  END IF;
  IF lme_total <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao marcos-vieira: legislacao_mandato_executivo esperado 0, encontrado %', lme_total;
  END IF;
END $$;

CREATE TEMP TABLE _seed_alesc_marcos_vieira_completo (
  tipo text NOT NULL,
  numero text NOT NULL,
  ano int NOT NULL,
  ementa text NOT NULL,
  fonte text NOT NULL,
  proposicao_id_api text NOT NULL,
  url_inteiro_teor text NOT NULL,
  situacao text,
  coverage_id text NOT NULL,
  coverage_scope text NOT NULL,
  metadata jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO _seed_alesc_marcos_vieira_completo (
  tipo,
  numero,
  ano,
  ementa,
  fonte,
  proposicao_id_api,
  url_inteiro_teor,
  situacao,
  coverage_id,
  coverage_scope,
  metadata
)
VALUES
    ('PL', '0070', 2026, 'Declara de utilidade pública a Associação Brasileira Cristã de Saúde - ASBRACS, de Irani,e altera o Anexo Único da Lei nº 18.278, de 2021, que "Consolida os atos normativos que concedem o Título de Utilidade Pública estadual no âmbito do Estado de Santa Catarina".', 'ALESC', 'ALESC:ELEGIS:PL:0070:2026:zE6Oe', 'https://portalelegis.alesc.sc.gov.br/proposicoes/zE6Oe', 'Publicado no Diário Oficial', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/zE6Oe","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/n2mol","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/n2mol/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/zE6Oe","official_source_title":"ALESC e-Legis - PL 0070/2026","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"zE6Oe","proposicao_id_api":"ALESC:ELEGIS:PL:0070:2026:zE6Oe","data_apresentacao":"13/02/2026","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Marcos Luiz Vieira"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Declaração de Utilidade Pública","informacoes":"Nº 19851 de 05/05/2026 - DOE 05/05/2026","observacao":"Diário Oficial nº 22.746","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb),
    ('PL', '0069', 2026, 'Declara de utilidade pública o Instituto Catarinense de Inovação Social - ICIS e altera o Anexo Único da Lei nº 18.278, de 2021, que "Consolida os atos normativos que concedem o Título de Utilidade Pública estadual no âmbito do Estado de Santa Catarina".', 'ALESC', 'ALESC:ELEGIS:PL:0069:2026:zRljG', 'https://portalelegis.alesc.sc.gov.br/proposicoes/zRljG', 'Arquivado', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/zRljG","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/qawYJ","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/qawYJ/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/zRljG","official_source_title":"ALESC e-Legis - PL 0069/2026","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"zRljG","proposicao_id_api":"ALESC:ELEGIS:PL:0069:2026:zRljG","data_apresentacao":"13/02/2026","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Marcos Luiz Vieira"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Declaração de Utilidade Pública","informacoes":"Nº 19835 de 29/04/2026 - DOE 29/04/2026","observacao":"Diário Oficial nº 22.743-A","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb),
    ('PL', '0043', 2026, 'Concede o título de Cidadão Catarinense a Avelino Menegolla.', 'ALESC', 'ALESC:ELEGIS:PL:0043:2026:NpPnW', 'https://portalelegis.alesc.sc.gov.br/proposicoes/NpPnW', 'Arquivado', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/NpPnW","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/djnaV","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/djnaV/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/NpPnW","official_source_title":"ALESC e-Legis - PL 0043/2026","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"NpPnW","proposicao_id_api":"ALESC:ELEGIS:PL:0043:2026:NpPnW","data_apresentacao":"09/02/2026","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Fabiano da Luz","Ivan Naatz","Jair Antônio Miotto","Marcius da Silva Machado","Marcos Luiz Vieira","Maurício José Eskudlark","Mauro de Nadal","Nilso José Berlanda","Ana Paula da Silva","Carlos Henrique de Lima","Volnei Weber","Antídio Aleixo Lunelli","Camilo Nazareno Pagani Martins","Felippe Luiz Collaço","Lucas Felipe Melo Neves","Napoleão Bernardes Neto","Oscar Gutz","Sérgio da Rosa Guimarães","Silvio Cardoso Junior"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Política e Representação Partidária","informacoes":"Nº 19730 de 02/03/2026 - DOE 02/03/2026","observacao":"Diário Oficial nº 22.706-A","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb),
    ('PL', '0646', 2025, 'Altera o Anexo Único da Lei nº 16.722, de 2015, para denominar o município de Vargem Bonita como "Terra do Papel e da Embalagem".', 'ALESC', 'ALESC:ELEGIS:PL:0646:2025:52ZQj', 'https://portalelegis.alesc.sc.gov.br/proposicoes/52ZQj', 'Arquivado', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/52ZQj","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/8GJZ6","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/8GJZ6/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/52ZQj","official_source_title":"ALESC e-Legis - PL 0646/2025","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"52ZQj","proposicao_id_api":"ALESC:ELEGIS:PL:0646:2025:52ZQj","data_apresentacao":"08/09/2025","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Marcos Luiz Vieira"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Política e Representação Partidária","informacoes":"Nº 19484 de 08/10/2025 - DOE 08/10/2025","observacao":"Diário Oficial nº 22.615-A","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb),
    ('PL', '0399', 2025, 'Reconhece o Município de Balneário Gaivota como Cidade das Passarelas e altera o Anexo Único da Lei nº 16.722, de 2015, que "Consolida as Leis que dispõem sobre denominação de bens públicos no âmbito do Estado de Santa Catarina".', 'ALESC', 'ALESC:ELEGIS:PL:0399:2025:zw3DW', 'https://portalelegis.alesc.sc.gov.br/proposicoes/zw3DW', 'Arquivado', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/zw3DW","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/krVgr","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/krVgr/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/zw3DW","official_source_title":"ALESC e-Legis - PL 0399/2025","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"zw3DW","proposicao_id_api":"ALESC:ELEGIS:PL:0399:2025:zw3DW","data_apresentacao":"01/07/2025","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Marcos Luiz Vieira"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Cidade e transporte","informacoes":"Nº 19578 de 26/11/2025 - DOE 27/11/2025","observacao":"Diário Oficial nº 22.649","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb),
    ('PL', '0225', 2025, 'Concede o título de Cidadão Catarinense a Alfredo Lang.', 'ALESC', 'ALESC:ELEGIS:PL:0225:2025:57lPM', 'https://portalelegis.alesc.sc.gov.br/proposicoes/57lPM', 'Arquivado', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/57lPM","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/Nxkbg","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/Nxkbg/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/57lPM","official_source_title":"ALESC e-Legis - PL 0225/2025","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"57lPM","proposicao_id_api":"ALESC:ELEGIS:PL:0225:2025:57lPM","data_apresentacao":"06/05/2025","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Vicente Augusto Caropreso","Fabiano da Luz","Ivan Naatz","Jair Antônio Miotto","Jessé de Faria Lopes","José Milton Scheffer","Luciane Maria Carminatti","Marcius da Silva Machado","Marcos Luiz Vieira","Maurício José Eskudlark","Nilso José Berlanda","Rodrigo Minotto","Carlos Henrique de Lima","Sérgio Motta Ribeiro","Volnei Weber","Altair Silva","Camilo Nazareno Pagani Martins","Felippe Luiz Collaço","Lucas Felipe Melo Neves","Marcos da Rosa","Mario Pinto da Motta Junior","Matheus Andreis Cadorin","Napoleão Bernardes Neto","Sérgio da Rosa Guimarães","Alexander Brasil Alves Pereira"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Política e Representação Partidária","informacoes":"Nº 19305 de 21/05/2025 - DOE 21/05/2025","observacao":"Diário Oficial nº 22.516-A.","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb),
    ('PL', '0330', 2024, 'Declara de utilidade pública a Associação Desportiva Atlântico Futsal (ADAF) e altera o Anexo Único da Lei nº 18.278, de 2021, que "Consolida os atos normativos que concedem o Título de Utilidade Pública estadual no âmbito do Estado de Santa Catarina".', 'ALESC', 'ALESC:ELEGIS:PL:0330:2024:5Zb17', 'https://portalelegis.alesc.sc.gov.br/proposicoes/5Zb17', 'Arquivado', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/5Zb17","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/KAL6a","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/KAL6a/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/5Zb17","official_source_title":"ALESC e-Legis - PL 0330/2024","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"5Zb17","proposicao_id_api":"ALESC:ELEGIS:PL:0330:2024:5Zb17","data_apresentacao":"10/07/2024","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Marcos Luiz Vieira"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Declaração de Utilidade Pública","informacoes":"Nº 19207 de 09/01/2025 - DOE 10/01/2025","observacao":"Diário Oficial nº 22.428","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb),
    ('PL', '0151', 2024, 'Altera o Anexo Único da Lei nº 16.722, de 2015, para denominar o município de Joaçaba como a "Capital Catarinense do Carnaval".', 'ALESC', 'ALESC:ELEGIS:PL:0151:2024:5kj0e', 'https://portalelegis.alesc.sc.gov.br/proposicoes/5kj0e', 'Arquivado', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/5kj0e","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/NrJLx","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/NrJLx/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/5kj0e","official_source_title":"ALESC e-Legis - PL 0151/2024","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"5kj0e","proposicao_id_api":"ALESC:ELEGIS:PL:0151:2024:5kj0e","data_apresentacao":"15/04/2024","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Marcos Luiz Vieira"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Educação, cultura e esportes","informacoes":"Nº 19126 de 13/12/2024 - DOE 13/12/2024","observacao":"Diário Oficial nº 22.416.","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb),
    ('PL', '0041', 2023, 'Dispõe sobre a participação do Estado de Santa Catarina nos consórcios públicos interfederativos de saúde, nos termos da Lei nacional nº 11.107, de 6 de abril de 2005, e estabelece política de ressarcimento da produção de serviços de saúde ambulatorial, a ser realizada pelos municípios do Estado de Santa Catarina por meio dos referidos consórcios', 'ALESC', 'ALESC:ELEGIS:PL:0041:2023:zVdb5', 'https://portalelegis.alesc.sc.gov.br/proposicoes/zVdb5', 'Arquivado', 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510', 'inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510', '{"source":"ALESC e-Legis","data_real":true,"fluxo":"Legislacao full-site","slug":"marcos-vieira","tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-marcos-vieira-alesc-completo-20260510","coverage_id":"marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510","coverage_scope":"inventario_completo_alesc_elegis_autoria_principal_2023_2026_cutoff_20260510","previous_coverage_id":"marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506","coverage_status":"completo_escopado","coverage_public_status":"parlamentar_complete","coverage_policy":"alesc_elegis_autoria_principal_pl_2023_2026_v1","recorte_publico":"autoria parlamentar principal na ALESC via e-Legis 2023-2026","cutoff":"2026-05-10","fonte_oficial":"Assembleia Legislativa do Estado de Santa Catarina","official_list_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/processo-legislativo?iniciativa=23","official_detail_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/zVdb5","official_document_url":"https://portalelegis.alesc.sc.gov.br/documentos/zwQga","official_document_download_url":"https://portalelegis.alesc.sc.gov.br/documentos/zwQga/download","official_source_url":"https://portalelegis.alesc.sc.gov.br/proposicoes/zVdb5","official_source_title":"ALESC e-Legis - PL 0041/2023","source_page_url":"https://www.alesc.sc.gov.br/deputado/marcos-vieira/","source_token":"zVdb5","proposicao_id_api":"ALESC:ELEGIS:PL:0041:2023:zVdb5","data_apresentacao":"01/03/2023","autor_nome":"Marcos Vieira","autoria_literal":"Deputado Marcos Vieira","autoria_principal_verificada":true,"documento_assinado_por":"Marcos Luiz Vieira","documento_assinaturas":["Marcos Luiz Vieira"],"documento_assinatura_autor_presente":true,"materia_legislativa":"Saúde","informacoes":"Nº 18861 de 31/01/2024 - DOE 31/01/2024","observacao":"Diário Oficial nº 22.195-A","source_verified_at":"2026-05-10T14:54:23.800Z"}'::jsonb);

INSERT INTO projetos_lei (
  candidato_id,
  tipo,
  numero,
  ano,
  ementa,
  situacao,
  url_inteiro_teor,
  fonte,
  proposicao_id_api,
  coverage_id,
  coverage_scope,
  metadata
)
SELECT
  c.id,
  seed.tipo,
  seed.numero,
  seed.ano,
  seed.ementa,
  seed.situacao,
  seed.url_inteiro_teor,
  seed.fonte,
  seed.proposicao_id_api,
  seed.coverage_id,
  seed.coverage_scope,
  seed.metadata
FROM _seed_alesc_marcos_vieira_completo seed
JOIN candidatos c ON c.slug = 'marcos-vieira' AND c.publicavel = true
ON CONFLICT (candidato_id, proposicao_id_api) DO UPDATE SET
  tipo = EXCLUDED.tipo,
  numero = EXCLUDED.numero,
  ano = EXCLUDED.ano,
  ementa = EXCLUDED.ementa,
  situacao = EXCLUDED.situacao,
  url_inteiro_teor = EXCLUDED.url_inteiro_teor,
  fonte = EXCLUDED.fonte,
  coverage_id = EXCLUDED.coverage_id,
  coverage_scope = EXCLUDED.coverage_scope,
  metadata = EXCLUDED.metadata;

DO $$
DECLARE
  cand_id uuid;
  projetos_total int;
  complete_count int;
  old_count int;
  lme_total int;
  metadata_ok int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'marcos-vieira' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'marcos-vieira: candidato publico ausente neste banco local/CI minimo; verificacao ALESC pulada';
    RETURN;
  END IF;

  SELECT count(*) INTO projetos_total FROM projetos_lei WHERE candidato_id = cand_id;
  SELECT count(*) INTO complete_count FROM projetos_lei WHERE candidato_id = cand_id AND coverage_id = 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510';
  SELECT count(*) INTO old_count FROM projetos_lei WHERE candidato_id = cand_id AND coverage_id = 'marcos-vieira-sc-alesc-projetos-lei-ampliado-parcial-20260506';
  SELECT count(*) INTO lme_total FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  SELECT count(*) INTO metadata_ok
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'marcos-vieira-alesc-completo-autoria-principal-elegis-2023-2026-cutoff-20260510'
    AND metadata->>'coverage_public_status' = 'parlamentar_complete'
    AND metadata->>'tabela_alvo' = 'projetos_lei'
    AND metadata->>'legislacao_mandato_executivo_mixed' = 'false'
    AND metadata->>'autoria_principal_verificada' = 'true';

  IF projetos_total <> 18 THEN
    RAISE EXCEPTION 'Pos-apply marcos-vieira: projetos_lei total esperado 18, encontrado %', projetos_total;
  END IF;
  IF complete_count <> 9 THEN
    RAISE EXCEPTION 'Pos-apply marcos-vieira: rows complete esperadas 9, encontradas %', complete_count;
  END IF;
  IF old_count <> 9 THEN
    RAISE EXCEPTION 'Pos-apply marcos-vieira: rows antigas fora do recorte esperadas 9, encontradas %', old_count;
  END IF;
  IF metadata_ok <> 9 THEN
    RAISE EXCEPTION 'Pos-apply marcos-vieira: metadata completa esperada 9, encontrada %', metadata_ok;
  END IF;
  IF lme_total <> 0 THEN
    RAISE EXCEPTION 'Pos-apply marcos-vieira: legislacao_mandato_executivo esperado 0, encontrado %', lme_total;
  END IF;
END $$;
