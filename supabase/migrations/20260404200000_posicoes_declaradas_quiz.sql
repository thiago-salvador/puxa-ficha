-- Posicoes publicas declaradas (curadoria) para o quiz fase 2.
-- So entram no score com verificado = true (regra AGENTS: IA nao como curadoria sem revisao).

CREATE TABLE IF NOT EXISTS posicoes_declaradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID NOT NULL REFERENCES candidatos(id) ON DELETE CASCADE,
  tema TEXT NOT NULL,
  posicao TEXT NOT NULL CHECK (posicao IN ('a_favor', 'contra', 'ambiguo')),
  descricao TEXT,
  fonte TEXT,
  url_fonte TEXT,
  verificado BOOLEAN NOT NULL DEFAULT FALSE,
  gerado_por TEXT NOT NULL DEFAULT 'curadoria',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (candidato_id, tema)
);

CREATE INDEX IF NOT EXISTS idx_posicoes_declaradas_candidato ON posicoes_declaradas (candidato_id);
CREATE INDEX IF NOT EXISTS idx_posicoes_declaradas_tema ON posicoes_declaradas (tema);

ALTER TABLE posicoes_declaradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública posicoes declaradas"
  ON posicoes_declaradas
  FOR SELECT
  USING (is_public_candidate(candidato_id));

GRANT SELECT ON posicoes_declaradas TO anon, authenticated;
