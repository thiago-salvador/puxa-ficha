-- ============================================
-- PUXA FICHA 2026
-- Schema do banco de dados (Supabase/PostgreSQL)
-- ============================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- busca fuzzy por nome

-- ============================================
-- 1. CANDIDATOS (tabela central)
-- ============================================
CREATE TABLE candidatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo TEXT NOT NULL,
  nome_urna TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- URL-friendly: "lula", "flavio-bolsonaro"
  cpf_hash TEXT, -- hash do CPF pra cruzar dados sem expor
  
  -- Dados pessoais
  data_nascimento DATE,
  idade INTEGER, -- calculado pelo pipeline: EXTRACT(YEAR FROM age(CURRENT_DATE, data_nascimento))
  naturalidade TEXT, -- cidade/estado
  formacao TEXT, -- grau de instrução declarado ao TSE
  profissao_declarada TEXT, -- o que declarou ao TSE
  
  -- Dados políticos atuais
  partido_atual TEXT NOT NULL,
  partido_sigla TEXT NOT NULL,
  cargo_atual TEXT, -- "Presidente da República", "Governador de SP", "Senador"
  cargo_disputado TEXT NOT NULL, -- "Presidente", "Governador"
  estado TEXT, -- NULL pra presidente, UF pra governador
  
  -- Status
  status TEXT DEFAULT 'pre-candidato', -- pre-candidato | candidato | indeferido | desistente
  situacao_candidatura TEXT, -- DS_SITUACAO_CANDIDATURA do TSE: DEFERIDO | INDEFERIDO | CASSADO | etc.

  -- Fotos e links
  foto_url TEXT,
  site_campanha TEXT,
  redes_sociais JSONB DEFAULT '{}', -- {"instagram": {"username": "...", "followers": N, "url": "..."}, "twitter": "...", "facebook": "...", "site_oficial": "..."}

  -- Dados eleitorais (TSE)
  cpf TEXT, -- CPF completo do candidato (dado público por lei eleitoral)

  -- Checks de idoneidade
  tcu_inabilitado BOOLEAN DEFAULT FALSE, -- inabilitado pelo TCU para cargo público
  tcu_contas_irregulares BOOLEAN DEFAULT FALSE, -- contas julgadas irregulares no CADIRREG/TCU

  -- Dados demograficos (TSE CSV)
  genero TEXT, -- "MASCULINO", "FEMININO"
  estado_civil TEXT, -- "SOLTEIRO(A)", "CASADO(A)", etc.
  cor_raca TEXT, -- "BRANCA", "PARDA", "PRETA", etc.
  email_campanha TEXT, -- email de campanha declarado ao TSE

  -- Biografia
  biografia TEXT, -- resumo biografico (Wikipedia ou curadoria)

  -- Wikidata
  wikidata_id TEXT, -- ex: Q12345

  -- Metadata
  fonte_dados TEXT[], -- ["TSE", "Câmara", "Senado", "curadoria"]
  ultima_atualizacao TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  publicavel BOOLEAN DEFAULT FALSE -- fail-closed gate: false = invisible on site
);

-- Índice pra busca por nome
CREATE INDEX idx_candidatos_nome ON candidatos USING gin (nome_completo gin_trgm_ops);
CREATE INDEX idx_candidatos_slug ON candidatos (slug);
CREATE INDEX idx_candidatos_cargo ON candidatos (cargo_disputado, estado);

-- ============================================
-- 2. HISTÓRICO POLÍTICO (cargos anteriores)
-- ============================================
CREATE TABLE historico_politico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  
  cargo TEXT NOT NULL, -- "Deputado Federal", "Senador", "Prefeito", etc.
  periodo_inicio INTEGER, -- ano
  periodo_fim INTEGER, -- ano (NULL = atual)
  partido TEXT,
  estado TEXT,
  eleito_por TEXT, -- "voto direto", "suplência", "nomeação"
  
  observacoes TEXT, -- notas relevantes sobre o período
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historico_candidato ON historico_politico (candidato_id);

