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
-- 7b. POSIÇÕES DECLARADAS (quiz fase 2, curadoria)
-- ============================================
CREATE TABLE posicoes_declaradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  tema TEXT NOT NULL,
  posicao TEXT NOT NULL CHECK (posicao IN ('a_favor', 'contra', 'ambiguo')),
  descricao TEXT,
  fonte TEXT,
  url_fonte TEXT,
  verificado BOOLEAN NOT NULL DEFAULT FALSE,
  gerado_por TEXT NOT NULL DEFAULT 'curadoria',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (candidato_id, tema)
);

CREATE INDEX idx_posicoes_declaradas_candidato ON posicoes_declaradas (candidato_id);
CREATE INDEX idx_posicoes_declaradas_tema ON posicoes_declaradas (tema);

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
  data_referencia DATE,
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
  (SELECT COUNT(*)
   FROM pontos_atencao pa
   WHERE pa.candidato_id = c.id
     AND is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado)) as total_pontos_atencao,
  (SELECT COUNT(*)
   FROM pontos_atencao pa
   WHERE pa.candidato_id = c.id
     AND is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado)
     AND pa.categoria <> 'feito_positivo'
     AND pa.gravidade = 'critica') as pontos_criticos,
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
  (SELECT COUNT(*)
   FROM pontos_atencao pa
   WHERE pa.candidato_id = c.id
     AND is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado)
     AND pa.categoria <> 'feito_positivo'
     AND pa.gravidade IN ('critica', 'alta')) as alertas_graves,
  (SELECT valor_total FROM patrimonio pat WHERE pat.candidato_id = c.id ORDER BY ano_eleicao DESC LIMIT 1) as patrimonio_declarado,
  (SELECT json_agg(json_build_object('titulo', pa.titulo, 'categoria', pa.categoria, 'gravidade', pa.gravidade))
   FROM pontos_atencao pa
   WHERE pa.candidato_id = c.id
     AND is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado)
  ) as pontos_atencao
FROM candidatos_publico c;

-- Grants: app pública lê views, não a tabela base
GRANT SELECT ON candidatos_publico TO anon, authenticated;
GRANT SELECT ON v_ficha_candidato TO anon, authenticated;
GRANT SELECT ON v_comparador TO anon, authenticated;
REVOKE SELECT ON candidatos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION is_public_candidate(target_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidatos c
    WHERE c.id = target_candidate_id
      AND c.publicavel = true
      AND c.status <> 'removido'
  );
$$;

