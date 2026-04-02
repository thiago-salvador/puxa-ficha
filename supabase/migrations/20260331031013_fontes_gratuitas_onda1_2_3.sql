
-- Novas colunas em candidatos
ALTER TABLE candidatos
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS tcu_inabilitado BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tcu_contas_irregulares BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS situacao_candidatura TEXT,
  ADD COLUMN IF NOT EXISTS wikidata_id TEXT;

CREATE INDEX IF NOT EXISTS idx_candidatos_cpf ON candidatos (cpf);
CREATE INDEX IF NOT EXISTS idx_candidatos_wikidata ON candidatos (wikidata_id);

-- Tabela: sancoes_administrativas
CREATE TABLE IF NOT EXISTS sancoes_administrativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID REFERENCES candidatos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT,
  orgao_sancionador TEXT,
  data_inicio DATE,
  data_fim DATE,
  fundamentacao TEXT,
  vinculo TEXT DEFAULT 'direto',
  cnpj_empresa TEXT,
  numero_processo TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  fonte TEXT DEFAULT 'Portal da Transparencia',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sancoes_candidato ON sancoes_administrativas (candidato_id);
CREATE INDEX IF NOT EXISTS idx_sancoes_tipo ON sancoes_administrativas (tipo);

ALTER TABLE sancoes_administrativas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sancoes_administrativas'
  ) THEN
    CREATE POLICY "Leitura publica" ON sancoes_administrativas FOR SELECT USING (true);
  END IF;
END $$;

-- Tabela: indicadores_estaduais
CREATE TABLE IF NOT EXISTS indicadores_estaduais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estado CHAR(2) NOT NULL,
  ano INTEGER NOT NULL,
  fonte TEXT NOT NULL,
  indicador TEXT NOT NULL,
  valor NUMERIC,
  valor_texto TEXT,
  unidade TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (estado, ano, fonte, indicador)
);

CREATE INDEX IF NOT EXISTS idx_indicadores_estado ON indicadores_estaduais (estado);
CREATE INDEX IF NOT EXISTS idx_indicadores_fonte ON indicadores_estaduais (fonte);
CREATE INDEX IF NOT EXISTS idx_indicadores_estado_ano ON indicadores_estaduais (estado, ano);

ALTER TABLE indicadores_estaduais ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'indicadores_estaduais'
  ) THEN
    CREATE POLICY "Leitura publica" ON indicadores_estaduais FOR SELECT USING (true);
  END IF;
END $$;
;