-- ============================================
-- 3. MUDANÇAS DE PARTIDO (histórico de filiação)
-- ============================================
CREATE TABLE mudancas_partido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  
  partido_anterior TEXT NOT NULL,
  partido_novo TEXT NOT NULL,
  data_mudanca DATE,
  ano INTEGER,
  contexto TEXT, -- "janela partidária", "fusão", etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mudancas_candidato ON mudancas_partido (candidato_id);

-- ============================================
-- 4. PATRIMÔNIO DECLARADO
-- ============================================
CREATE TABLE patrimonio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  
  ano_eleicao INTEGER NOT NULL,
  valor_total NUMERIC(15, 2), -- em reais
  bens JSONB, -- array de bens individuais: [{"tipo": "imóvel", "descricao": "...", "valor": 500000}]
  
  fonte TEXT DEFAULT 'TSE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_patrimonio_candidato ON patrimonio (candidato_id, ano_eleicao);

-- ============================================
-- 5. FINANCIAMENTO DE CAMPANHA
-- ============================================
CREATE TABLE financiamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  
  ano_eleicao INTEGER NOT NULL,
  
  -- Totais
  total_arrecadado NUMERIC(15, 2),
  total_fundo_partidario NUMERIC(15, 2),
  total_fundo_eleitoral NUMERIC(15, 2),
  total_pessoa_fisica NUMERIC(15, 2),
  total_recursos_proprios NUMERIC(15, 2),
  
  -- Top doadores
  maiores_doadores JSONB, -- [{"nome": "...", "valor": ..., "tipo": "PF/PJ/fundo", "cnpj_cpf_hash": "..."}]
  
  fonte TEXT DEFAULT 'TSE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_financiamento_candidato ON financiamento (candidato_id, ano_eleicao);

-- ============================================
-- 6. VOTAÇÕES-CHAVE (pra quem é/foi congressista)
-- ============================================
CREATE TABLE votacoes_chave (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dados da votação
  titulo TEXT NOT NULL, -- "Reforma Trabalhista", "Teto de Gastos", etc.
  descricao TEXT, -- resumo acessível
  data_votacao DATE,
  casa TEXT, -- "Câmara" ou "Senado"
  proposicao_id TEXT, -- ID na API da Câmara/Senado
  tema TEXT, -- "trabalho", "economia", "meio_ambiente", etc.
  
  -- Contexto editorial
  impacto_popular TEXT, -- "Retirou direitos trabalhistas de X milhões de brasileiros"
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE votos_candidato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  votacao_id UUID REFERENCES votacoes_chave(id) ON DELETE CASCADE,
  
  voto TEXT NOT NULL, -- "sim", "não", "abstenção", "ausente", "obstrução"
  
  -- Flag de contradição (editorial)
  contradicao BOOLEAN DEFAULT FALSE,
  contradicao_descricao TEXT, -- "Votou a favor mas declarou ser contra em entrevista X"
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidato_id, votacao_id)
);

CREATE INDEX idx_votos_candidato ON votos_candidato (candidato_id);
CREATE INDEX idx_votos_votacao ON votos_candidato (votacao_id);