REVOKE ALL ON FUNCTION public.is_public_candidate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_candidate(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION is_public_attention_point(
  is_visible boolean,
  generated_by text,
  is_verified boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(is_visible, false)
    AND (
      COALESCE(generated_by, 'curadoria') <> 'ia'
      OR COALESCE(is_verified, false)
    );
$$;

REVOKE ALL ON FUNCTION public.is_public_attention_point(boolean, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_attention_point(boolean, text, boolean) TO anon, authenticated, service_role;

-- ============================================
-- Row Level Security (RLS) - dados públicos, leitura alinhada ao gate publicavel
-- ============================================
ALTER TABLE candidatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON candidatos
  FOR SELECT USING (publicavel = true AND status <> 'removido');

ALTER TABLE historico_politico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON historico_politico
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE mudancas_partido ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON mudancas_partido
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE patrimonio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON patrimonio
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE financiamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON financiamento
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE votacoes_chave ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON votacoes_chave FOR SELECT USING (true);

ALTER TABLE votos_candidato ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON votos_candidato
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE projetos_lei ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON projetos_lei
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE posicoes_declaradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública posicoes declaradas" ON posicoes_declaradas
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE processos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON processos
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE pontos_atencao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON pontos_atencao
  FOR SELECT USING (
    is_public_attention_point(visivel, gerado_por, verificado)
    AND is_public_candidate(candidato_id)
  );

ALTER TABLE gastos_parlamentares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON gastos_parlamentares
  FOR SELECT USING (is_public_candidate(candidato_id));

ALTER TABLE sancoes_administrativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON sancoes_administrativas
  FOR SELECT USING (is_public_candidate(candidato_id));

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
CREATE POLICY "Leitura pública" ON noticias_candidato
  FOR SELECT USING (is_public_candidate(candidato_id));

GRANT SELECT ON historico_politico TO anon, authenticated;
GRANT SELECT ON mudancas_partido TO anon, authenticated;
GRANT SELECT ON patrimonio TO anon, authenticated;
GRANT SELECT ON financiamento TO anon, authenticated;
GRANT SELECT ON votacoes_chave TO anon, authenticated;
GRANT SELECT ON votos_candidato TO anon, authenticated;
GRANT SELECT ON projetos_lei TO anon, authenticated;
GRANT SELECT ON posicoes_declaradas TO anon, authenticated;
GRANT SELECT ON processos TO anon, authenticated;
GRANT SELECT ON pontos_atencao TO anon, authenticated;
GRANT SELECT ON gastos_parlamentares TO anon, authenticated;
GRANT SELECT ON sancoes_administrativas TO anon, authenticated;
GRANT SELECT ON indicadores_estaduais TO anon, authenticated;
GRANT SELECT ON noticias_candidato TO anon, authenticated;

-- ============================================
-- UNIQUE CONSTRAINTS (idempotent pipelines)
-- ============================================
ALTER TABLE patrimonio ADD CONSTRAINT uq_patrimonio_candidato_ano UNIQUE (candidato_id, ano_eleicao);
ALTER TABLE financiamento ADD CONSTRAINT uq_financiamento_candidato_ano UNIQUE (candidato_id, ano_eleicao);
ALTER TABLE gastos_parlamentares ADD CONSTRAINT uq_gastos_candidato_ano UNIQUE (candidato_id, ano);
ALTER TABLE votos_candidato ADD CONSTRAINT uq_votos_candidato_votacao UNIQUE (candidato_id, votacao_id);
ALTER TABLE historico_politico ADD CONSTRAINT uq_historico_candidato_cargo_periodo UNIQUE (candidato_id, cargo, periodo_inicio);
ALTER TABLE projetos_lei ADD CONSTRAINT uq_projetos_lei_candidato_proposicao UNIQUE (candidato_id, proposicao_id_api);
ALTER TABLE mudancas_partido ADD CONSTRAINT uq_mudancas_partido_candidato_ano_partido UNIQUE NULLS NOT DISTINCT (candidato_id, ano, partido_novo);

CREATE TABLE alert_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  nome TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  verify_token_hash TEXT UNIQUE,
  verify_token_expires_at TIMESTAMPTZ,
  manage_token_hash TEXT NOT NULL UNIQUE,
  manage_token_ciphertext TEXT NOT NULL,
  canal_email BOOLEAN NOT NULL DEFAULT TRUE,
  consentimento_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_consentimento_hash TEXT,
  last_verification_email_sent_at TIMESTAMPTZ,
  last_digest_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alert_subscribers_verified ON alert_subscribers (verified, created_at DESC);
CREATE INDEX idx_alert_subscribers_last_verification_email_sent_at
  ON alert_subscribers (last_verification_email_sent_at DESC);

CREATE TABLE alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID NOT NULL REFERENCES alert_subscribers(id) ON DELETE CASCADE,
  candidato_id UUID NOT NULL REFERENCES candidatos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscriber_id, candidato_id)
);

CREATE INDEX idx_alert_subscriptions_candidate ON alert_subscriptions (candidato_id, created_at DESC);

CREATE TABLE candidate_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID NOT NULL REFERENCES candidatos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('processo', 'mudanca_partido', 'patrimonio', 'noticia', 'ponto_atencao')),
  operacao TEXT NOT NULL CHECK (operacao IN ('insert', 'update', 'publicado')),
  tabela_origem TEXT NOT NULL,
  registro_id UUID,
  titulo TEXT NOT NULL,
  descricao TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidate_changes_candidate_created_at
  ON candidate_changes (candidato_id, created_at DESC);
CREATE INDEX idx_candidate_changes_created_at ON candidate_changes (created_at DESC);

CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID REFERENCES alert_subscribers(id) ON DELETE SET NULL,
  canal TEXT NOT NULL CHECK (canal IN ('email')),
  digest_date DATE NOT NULL,
  candidato_ids UUID[] NOT NULL DEFAULT '{}',
  change_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscriber_id, canal, digest_date)
);

CREATE INDEX idx_notification_log_digest_date ON notification_log (digest_date DESC, status);

ALTER TABLE alert_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION alert_subscribers_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_alert_subscribers_set_updated_at
BEFORE UPDATE ON alert_subscribers
FOR EACH ROW
EXECUTE FUNCTION alert_subscribers_set_updated_at();

CREATE OR REPLACE FUNCTION log_candidate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate_id UUID;
  change_tipo TEXT;
  change_operacao TEXT;
  change_titulo TEXT;
  change_descricao TEXT;
  change_metadata JSONB;
  should_log BOOLEAN := FALSE;
  new_public_attention_point BOOLEAN := FALSE;
  old_public_attention_point BOOLEAN := FALSE;
