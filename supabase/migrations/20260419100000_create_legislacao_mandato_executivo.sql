-- ============================================
-- Fluxo 5B — Legislação de chefes do Executivo
-- Tabela separada para legislação vinculada a mandatos executivos
-- ============================================

CREATE TABLE legislacao_mandato_executivo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id UUID NOT NULL REFERENCES candidatos(id) ON DELETE CASCADE,
  historico_politico_id UUID REFERENCES historico_politico(id) ON DELETE SET NULL,
  tipo_relacao TEXT NOT NULL,
  esfera TEXT NOT NULL,
  uf_norma CHAR(2),
  tipo_norma TEXT,
  numero TEXT,
  ano INTEGER,
  data_norma DATE,
  ementa TEXT,
  signatario TEXT,
  autoridade_papel TEXT NOT NULL DEFAULT 'nao_informado',
  fonte_primaria_url TEXT NOT NULL,
  fonte_primaria_titulo TEXT,
  fonte_tramitacao_url TEXT,
  identificador_fonte TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Check: tipo_relacao
  CONSTRAINT chk_tipo_relacao CHECK (tipo_relacao IN ('projeto_enviado_pelo_executivo', 'lei_sancionada', 'lei_promulgada_pelo_legislativo')),

  -- Check: esfera
  CONSTRAINT chk_esfera CHECK (esfera IN ('federal', 'estadual')),

  -- Check: autoridade_papel
  CONSTRAINT chk_autoridade_papel CHECK (autoridade_papel IN ('titular', 'vice_interino', 'mesa_legislativa', 'outro', 'nao_informado')),

  -- Check: fonte_primaria_url não pode ser string vazia após trim
  CONSTRAINT chk_fonte_primaria_url CHECK (TRIM(fonte_primaria_url) <> ''),

  -- Check: se esfera = 'federal', uf_norma deve ser null
  CONSTRAINT chk_federal_uf_null CHECK (
    (esfera = 'federal' AND uf_norma IS NULL) OR
    (esfera <> 'federal')
  ),

  -- Check: se esfera = 'estadual', uf_norma deve ser preenchida
  CONSTRAINT chk_estadual_uf_preenchida CHECK (
    (esfera = 'estadual' AND uf_norma IS NOT NULL) OR
    (esfera <> 'estadual')
  ),

  -- Check: uf_norma deve casar com ^[A-Z]{2}$
  CONSTRAINT chk_uf_norma_format CHECK (
    uf_norma IS NULL OR
    uf_norma ~ '^[A-Z]{2}$'
  ),

  -- Check: se tipo_relacao = 'lei_sancionada', exigir data_norma, signatário não vazio e autoridade_papel específico
  CONSTRAINT chk_lei_sancionada CHECK (
    (tipo_relacao <> 'lei_sancionada') OR
    (
      data_norma IS NOT NULL AND
      signatario IS NOT NULL AND
      TRIM(signatario) <> '' AND
      autoridade_papel IN ('titular', 'vice_interino', 'outro')
    )
  ),

  -- Check: se tipo_relacao = 'lei_promulgada_pelo_legislativo', exigir autoridade_papel = 'mesa_legislativa'
  CONSTRAINT chk_lei_promulgada_legislativo CHECK (
    (tipo_relacao <> 'lei_promulgada_pelo_legislativo') OR
    autoridade_papel = 'mesa_legislativa'
  )
);

-- Índices
CREATE INDEX idx_legislacao_mandato_executivo_candidato_id ON legislacao_mandato_executivo(candidato_id);
CREATE INDEX idx_legislacao_mandato_executivo_historico_politico_id ON legislacao_mandato_executivo(historico_politico_id);
CREATE INDEX idx_legislacao_mandato_executivo_esfera_uf_ano ON legislacao_mandato_executivo(esfera, uf_norma, ano);
CREATE INDEX idx_legislacao_mandato_executivo_data_norma ON legislacao_mandato_executivo(data_norma);
CREATE INDEX idx_legislacao_mandato_executivo_identificador_fonte ON legislacao_mandato_executivo(identificador_fonte);

-- RLS
ALTER TABLE legislacao_mandato_executivo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública" ON legislacao_mandato_executivo
  FOR SELECT USING (public.is_public_candidate(candidato_id));

-- Grants
GRANT SELECT ON legislacao_mandato_executivo TO anon, authenticated;