-- ============================================
-- 7. PROJETOS DE LEI (autoria)
-- ============================================
CREATE TABLE projetos_lei (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  
  tipo TEXT, -- "PL", "PEC", "PLP", etc.
  numero TEXT,
  ano INTEGER,
  ementa TEXT,
  tema TEXT,
  situacao TEXT, -- "tramitando", "aprovado", "arquivado", "vetado"
  url_inteiro_teor TEXT,
  
  -- Flag de destaque
  destaque BOOLEAN DEFAULT FALSE, -- projetos mais relevantes (curadoria)
  destaque_motivo TEXT,
  
  fonte TEXT DEFAULT 'Câmara',
  proposicao_id_api TEXT, -- ID na API da Câmara/Senado
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projetos_candidato ON projetos_lei (candidato_id);

-- ============================================
-- 8. PROCESSOS JUDICIAIS
-- ============================================
CREATE TABLE processos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  
  tipo TEXT NOT NULL, -- "criminal", "improbidade", "eleitoral", "civil"
  tribunal TEXT, -- "STF", "STJ", "TRE-SP", etc.
  numero_processo TEXT,
  descricao TEXT NOT NULL, -- resumo acessível
  status TEXT, -- "em andamento", "condenado", "absolvido", "prescrito"
  data_inicio DATE,
  data_decisao DATE,
  
  -- Gravidade (curadoria editorial)
  gravidade TEXT, -- "alta", "media", "baixa"
  
  fonte TEXT,
  url_fonte TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_processos_candidato ON processos (candidato_id);

-- ============================================
-- 9. PONTOS DE ATENÇÃO (flags editoriais)
-- ============================================
-- Esses são os "alertas" que diferenciam a ferramenta
CREATE TABLE pontos_atencao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  
  categoria TEXT NOT NULL, -- "corrupção", "contradição", "financiamento_suspeito", "mudança_partido", "processo_grave", "patrimonio_incompativel"
  titulo TEXT NOT NULL, -- frase curta de impacto
  descricao TEXT NOT NULL, -- explicação detalhada
  
  -- Evidências
  fontes JSONB, -- [{"titulo": "...", "url": "...", "data": "..."}]
  dados_relacionados JSONB, -- IDs de registros em outras tabelas
  
  -- Metadata editorial
  gravidade TEXT DEFAULT 'media', -- "critica", "alta", "media", "baixa"
  verificado BOOLEAN DEFAULT FALSE, -- passou por checagem manual
  gerado_por TEXT DEFAULT 'curadoria', -- "ia", "curadoria", "automatico"
  
  visivel BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pontos_candidato ON pontos_atencao (candidato_id);
CREATE INDEX idx_pontos_categoria ON pontos_atencao (categoria);
CREATE INDEX idx_pontos_gravidade ON pontos_atencao (gravidade);

-- ============================================
-- 10. GASTOS PARLAMENTARES (CEAP / Cota)
-- ============================================
CREATE TABLE gastos_parlamentares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  
  ano INTEGER NOT NULL,
  total_gasto NUMERIC(15, 2),
  detalhamento JSONB, -- [{"categoria": "passagens", "valor": ..., "fornecedor": "..."}]
  
  -- Destaques (gastos fora do padrão)
  gastos_destaque JSONB, -- gastos mais altos ou polêmicos
  
  fonte TEXT DEFAULT 'Câmara',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gastos_candidato ON gastos_parlamentares (candidato_id, ano);

-- ============================================
-- 11. SANÇÕES ADMINISTRATIVAS
-- ============================================
-- Sanções do Portal da Transparência: CEIS, CNEP, CEAF, CEPIM
CREATE TABLE sancoes_administrativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,            -- 'CEIS', 'CNEP', 'CEAF', 'CEPIM'
  descricao TEXT,
  orgao_sancionador TEXT,
  data_inicio DATE,
  data_fim DATE,
  fundamentacao TEXT,
  vinculo TEXT DEFAULT 'direto', -- 'direto' ou 'empresa_associada'
  cnpj_empresa TEXT,
  numero_processo TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  fonte TEXT DEFAULT 'Portal da Transparencia',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sancoes_candidato ON sancoes_administrativas (candidato_id);
CREATE INDEX idx_sancoes_tipo ON sancoes_administrativas (tipo);

-- ============================================
-- 12. INDICADORES ESTADUAIS
-- ============================================
-- SICONFI, Atlas da Violência, IBGE, IDEB, IPEA, CAPAG
-- Usados para contextualizar fichas de governadores
CREATE TABLE indicadores_estaduais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estado CHAR(2) NOT NULL,
  ano INTEGER NOT NULL,
  fonte TEXT NOT NULL,        -- 'siconfi', 'atlas_violencia', 'ibge', 'ideb', 'ipea', 'capag'
  indicador TEXT NOT NULL,    -- 'divida_rcl', 'homicidios_100k', 'pib_per_capita', 'ideb_em', 'gini', 'nota_capag', etc.
  valor NUMERIC,
  valor_texto TEXT,           -- para ratings como CAPAG A/B/C/D
  unidade TEXT,               -- 'reais', 'percentual', 'por_100k_hab', 'indice', etc.
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (estado, ano, fonte, indicador)
);

