-- ============================================
-- Legislacao full-site source-unblock 26: Lote A / projetos_lei
-- ============================================
-- Fonte oficial primaria por linha, sem noticia/blog/release/homepage generica.
-- Artifact:
--   fonte interna de curadoria
--
-- Coverage:
--   coverage_id    = legislacao-unblock-26-projetos-lei-lote-a-20260508
--   coverage_scope = inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508
--
-- Esta migration NAO escreve em legislacao_mandato_executivo.
-- Esta migration NAO escreve em historico_politico.
-- Esta migration NAO promove completo_provado.
-- ============================================

CREATE TEMP TABLE _seed_legislacao_unblock_26_lote_a (
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

INSERT INTO _seed_legislacao_unblock_26_lote_a (
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
    ('adailton-furia', 'PLO', '16', 2019, 'Estabelece mecanismos de seguro para garantir o interesse público nos processos de licitação e a correta aplicação dos recursos públicos no âmbito do Estado de Rondônia.', 'SAPL ALRO', 'SAPL-ALRO:19028', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2019/19028/pl_016.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/19028","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '258', 2019, 'Institui normas e critérios sobre a prática esportiva equeste de forma a garantir o bem-estar dos animais no âmbito do Estado de Rondônia e dá outras providências.', 'SAPL ALRO', 'SAPL-ALRO:18233', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2019/18233/pl_258-19.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/18233","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '261', 2019, 'Estabelece normas para o pagamento parcelado de multas de trânsito no Estado de Rondônia.', 'SAPL ALRO', 'SAPL-ALRO:18235', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2019/18235/plo_261-19.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/18235","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '267', 2019, 'Dispõe sobre a proibição de cobrança de taxas pelos serviços de religação dos serviços públicos de distribuição de energia elétrica e de abastecimentos de água e saneamento básico em caso de corte por falta de pagamento e dá outras providências.', 'SAPL ALRO', 'SAPL-ALRO:18458', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2019/18458/pl_267_-_19.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/18458","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '283', 2019, 'Dispõe sobre a UTI HUMANIZADA para a permanência de acompanhantes nas dependências das unidades de terapia intensiva dos hospitais, unidades de pronto atendimento e maternidades públicas e privadas e dá outras providências.', 'SAPL ALRO', 'SAPL-ALRO:18728', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2019/18728/pl_283.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/18728","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '386', 2019, 'Institui a "Semana Estadual de Sensibilização e Defesa dos Direitos dos Portadores de Doenças Inflamatórias Intestinais".', 'SAPL ALRO', 'SAPL-ALRO:19543', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2019/19543/doc00326320200131111944.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/19543","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '83', 2019, 'Autoriza o Executivo Estadual a proceder gratuitamente o translado intermunicipal de cadáveres ou restos mortais humanos, advindos de famílias em situação de vulnerabilidade econômica, a ser realizado por funerárias custeado pelo Governo do Estado em todo o território do Estado de Rondônia.', 'SAPL ALRO', 'SAPL-ALRO:17324', 'https://sapl.al.ro.leg.br/materia/17324', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/17324","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '409', 2020, 'Altera e acrescenta dispositivos à Lei nº 3.314/2014, que assegura a jovem de família de baixa renda de até 29 anos e aos estudantes, o desconto de 50% (cinquenta por cento) do valor do ingresso cobrado em espetáculos esportivos, culturais, de lazer e outros afins e dá outras providências.', 'SAPL ALRO', 'SAPL-ALRO:19602', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2020/19602/plo_409-20.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/19602","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '457', 2020, 'Dá a denominação de Joaquim Antunes de Oliveira, à ponte que transpõe o Rio Machado, sobre a RO 383 (linha 208) que liga os Município de Cacoal e Rolim de Moura.', 'SAPL ALRO', 'SAPL-ALRO:20083', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2020/20083/pl_457-20.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/20083","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '458', 2020, 'Declara de Utilidade Pública a respeitável ASCOBEMS – Associação Comunitária e Beneficente Marcela Santana, no Município de Porto Velho – RO.', 'SAPL ALRO', 'SAPL-ALRO:20084', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2020/20084/pl_458-20.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/20084","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '511', 2020, 'Dispõe sobre a redução de, no mínimo, 30% (trinta por cento) no valor das mensalidades das instituições de ensino fundamental, médio e superior da rede privada cujo funcionamento esteja suspenso em razão da emergência de saúde pública de que trata a Lei n° 13.979, de 6 de fevereiro de 2020 e Decreto Estadual n° 20.887 de 20 de março de 2020.', 'SAPL ALRO', 'SAPL-ALRO:20202', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2020/20202/pl_511-20.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/20202","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '512', 2020, 'Proíbe às concessionárias prestadoras de serviços essenciais de fornecimento de energia elétrica e água no Estado de Rondônia de realizar a leitura de medidores de consumo e emissão de faturas enquanto estiver em vigor o Decreto Estadual n° 20.887, de 20 de março de 2020.', 'SAPL ALRO', 'SAPL-ALRO:20203', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2020/20203/pl_512-20.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/20203","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '513', 2020, 'Autoriza o Poder Executivo a contratar apólice de seguro de vida para os profissionais de saúde, no âmbito do Estado de Rondônia, durante a vigência do Decreto 24.871, de 16 de março de 2020.', 'SAPL ALRO', 'SAPL-ALRO:20204', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2020/20204/pl_513-20.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/20204","autoria_literal":"ADAILTON FÚRIA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('adailton-furia', 'PLO', '701', 2020, 'Altera e acrescenta dispositivos na Lei 4.793 de 18 de junho de 2020.', 'SAPL ALRO', 'SAPL-ALRO:21115', 'http://sapl.al.ro.leg.br/media/sapl/public/materialegislativa/2020/21115/pl_701-20.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"SAPL Assembleia Legislativa de Rondonia","source_list_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_detail_url":"https://sapl.al.ro.leg.br/materia/21115","autoria_literal":"ADAILTON FÚRIA, ADELINO FOLLADOR, JAIR MONTES, PASTOR ALEX SILVA","autoria_principal_verificada":true,"tipo_descricao":"Projeto de Lei Ordinária","official_source_url":"https://sapl.al.ro.leg.br/materia/pesquisar-materia?format=json&tipo=1&ano=&numero=&ementa=&autoria__autor=&autoria__autor__tipo=&data_apresentacao_0=&data_apresentacao_1=&salvar=Pesquisar","official_source_title":"SAPL ALRO - Pesquisa de matérias legislativas tipo PLO","author_name":"Adailton Fúria","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('alvaro-dias-rn', 'PL', '0424', 2001, 'Reconhece como de Utilidade Pública a Sociedade RN Ação 4X4, com sede e foro em Natal.', 'ALRN Boletim Oficial', 'ALRN:PL:0424:2001', 'https://www.al.rn.leg.br/storage/boletins/2015/09/30/e325974ac3d727846ba68a8db5db6f8b.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"ALRN Boletim Oficial","autoria_principal_verificada":true,"official_source_url":"https://www.al.rn.leg.br/storage/boletins/2015/09/30/e325974ac3d727846ba68a8db5db6f8b.pdf","official_source_title":"ALRN - Boletim Oficial 2032","author_name":"Álvaro Dias","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('alvaro-dias-rn', 'PL', '0453', 2001, 'Reconhece como de Utilidade Pública a Associação do Distrito de Irrigação Baixo Açu - DIBA, com sede e foro no Município de Alto do Rodrigues.', 'ALRN Boletim Oficial', 'ALRN:PL:0453:2001', 'https://www.al.rn.leg.br/storage/boletins/2015/09/30/e325974ac3d727846ba68a8db5db6f8b.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"ALRN Boletim Oficial","autoria_principal_verificada":true,"official_source_url":"https://www.al.rn.leg.br/storage/boletins/2015/09/30/e325974ac3d727846ba68a8db5db6f8b.pdf","official_source_title":"ALRN - Boletim Oficial 2032","author_name":"Álvaro Dias","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('douglas-ruas', 'PL', '452', 2023, 'Autoriza o Poder Executivo a implementar um novo Batalhão da Polícia Militar no município de São Gonçalo.', 'ALERJ', 'ALERJ:20230300452', 'https://www3.alerj.rj.gov.br/lotus_notes/default.asp?id=3&url=L3NjcHJvMjMyNy5uc2YvMGM1YmY1Y2RlOTU2MDFmOTAzMjU2Y2FhMDAyMzEzMWIvOTU1MjRkMGEzNzU0ZmQ1NzAzMjU4OTc0MDA1MTVjYmE%2FT3BlbkRvY3VtZW50', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"ALERJ Lotus Notes","autoria_principal_verificada":true,"official_source_url":"https://www3.alerj.rj.gov.br/lotus_notes/default.asp?id=3&url=L3NjcHJvMjMyNy5uc2YvMGM1YmY1Y2RlOTU2MDFmOTAzMjU2Y2FhMDAyMzEzMWIvOTU1MjRkMGEzNzU0ZmQ1NzAzMjU4OTc0MDA1MTVjYmE%2FT3BlbkRvY3VtZW50","official_source_title":"ALERJ - Tramitação do Projeto de Lei nº 452/2023","author_name":"Douglas Ruas","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('pazolini', 'PL', '123', 2019, 'Altera a Lei nº 7.737, de 05 de abril de 2004, que institui a meia entrada em locais públicos de cultura, esporte e lazer para doadores de sangue e órgãos, e dá outras providências.', 'ALES', 'ALES:PL:123:2019', 'https://www3.al.es.gov.br/Arquivo/Documents/PL/PL1232019/619139-084618916826032019-assinado.pdf?identificador=320035003500350033003A00540052004100', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"ALES Digital","autoria_principal_verificada":true,"official_source_url":"https://www3.al.es.gov.br/Arquivo/Documents/PL/PL1232019/619139-084618916826032019-assinado.pdf?identificador=320035003500350033003A00540052004100","official_source_title":"ALES - Projeto de Lei nº 123/2019","author_name":"Lorenzo Pazolini","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('pazolini', 'PL', '330', 2020, 'Proíbe a utilização de animais para desenvolvimento, experimentos e testes de produtos cosméticos, de higiene pessoal, perfumes e seus componentes no Estado do Espírito Santo, e dá outras providências.', 'ALES', 'ALES:PL:330:2020', 'https://www3.al.es.gov.br/Arquivo/Documents/PL/PL3302020/744650-202120401002072020-assinado.pdf?identificador=390033003200350034003A005000', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"ALES Digital","autoria_principal_verificada":true,"official_source_url":"https://www3.al.es.gov.br/Arquivo/Documents/PL/PL3302020/744650-202120401002072020-assinado.pdf?identificador=390033003200350034003A005000","official_source_title":"ALES - Projeto de Lei nº 330/2020","author_name":"Lorenzo Pazolini","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('raquel-lyra', 'PLO', '2068', 2014, 'Dispõe sobre a obrigatoriedade de os supermercados e hipermercados exporem aos consumidores, em um mesmo local ou gôndola, todos os produtos alimentícios especialmente elaborados sem a utilização de glúten, e dá outras providências.', 'ALEPE Diario Oficial', 'ALEPE:DPL:PLO:2068:2014', 'https://www.alepe.pe.gov.br/Flip/pubs/diario-oficial-31102014/flip.pdf', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"ALEPE Diario Oficial","autoria_principal_verificada":true,"official_source_url":"https://www.alepe.pe.gov.br/Flip/pubs/diario-oficial-31102014/flip.pdf","official_source_title":"ALEPE - Diário Oficial do Poder Legislativo de 31/10/2014","author_name":"Raquel Lyra","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('ricardo-nunes', 'PL', '254', 2018, 'Dispõe sobre a alteração da Lei nº 14.485, de 19/07/2007, para incluir a Festa Junina da Paróquia de Nossa Senhora da Consolação no Calendário Oficial da Cidade de São Paulo.', 'Diario Oficial Cidade de Sao Paulo', 'CMSP:DOC:PL:254:2018', 'https://www.imprensaoficial.com.br/Certificacao/GatewayCertificaPDF.aspx?notarizacaoID=8f2a00f8-dc06-4be1-9a9c-52b622f48ca8', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"Diario Oficial Cidade de Sao Paulo","autoria_principal_verificada":true,"official_source_url":"https://www.imprensaoficial.com.br/Certificacao/GatewayCertificaPDF.aspx?notarizacaoID=8f2a00f8-dc06-4be1-9a9c-52b622f48ca8","official_source_title":"Diário Oficial da Cidade de São Paulo - 05/09/2018","author_name":"Ricardo Nunes","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('roberto-claudio', 'PL', '83', 2007, 'Dispõe sobre a instituição do Dia da Inclusão Digital no Estado do Ceará.', 'ALECE', 'ALECE:PL:83:2007', 'https://www2.al.ce.gov.br/legislativo/tramit27/pl83_07.htm', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"ALECE tramitação","autoria_principal_verificada":true,"official_source_url":"https://www2.al.ce.gov.br/legislativo/tramit27/pl83_07.htm","official_source_title":"ALECE - Projeto de Lei nº 83/2007","author_name":"Roberto Cláudio","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb),
    ('roberto-claudio', 'PL', '292', 2009, 'Concede o título de utilidade pública à Associação Cearense de Profissionais Atuantes em Doenças Genéticas, Pacientes, Familiares e Voluntários (ACDG).', 'ALECE', 'ALECE:PL:292:2009', 'https://www2.al.ce.gov.br/legislativo/tramit2009/pl292_09.htm', 'legislacao-unblock-26-projetos-lei-lote-a-20260508', 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508', '{"coverage_id":"legislacao-unblock-26-projetos-lei-lote-a-20260508","coverage_scope":"inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508","data_real":true,"tabela_alvo":"projetos_lei","legislacao_mandato_executivo_mixed":false,"curation_batch_id":"legislacao-unblock-26-lote-a-20260508","fonte_oficial":"ALECE tramitação","autoria_principal_verificada":true,"official_source_url":"https://www2.al.ce.gov.br/legislativo/tramit2009/pl292_09.htm","official_source_title":"ALECE - Projeto de Lei nº 292/2009","author_name":"Roberto Cláudio","source_verified_at":"2026-05-08T01:01:22.782Z"}'::jsonb);

DO $$
DECLARE
  row_slug text;
  cand_id uuid;
  current_pl_count int;
  current_lme_count int;
  target_count int;
  coverage_count int;
BEGIN
  FOR row_slug IN SELECT DISTINCT slug FROM _seed_legislacao_unblock_26_lote_a LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = row_slug AND publicavel = true;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: pre-condicao pulada porque candidato publico nao existe neste banco local/CI minimo', row_slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO current_pl_count FROM projetos_lei WHERE candidato_id = cand_id;
    SELECT count(*) INTO current_lme_count FROM legislacao_mandato_executivo WHERE candidato_id = cand_id;
    SELECT count(*) INTO target_count FROM _seed_legislacao_unblock_26_lote_a WHERE slug = row_slug;
    SELECT count(*) INTO coverage_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = 'legislacao-unblock-26-projetos-lei-lote-a-20260508';

    IF current_pl_count NOT IN (0, target_count) THEN
      RAISE EXCEPTION 'Pre-condicao %: projetos_lei esperado 0 ou alvo idempotente %, encontrado %', row_slug, target_count, current_pl_count;
    END IF;

    IF current_pl_count = target_count AND coverage_count <> target_count THEN
      RAISE EXCEPTION 'Pre-condicao %: % rows existentes em projetos_lei mas apenas % com coverage_id alvo', row_slug, target_count, coverage_count;
    END IF;

    IF current_lme_count <> 0 THEN
      RAISE EXCEPTION 'Pre-condicao %: legislacao_mandato_executivo esperado 0, encontrado %', row_slug, current_lme_count;
    END IF;
  END LOOP;
END $$;

WITH target AS (
  SELECT
    c.id AS candidato_id,
    seed.*
  FROM _seed_legislacao_unblock_26_lote_a seed
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
  row_slug text;
  cand_id uuid;
  target_count int;
  coverage_count int;
  wrong_lme_count int;
  total_count int;
  expected_count int;
BEGIN
  FOR row_slug IN SELECT DISTINCT slug FROM _seed_legislacao_unblock_26_lote_a LOOP
    SELECT id INTO cand_id FROM candidatos WHERE slug = row_slug AND publicavel = true;

    IF cand_id IS NULL THEN
      RAISE NOTICE '%: pos-condicao pulada porque candidato publico nao existe neste banco local/CI minimo', row_slug;
      CONTINUE;
    END IF;

    SELECT count(*) INTO target_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND proposicao_id_api IN ('SAPL-ALRO:19028', 'SAPL-ALRO:18233', 'SAPL-ALRO:18235', 'SAPL-ALRO:18458', 'SAPL-ALRO:18728', 'SAPL-ALRO:19543', 'SAPL-ALRO:17324', 'SAPL-ALRO:19602', 'SAPL-ALRO:20083', 'SAPL-ALRO:20084', 'SAPL-ALRO:20202', 'SAPL-ALRO:20203', 'SAPL-ALRO:20204', 'SAPL-ALRO:21115', 'ALRN:PL:0424:2001', 'ALRN:PL:0453:2001', 'ALERJ:20230300452', 'ALES:PL:123:2019', 'ALES:PL:330:2020', 'ALEPE:DPL:PLO:2068:2014', 'CMSP:DOC:PL:254:2018', 'ALECE:PL:83:2007', 'ALECE:PL:292:2009');

    SELECT count(*) INTO coverage_count
    FROM projetos_lei
    WHERE candidato_id = cand_id
      AND coverage_id = 'legislacao-unblock-26-projetos-lei-lote-a-20260508'
      AND coverage_scope = 'inventario_ampliado_parcial_fontes_oficiais_estaduais_municipais_lote_a_20260508';

    SELECT count(*) INTO wrong_lme_count
    FROM legislacao_mandato_executivo
    WHERE candidato_id = cand_id;

    SELECT count(*) INTO total_count
    FROM projetos_lei
    WHERE candidato_id = cand_id;

    expected_count := CASE row_slug
      WHEN 'adailton-furia' THEN 14
      WHEN 'alvaro-dias-rn' THEN 2
      WHEN 'douglas-ruas' THEN 1
      WHEN 'pazolini' THEN 2
      WHEN 'raquel-lyra' THEN 1
      WHEN 'ricardo-nunes' THEN 1
      WHEN 'roberto-claudio' THEN 2
      ELSE NULL
    END;

    IF expected_count IS NULL THEN
      RAISE EXCEPTION 'Pos-apply %: count esperado ausente na migration', row_slug;
    END IF;

    IF target_count <> expected_count THEN
      RAISE EXCEPTION 'Pos-apply %: esperadas % rows alvo em projetos_lei, encontradas %', row_slug, expected_count, target_count;
    END IF;

    IF target_count <> coverage_count THEN
      RAISE EXCEPTION 'Pos-apply %: target_count % difere de coverage_count %', row_slug, target_count, coverage_count;
    END IF;

    IF total_count <> target_count THEN
      RAISE EXCEPTION 'Pos-apply %: total projetos_lei esperado igual ao lote %, encontrado %', row_slug, target_count, total_count;
    END IF;

    IF wrong_lme_count <> 0 THEN
      RAISE EXCEPTION 'Pos-apply %: legislacao_mandato_executivo deveria permanecer 0, encontrado %', row_slug, wrong_lme_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'Pos-apply source-unblock 26 lote A: projetos_lei %, coverage_id legislacao-unblock-26-projetos-lei-lote-a-20260508', (SELECT count(*) FROM _seed_legislacao_unblock_26_lote_a);
END $$;