BEGIN
  IF TG_TABLE_NAME = 'processos' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'processo';
    change_titulo := COALESCE(NULLIF(NEW.descricao, ''), 'Processo atualizado');
    change_descricao := CONCAT_WS(' · ', NEW.tribunal, NEW.status);
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'tribunal', NEW.tribunal,
        'status', NEW.status,
        'gravidade', NEW.gravidade,
        'data_inicio', NEW.data_inicio,
        'data_decisao', NEW.data_decisao,
        'numero_processo', NEW.numero_processo
      )
    );

    IF TG_OP = 'INSERT' THEN
      should_log := TRUE;
      change_operacao := 'insert';
    ELSIF NEW.status IS DISTINCT FROM OLD.status
      OR NEW.data_decisao IS DISTINCT FROM OLD.data_decisao
      OR NEW.gravidade IS DISTINCT FROM OLD.gravidade
      OR NEW.descricao IS DISTINCT FROM OLD.descricao THEN
      should_log := TRUE;
      change_operacao := 'update';
    END IF;
  ELSIF TG_TABLE_NAME = 'mudancas_partido' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'mudanca_partido';
    change_operacao := 'insert';
    change_titulo := CONCAT('Mudança de partido: ', COALESCE(NEW.partido_novo, 'partido não informado'));
    change_descricao := CONCAT_WS(' · ', NEW.partido_anterior, NEW.contexto);
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'partido_anterior', NEW.partido_anterior,
        'partido_novo', NEW.partido_novo,
        'ano', NEW.ano,
        'data_mudanca', NEW.data_mudanca,
        'contexto', NEW.contexto
      )
    );
    should_log := TG_OP = 'INSERT';
  ELSIF TG_TABLE_NAME = 'patrimonio' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'patrimonio';
    change_titulo := CONCAT('Patrimônio declarado ', NEW.ano_eleicao);
    change_descricao := 'Declaração patrimonial atualizada.';
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'ano_eleicao', NEW.ano_eleicao,
        'valor_total', NEW.valor_total,
        'quantidade_bens', jsonb_array_length(COALESCE(NEW.bens, '[]'::jsonb))
      )
    );

    IF TG_OP = 'INSERT' THEN
      should_log := TRUE;
      change_operacao := 'insert';
    ELSIF NEW.valor_total IS DISTINCT FROM OLD.valor_total
      OR NEW.bens IS DISTINCT FROM OLD.bens THEN
      should_log := TRUE;
      change_operacao := 'update';
    END IF;
  ELSIF TG_TABLE_NAME = 'noticias_candidato' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'noticia';
    change_operacao := 'insert';
    change_titulo := NEW.titulo;
    change_descricao := COALESCE(NEW.snippet, NEW.fonte, 'Nova notícia publicada.');
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'fonte', NEW.fonte,
        'url', NEW.url,
        'data_publicacao', NEW.data_publicacao
      )
    );
    should_log := TG_OP = 'INSERT';
  ELSIF TG_TABLE_NAME = 'pontos_atencao' THEN
    candidate_id := NEW.candidato_id;
    change_tipo := 'ponto_atencao';
    new_public_attention_point := is_public_attention_point(NEW.visivel, NEW.gerado_por, NEW.verificado);
    old_public_attention_point := CASE
      WHEN TG_OP = 'UPDATE' THEN is_public_attention_point(OLD.visivel, OLD.gerado_por, OLD.verificado)
      ELSE FALSE
    END;
    change_titulo := NEW.titulo;
    change_descricao := NEW.descricao;
    change_metadata := jsonb_strip_nulls(
      jsonb_build_object(
        'categoria', NEW.categoria,
        'gravidade', NEW.gravidade,
        'gerado_por', NEW.gerado_por,
        'verificado', NEW.verificado,
        'data_referencia', NEW.data_referencia,
        'fontes_count', jsonb_array_length(COALESCE(NEW.fontes, '[]'::jsonb))
      )
    );

    IF new_public_attention_point THEN
      IF TG_OP = 'INSERT' THEN
        should_log := TRUE;
        change_operacao := 'insert';
      ELSIF NOT old_public_attention_point THEN
        should_log := TRUE;
        change_operacao := 'publicado';
      END IF;
    END IF;
  END IF;

  IF NOT should_log OR candidate_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO candidate_changes (
    candidato_id,
    tipo,
    operacao,
    tabela_origem,
    registro_id,
    titulo,
    descricao,
    metadata
  )
  VALUES (
    candidate_id,
    change_tipo,
    change_operacao,
    TG_TABLE_NAME,
    NEW.id,
    change_titulo,
    change_descricao,
    change_metadata
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_candidate_change_processos
AFTER INSERT OR UPDATE ON processos
FOR EACH ROW
EXECUTE FUNCTION log_candidate_change();

CREATE TRIGGER trg_candidate_change_mudancas_partido
AFTER INSERT ON mudancas_partido
FOR EACH ROW
EXECUTE FUNCTION log_candidate_change();

CREATE TRIGGER trg_candidate_change_patrimonio
AFTER INSERT OR UPDATE ON patrimonio
FOR EACH ROW
EXECUTE FUNCTION log_candidate_change();

CREATE TRIGGER trg_candidate_change_noticias_candidato
AFTER INSERT ON noticias_candidato
FOR EACH ROW
EXECUTE FUNCTION log_candidate_change();

CREATE TRIGGER trg_candidate_change_pontos_atencao
AFTER INSERT OR UPDATE ON pontos_atencao
FOR EACH ROW
EXECUTE FUNCTION log_candidate_change();