CREATE INDEX idx_indicadores_estado ON indicadores_estaduais (estado);
CREATE INDEX idx_indicadores_fonte ON indicadores_estaduais (fonte);
CREATE INDEX idx_indicadores_estado_ano ON indicadores_estaduais (estado, ano);

-- ============================================
-- 13. VIEWS ÚTEIS
-- ============================================

-- View: Projeção pública mínima de candidatos
CREATE VIEW candidatos_publico AS
SELECT
  c.id,
  c.nome_completo,
  c.nome_urna,
  c.slug,
  c.data_nascimento,
  c.idade,
  c.naturalidade,
  c.formacao,
  c.profissao_declarada,
  c.genero,
  c.estado_civil,
  c.cor_raca,
  c.partido_atual,
  c.partido_sigla,
  c.cargo_atual,
  c.cargo_disputado,
  c.estado,
  c.status,
  c.situacao_candidatura,
  c.biografia,
  c.foto_url,
  c.site_campanha,
  c.redes_sociais,
  c.fonte_dados,
  c.ultima_atualizacao
FROM candidatos c;

-- View: Ficha completa do candidato (pra Ficha Corrida)
CREATE VIEW v_ficha_candidato AS
SELECT
  c.id,
  c.nome_completo,
  c.nome_urna,
  c.slug,
  c.data_nascimento,
  c.idade,
  c.naturalidade,
  c.formacao,
  c.profissao_declarada,
  c.genero,
  c.estado_civil,
  c.cor_raca,
  c.partido_atual,
  c.partido_sigla,
  c.cargo_atual,
  c.cargo_disputado,
  c.estado,
  c.status,
  c.situacao_candidatura,
  c.biografia,
  c.foto_url,
  c.site_campanha,
  c.redes_sociais,
  c.fonte_dados,
  c.ultima_atualizacao,
  -- Contadores
  (SELECT COUNT(*) FROM processos p WHERE p.candidato_id = c.id) as total_processos,
  (SELECT COUNT(*) FROM processos p WHERE p.candidato_id = c.id AND p.tipo = 'criminal') as processos_criminais,
  (SELECT COUNT(*) FROM mudancas_partido mp WHERE mp.candidato_id = c.id) as total_mudancas_partido,
  (SELECT COUNT(*) FROM pontos_atencao pa WHERE pa.candidato_id = c.id AND pa.visivel = TRUE) as total_pontos_atencao,
  (SELECT COUNT(*) FROM pontos_atencao pa WHERE pa.candidato_id = c.id AND pa.gravidade = 'critica') as pontos_criticos,
  -- Último patrimônio
  (SELECT valor_total FROM patrimonio pat WHERE pat.candidato_id = c.id ORDER BY ano_eleicao DESC LIMIT 1) as ultimo_patrimonio,
  (SELECT ano_eleicao FROM patrimonio pat WHERE pat.candidato_id = c.id ORDER BY ano_eleicao DESC LIMIT 1) as ano_ultimo_patrimonio
FROM candidatos_publico c;

