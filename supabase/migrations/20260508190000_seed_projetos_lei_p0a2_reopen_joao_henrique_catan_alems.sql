-- ============================================
-- Legislacao full-site P0-A2 reopen: Joao Henrique Catan projetos_lei ALEMS
-- ============================================
-- Fonte oficial primaria por linha: Diario Oficial ALEMS PDF.
-- Sem noticia/blog/release/homepage generica.
-- Artifact:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508
--   coverage_scope = inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO escreve em historico_politico.
-- Esta migration NAO promove completo_provado.
-- ============================================

CREATE TEMP TABLE _seed_legislacao_p0a2_reopen_catan (
  slug text NOT NULL,
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

INSERT INTO _seed_legislacao_p0a2_reopen_catan (
  slug,
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
    ('joao-henrique-catan', 'PL', '043', 2025, 'Dispõe sobre a regulamentação do uso de vestimentas pelos profissionais da educação na rede pública e privada de ensino no Estado de Mato Grosso do Sul, estabelecendo normas sobre a adequação das roupas ao ambiente escolar, com foco na preservação da dignidade do cargo, da moralidade e dos bons costumes, e dá outras providências.', 'Diario Oficial ALEMS', 'ALEMS-DO:2819:PL-043-2025:PROC-045-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=yDMo6BumKcimjGR645jILA%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=yDMo6BumKcimjGR645jILA%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2819","official_issue_number":2819,"official_publication_date":"2025-03-12","official_pages":15,"source_kind":"pdf","official_process_number":"045","official_project_number":"043","official_year":2025,"official_number_label":"Projeto de Lei nº 043/2025","official_process_label":"Processo nº 045/2025","official_date":"2025-03-12","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '044', 2025, 'Dispõe sobre a proibição de contratação, pelo Poder Público do Estado de Mato Grosso do Sul, de shows, artistas e eventos que promovam apologia ao crime organizado, ao consumo de drogas ilícitas, à violência ou a outras atividades ilícitas, e dá outras providências.', 'Diario Oficial ALEMS', 'ALEMS-DO:2819:PL-044-2025:PROC-046-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=yDMo6BumKcimjGR645jILA%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=yDMo6BumKcimjGR645jILA%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2819","official_issue_number":2819,"official_publication_date":"2025-03-12","official_pages":15,"source_kind":"pdf","official_process_number":"046","official_project_number":"044","official_year":2025,"official_number_label":"Projeto de Lei nº 044/2025","official_process_label":"Processo nº 046/2025","official_date":"2025-03-12","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '046', 2025, 'Institui o Projeto Saúde no Parque no Parque Estadual do Prosa/Parque dos Poderes Governador Pedro Pedrossian, no Estado de Mato Grosso do Sul, e dá outras providências.', 'Diario Oficial ALEMS', 'ALEMS-DO:2819:PL-046-2025:PROC-048-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=yDMo6BumKcimjGR645jILA%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=yDMo6BumKcimjGR645jILA%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2819","official_issue_number":2819,"official_publication_date":"2025-03-12","official_pages":15,"source_kind":"pdf","official_process_number":"048","official_project_number":"046","official_year":2025,"official_number_label":"Projeto de Lei nº 046/2025","official_process_label":"Processo nº 048/2025","official_date":"2025-03-12","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '052', 2025, 'Estabelece a obrigatoriedade de disponibilização de vagas, reservadas aos advogados no exercício de suas funções, nos órgãos públicos indispensáveis à Administração da Justiça, no âmbito do Estado de Mato Grosso do Sul.', 'Diario Oficial ALEMS', 'ALEMS-DO:2819:PL-052-2025:PROC-054-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=yDMo6BumKcimjGR645jILA%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=yDMo6BumKcimjGR645jILA%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2819","official_issue_number":2819,"official_publication_date":"2025-03-12","official_pages":15,"source_kind":"pdf","official_process_number":"054","official_project_number":"052","official_year":2025,"official_number_label":"Projeto de Lei nº 052/2025","official_process_label":"Processo nº 054/2025","official_date":"2025-03-12","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '004', 2025, 'Declara de Utilidade Pública Estadual o Instituto Marilia Sobotika Lugli – Projeto Amar MSL, com sede no Município de Campo Grande, MS.', 'Diario Oficial ALEMS', 'ALEMS-DO:2828:PL-004-2025:PROC-004-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2828","official_issue_number":2828,"official_publication_date":"2025-03-25","official_pages":26,"source_kind":"pdf","official_process_number":"004","official_project_number":"004","official_year":2025,"official_number_label":"Projeto de Lei nº 004/2025","official_process_label":"Processo nº 004/2025","official_date":"2025-03-25","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '057', 2025, 'Estabelece diretrizes e ações destinadas à promoção da saúde, bem-estar, e inclusão social dos idosos residentes no Estado de Mato Grosso do Sul, com o objetivo de melhorar a qualidade de vida, fomentar o envelhecimento saudável e ativo.', 'Diario Oficial ALEMS', 'ALEMS-DO:2828:PL-057-2025:PROC-059-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2828","official_issue_number":2828,"official_publication_date":"2025-03-25","official_pages":26,"source_kind":"pdf","official_process_number":"059","official_project_number":"057","official_year":2025,"official_number_label":"Projeto de Lei nº 057/2025","official_process_label":"Processo nº 059/2025","official_date":"2025-03-25","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '060', 2025, 'Dispõe sobre a utilização da palavra carne em embalagens, rótulos e publicidades de alimentos, no âmbito do Estado de Mato Grosso do Sul.', 'Diario Oficial ALEMS', 'ALEMS-DO:2828:PL-060-2025:PROC-062-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2828","official_issue_number":2828,"official_publication_date":"2025-03-25","official_pages":26,"source_kind":"pdf","official_process_number":"062","official_project_number":"060","official_year":2025,"official_number_label":"Projeto de Lei nº 060/2025","official_process_label":"Processo nº 062/2025","official_date":"2025-03-25","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '064', 2025, 'Proíbe a imposição de multas ou penalidades contra pais ou responsáveis que não vacinarem seus filhos contra a COVID-19 no Estado de Mato Grosso do Sul, e dá outras providências.', 'Diario Oficial ALEMS', 'ALEMS-DO:2828:PL-064-2025:PROC-069-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2828","official_issue_number":2828,"official_publication_date":"2025-03-25","official_pages":26,"source_kind":"pdf","official_process_number":"069","official_project_number":"064","official_year":2025,"official_number_label":"Projeto de Lei nº 064/2025","official_process_label":"Processo nº 069/2025","official_date":"2025-03-25","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '066', 2025, 'Cria o Programa Militar de Pecúlio Especial – PMPE, no âmbito do Estado de Mato Grosso do Sul e dá outras providências.', 'Diario Oficial ALEMS', 'ALEMS-DO:2828:PL-066-2025:PROC-072-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=A0WFpxmtCVe2Wm1BF6IBYw%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2828","official_issue_number":2828,"official_publication_date":"2025-03-25","official_pages":26,"source_kind":"pdf","official_process_number":"072","official_project_number":"066","official_year":2025,"official_number_label":"Projeto de Lei nº 066/2025","official_process_label":"Processo nº 072/2025","official_date":"2025-03-25","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '125', 2025, 'Dispõe sobre a utilização dos serviços públicos estaduais essenciais aos cidadãos por ou para objetos inanimados, como bonecas do tipo “reborn” e afins no Estado de Mato Grosso do Sul e dá outras providências.', 'Diario Oficial ALEMS', 'ALEMS-DO:2863:PL-125-2025:PROC-133-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=d9trocaAdiwTz2llhZHsQIQCsKwQQ%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=d9trocaAdiwTz2llhZHsQIQCsKwQQ%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2863","official_issue_number":2863,"official_publication_date":"2025-05-21","official_pages":18,"source_kind":"pdf","official_process_number":"133","official_project_number":"125","official_year":2025,"official_number_label":"Projeto de Lei nº 125/2025","official_process_label":"Processo nº 133/2025","official_date":"2025-05-21","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '126', 2025, 'Dispõe sobre o acesso dos jovens nas autoescolas 1 (um) ano antes de completar a idade mínima para a categoria pretendida, para a formação teórico-técnica do processo de habilitação, no âmbito do Estado de Mato Grosso do Sul.', 'Diario Oficial ALEMS', 'ALEMS-DO:2863:PL-126-2025:PROC-135-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=d9trocaAdiwTz2llhZHsQIQCsKwQQ%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=d9trocaAdiwTz2llhZHsQIQCsKwQQ%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2863","official_issue_number":2863,"official_publication_date":"2025-05-21","official_pages":18,"source_kind":"pdf","official_process_number":"135","official_project_number":"126","official_year":2025,"official_number_label":"Projeto de Lei nº 126/2025","official_process_label":"Processo nº 135/2025","official_date":"2025-05-21","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '091', 2025, 'Estabelece, no âmbito do Estado de Mato Grosso do Sul, a comunicação obrigatória à Defensoria Pública sobre registros de nascimento lavrados sem identificação de paternidade, para fins de atuação jurídica em defesa dos direitos da criança e do adolescente, e dá outras providências.', 'Diario Oficial ALEMS', 'ALEMS-DO:2912:PL-091-2025:PROC-097-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=37gIWtrocaDivX2WkKYwisj2tScjQ%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=37gIWtrocaDivX2WkKYwisj2tScjQ%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2912","official_issue_number":2912,"official_publication_date":"2025-08-15","official_pages":14,"source_kind":"pdf","official_process_number":"097","official_project_number":"091","official_year":2025,"official_number_label":"Projeto de Lei nº 091/2025","official_process_label":"Processo nº 097/2025","official_date":"2025-08-15","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb),
    ('joao-henrique-catan', 'PL', '202', 2025, 'Altera e acrescenta dispositivos à Lei nº 5.192, de 10 de maio de 2018, que dispõe sobre a instituição do Cadastro Estadual da Pessoa com Transtorno do Espectro do Autismo (TEA) no Estado de Mato Grosso do Sul.', 'Diario Oficial ALEMS', 'ALEMS-DO:2912:PL-202-2025:PROC-245-2025', 'https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=37gIWtrocaDivX2WkKYwisj2tScjQ%3D%3D', 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508', 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508', '{"coverage_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","coverage_scope":"inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508","fonte_oficial":"Assembleia Legislativa de Mato Grosso do Sul - Diario Oficial ALEMS","official_source_url":"https://diariooficial.al.ms.gov.br/DiarioOficial/DownloadPdf?q=37gIWtrocaDivX2WkKYwisj2tScjQ%3D%3D","official_source_title":"Diario Oficial ALEMS n. 2912","official_issue_number":2912,"official_publication_date":"2025-08-15","official_pages":14,"source_kind":"pdf","official_process_number":"245","official_project_number":"202","official_year":2025,"official_number_label":"Projeto de Lei nº 202/2025","official_process_label":"Processo nº 245/2025","official_date":"2025-08-15","author_name":"João Henrique Catan","autoria_literal":"Deputado JOÃO HENRIQUE","autoria_principal_verificada":true,"source_verified_at":"2026-05-08T18:14:42.349Z"}'::jsonb);

DO $$
DECLARE
  cand_id uuid;
  current_pl_count int;
  current_lme_count int;
  target_count int;
  coverage_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'joao-henrique-catan' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'joao-henrique-catan: pre-condicao pulada porque candidato publico nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO current_pl_count FROM projetos_lei WHERE candidato_id = cand_id;
  SELECT count(*) INTO current_lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
  SELECT count(*) INTO target_count FROM _seed_legislacao_p0a2_reopen_catan WHERE slug = 'joao-henrique-catan';
  SELECT count(*) INTO coverage_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508';

  IF current_pl_count NOT IN (0, target_count) THEN
    RAISE EXCEPTION 'Pre-condicao joao-henrique-catan: projetos_lei esperado 0 ou alvo idempotente %, encontrado %', target_count, current_pl_count;
  END IF;

  IF current_pl_count = target_count AND coverage_count <> target_count THEN
    RAISE EXCEPTION 'Pre-condicao joao-henrique-catan: % rows existentes em projetos_lei mas apenas % com coverage_id alvo', target_count, coverage_count;
  END IF;

  IF current_lme_count <> 0 THEN
    RAISE EXCEPTION 'Pre-condicao joao-henrique-catan: legislacao_mandato_executivo esperado 0, encontrado %', current_lme_count;
  END IF;
END $$;

WITH target AS (
  SELECT
    c.id AS candidato_id,
    seed.*
  FROM _seed_legislacao_p0a2_reopen_catan seed
  JOIN candidatos c ON c.slug = seed.slug
  WHERE c.publicavel = true
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
  target.tipo,
  target.numero,
  target.ano,
  target.ementa,
  target.fonte,
  target.proposicao_id_api,
  target.url_inteiro_teor,
  target.coverage_id,
  target.coverage_scope,
  target.metadata
FROM target
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
  target_count int;
  coverage_count int;
  wrong_lme_count int;
  total_count int;
BEGIN
  SELECT id INTO cand_id FROM candidatos WHERE slug = 'joao-henrique-catan' AND publicavel = true;

  IF cand_id IS NULL THEN
    RAISE NOTICE 'joao-henrique-catan: pos-condicao pulada porque candidato publico nao existe neste banco local/CI minimo';
    RETURN;
  END IF;

  SELECT count(*) INTO target_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND proposicao_id_api IN ('ALEMS-DO:2819:PL-043-2025:PROC-045-2025', 'ALEMS-DO:2819:PL-044-2025:PROC-046-2025', 'ALEMS-DO:2819:PL-046-2025:PROC-048-2025', 'ALEMS-DO:2819:PL-052-2025:PROC-054-2025', 'ALEMS-DO:2828:PL-004-2025:PROC-004-2025', 'ALEMS-DO:2828:PL-057-2025:PROC-059-2025', 'ALEMS-DO:2828:PL-060-2025:PROC-062-2025', 'ALEMS-DO:2828:PL-064-2025:PROC-069-2025', 'ALEMS-DO:2828:PL-066-2025:PROC-072-2025', 'ALEMS-DO:2863:PL-125-2025:PROC-133-2025', 'ALEMS-DO:2863:PL-126-2025:PROC-135-2025', 'ALEMS-DO:2912:PL-091-2025:PROC-097-2025', 'ALEMS-DO:2912:PL-202-2025:PROC-245-2025');

  SELECT count(*) INTO coverage_count
  FROM projetos_lei
  WHERE candidato_id = cand_id
    AND coverage_id = 'legislacao-p0a2-reopen-joao-henrique-catan-alems-20260508'
    AND coverage_scope = 'inventario_ampliado_parcial_alems_joao_henrique_catan_p0a2_reopen_20260508';

  SELECT count(*) INTO wrong_lme_count
  FROM legislacao_mandato_executivo
  WHERE candidato_id = cand_id;

  SELECT count(*) INTO total_count
  FROM projetos_lei
  WHERE candidato_id = cand_id;

  IF target_count <> 13 THEN
    RAISE EXCEPTION 'Pos-apply joao-henrique-catan: esperadas 13 rows alvo em projetos_lei, encontradas %', target_count;
  END IF;

  IF target_count <> coverage_count THEN
    RAISE EXCEPTION 'Pos-apply joao-henrique-catan: target_count % difere de coverage_count %', target_count, coverage_count;
  END IF;

  IF total_count <> target_count THEN
    RAISE EXCEPTION 'Pos-apply joao-henrique-catan: total projetos_lei esperado igual ao lote %, encontrado %', target_count, total_count;
  END IF;

  IF wrong_lme_count <> 0 THEN
    RAISE EXCEPTION 'Pos-apply joao-henrique-catan: legislacao_mandato_executivo deveria permanecer 0, encontrado %', wrong_lme_count;
  END IF;
END $$;
