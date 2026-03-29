-- ============================================
-- SEED: Pré-candidatos para o MVP
-- Dados baseados em pesquisas e declarações até março 2026
-- ============================================

-- ============================================
-- PRESIDENTE
-- ============================================

INSERT INTO candidatos (nome_completo, nome_urna, slug, partido_atual, partido_sigla, cargo_atual, cargo_disputado, estado, status, formacao, profissao_declarada) VALUES

-- Lula
('Luiz Inácio Lula da Silva', 'Lula', 'lula', 'Partido dos Trabalhadores', 'PT', 'Presidente da República', 'Presidente', NULL, 'pre-candidato', 'Ensino fundamental incompleto', 'Metalúrgico'),

-- Flávio Bolsonaro
('Flávio Nantes Bolsonaro', 'Flávio Bolsonaro', 'flavio-bolsonaro', 'Partido Liberal', 'PL', 'Senador', 'Presidente', NULL, 'pre-candidato', 'Superior completo (Direito)', 'Advogado'),

-- Tarcísio de Freitas (pode disputar presidente ou reeleição pra governador)
('Tarcísio Gomes de Freitas', 'Tarcísio', 'tarcisio-de-freitas', 'Republicanos', 'REPUBLICANOS', 'Governador de São Paulo', 'Presidente', NULL, 'pre-candidato', 'Superior completo (Engenharia Civil)', 'Engenheiro'),

-- Ronaldo Caiado
('Ronaldo Ramos Caiado', 'Caiado', 'ronaldo-caiado', 'Partido Social Democrático', 'PSD', 'Governador de Goiás', 'Presidente', NULL, 'pre-candidato', 'Superior completo (Medicina)', 'Médico'),

-- Romeu Zema
('Romeu Zema Neto', 'Romeu Zema', 'romeu-zema', 'Partido Novo', 'NOVO', 'Governador de Minas Gerais', 'Presidente', NULL, 'pre-candidato', 'Superior completo (Engenharia de Produção)', 'Empresário'),

-- Ratinho Junior
('Carlos Roberto Massa Júnior', 'Ratinho Junior', 'ratinho-junior', 'Partido Social Democrático', 'PSD', 'Ex-Governador do Paraná', 'Presidente', NULL, 'pre-candidato', 'Superior completo (Jornalismo)', 'Jornalista'),

-- Eduardo Leite
('Eduardo Figueiredo Cavalheiro Leite', 'Eduardo Leite', 'eduardo-leite', 'Partido Social Democrático', 'PSD', 'Governador do Rio Grande do Sul', 'Presidente', NULL, 'pre-candidato', 'Superior completo (Direito)', 'Advogado'),

-- Simone Tebet
('Simone Nassar Tebet', 'Simone Tebet', 'simone-tebet', 'Movimento Democrático Brasileiro', 'MDB', 'Ministra do Planejamento', 'Presidente', NULL, 'pre-candidato', 'Superior completo (Direito)', 'Advogada'),

-- Fernando Haddad (cenário alternativo ao Lula)
('Fernando Haddad', 'Haddad', 'fernando-haddad', 'Partido dos Trabalhadores', 'PT', 'Ministro da Fazenda', 'Presidente', NULL, 'pre-candidato', 'Doutorado (Filosofia)', 'Professor'),

-- Michelle Bolsonaro
('Michelle de Paula Firmo Reinaldo Bolsonaro', 'Michelle Bolsonaro', 'michelle-bolsonaro', 'Partido Liberal', 'PL', 'Sem cargo público', 'Presidente', NULL, 'pre-candidato', 'Superior completo (Direito)', 'Advogada');


-- ============================================
-- GOVERNADORES - Top 5 estados
-- Dados parciais, expandir com pesquisa por estado
-- ============================================

-- SÃO PAULO (se Tarcísio sair pra presidente)
-- Nomes que aparecem em pesquisas para SP:
-- Guilherme Boulos, Fernando Haddad, Felício Ramuth, Tomás Covas, etc.
-- Preencher conforme pesquisas estaduais

-- MINAS GERAIS (Zema sai pra presidente)
-- Nomes possíveis: Alexandre Kalil, Nikolas Ferreira, etc.

-- RIO DE JANEIRO
-- Nomes possíveis: Cláudio Castro (reeleição?), Eduardo Paes, etc.

-- BAHIA
-- Nomes possíveis: Jerônimo Rodrigues (reeleição), ACM Neto, etc.

-- RIO GRANDE DO SUL (se Eduardo Leite sair)
-- Nomes possíveis: Manuela D'Ávila, etc.


-- ============================================
-- VOTAÇÕES-CHAVE (pra popular o comparador)
-- ============================================

INSERT INTO votacoes_chave (titulo, descricao, data_votacao, casa, tema, impacto_popular) VALUES

('Reforma Trabalhista', 'PL 6787/2016 que alterou a CLT, permitindo trabalho intermitente, prevalência do negociado sobre o legislado, entre outros', '2017-07-11', 'Câmara', 'trabalho', 'Retirou garantias trabalhistas de milhões de brasileiros. Permitiu contratos precários e redução de direitos.'),

('Teto de Gastos (EC 95)', 'Emenda Constitucional que congelou os gastos públicos por 20 anos', '2016-12-13', 'Câmara', 'economia', 'Limitou investimentos em saúde e educação por duas décadas. Considerada a maior restrição fiscal da história do país.'),

('Reforma da Previdência', 'PEC 6/2019 que alterou regras de aposentadoria', '2019-07-10', 'Câmara', 'previdencia', 'Aumentou idade mínima para aposentadoria e tempo de contribuição, afetando especialmente trabalhadores de baixa renda.'),

('Marco Legal da IA (PL 2338/2023)', 'Regulamentação do uso de inteligência artificial no Brasil', '2024-12-10', 'Senado', 'tecnologia', 'Primeiro marco legal para regular o uso de IA, com regras sobre transparência algorítmica e proteção de dados.'),

('Privatização da Eletrobras', 'PL 5877/2019 que autorizou a privatização da Eletrobras', '2021-05-20', 'Câmara', 'economia', 'Transferiu o controle da maior empresa de energia da América Latina para o setor privado.'),

('PL das Fake News', 'PL 2630/2020 sobre liberdade, responsabilidade e transparência na internet', '2024-04-10', 'Câmara', 'tecnologia', 'Tentativa de regular plataformas digitais e combater desinformação. Gerou debate sobre liberdade de expressão.'),

('Orçamento Secreto (Emendas de Relator)', 'Emendas RP9 que permitiram distribuição de recursos sem transparência', '2021-12-20', 'Câmara', 'transparencia', 'Permitiu que bilhões fossem distribuídos sem identificação do parlamentar beneficiado. Considerado o maior esquema de compra de votos do Congresso.'),

('Autonomia do Banco Central', 'PLP 19/2019 que deu autonomia ao Banco Central', '2021-02-04', 'Senado', 'economia', 'Blindou a política monetária de interferência governamental, mas também removeu controle democrático sobre juros e câmbio.');


-- ============================================
-- PONTOS DE ATENÇÃO (exemplos de curadoria)
-- Estes precisam ser verificados e atualizados manualmente
-- ============================================

-- Nota: os pontos abaixo são EXEMPLOS da estrutura.
-- Cada ponto precisa ser checado com fontes antes de publicar.
-- A curadoria editorial é o que diferencia esta ferramenta.