-- View: Comparação entre candidatos
CREATE VIEW v_comparador AS
SELECT
  c.id,
  c.nome_urna,
  c.slug,
  c.partido_sigla,
  c.cargo_disputado,
  c.estado,
  c.foto_url,
  COALESCE(c.idade, EXTRACT(YEAR FROM age(CURRENT_DATE, c.data_nascimento))::INTEGER) as idade,
  c.formacao,
  (SELECT COUNT(*) FROM processos p WHERE p.candidato_id = c.id) as total_processos,
  (SELECT COUNT(*) FROM mudancas_partido mp WHERE mp.candidato_id = c.id) as mudancas_partido,
  (SELECT COUNT(*) FROM pontos_atencao pa WHERE pa.candidato_id = c.id AND pa.gravidade IN ('critica', 'alta')) as alertas_graves,
  (SELECT valor_total FROM patrimonio pat WHERE pat.candidato_id = c.id ORDER BY ano_eleicao DESC LIMIT 1) as patrimonio_declarado,
  (SELECT json_agg(json_build_object('titulo', pa.titulo, 'categoria', pa.categoria, 'gravidade', pa.gravidade))
   FROM pontos_atencao pa WHERE pa.candidato_id = c.id AND pa.visivel = TRUE
  ) as pontos_atencao
FROM candidatos_publico c;

-- Grants: app pública lê views, não a tabela base
GRANT SELECT ON candidatos_publico TO anon, authenticated;
GRANT SELECT ON v_ficha_candidato TO anon, authenticated;
GRANT SELECT ON v_comparador TO anon, authenticated;
REVOKE SELECT ON candidatos FROM anon, authenticated;

-- ============================================
-- Row Level Security (RLS) - dados públicos, leitura aberta
-- ============================================
ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON candidatos FOR SELECT USING (true);

ALTER TABLE historico_politico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON historico_politico FOR SELECT USING (true);

ALTER TABLE mudancas_partido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON mudancas_partido FOR SELECT USING (true);

ALTER TABLE patrimonio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON patrimonio FOR SELECT USING (true);

ALTER TABLE financiamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON financiamento FOR SELECT USING (true);

ALTER TABLE votacoes_chave ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON votacoes_chave FOR SELECT USING (true);

ALTER TABLE votos_candidato ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON votos_candidato FOR SELECT USING (true);

ALTER TABLE projetos_lei ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON projetos_lei FOR SELECT USING (true);

ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON processos FOR SELECT USING (true);

ALTER TABLE pontos_atencao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON pontos_atencao FOR SELECT USING (true);

ALTER TABLE gastos_parlamentares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON gastos_parlamentares FOR SELECT USING (true);

ALTER TABLE sancoes_administrativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON sancoes_administrativas FOR SELECT USING (true);

ALTER TABLE indicadores_estaduais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON indicadores_estaduais FOR SELECT USING (true);

-- ============================================
-- 14. NOTÍCIAS (Google News RSS)
-- ============================================
CREATE TABLE noticias_candidato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  fonte TEXT,                   -- nome do veiculo (CNN Brasil, Folha, etc.)
  url TEXT NOT NULL,
  data_publicacao TIMESTAMPTZ,
  snippet TEXT,                 -- trecho da noticia
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidato_id, url)
);

CREATE INDEX idx_noticias_candidato_id ON noticias_candidato(candidato_id);
CREATE INDEX idx_noticias_data ON noticias_candidato(data_publicacao DESC);

ALTER TABLE noticias_candidato ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON noticias_candidato FOR SELECT USING (true);

-- ============================================
-- UNIQUE CONSTRAINTS (idempotent pipelines)
-- ============================================
ALTER TABLE patrimonio ADD CONSTRAINT uq_patrimonio_candidato_ano UNIQUE (candidato_id, ano_eleicao);
ALTER TABLE financiamento ADD CONSTRAINT uq_financiamento_candidato_ano UNIQUE (candidato_id, ano_eleicao);
ALTER TABLE gastos_parlamentares ADD CONSTRAINT uq_gastos_candidato_ano UNIQUE (candidato_id, ano);
ALTER TABLE votos_candidato ADD CONSTRAINT uq_votos_candidato_votacao UNIQUE (candidato_id, votacao_id);
ALTER TABLE historico_politico ADD CONSTRAINT uq_historico_candidato_cargo_periodo UNIQUE (candidato_id, cargo, periodo_inicio);
