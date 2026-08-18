-- Tipo de evento na trajetória: mandato (exercício/posição) vs candidatura (pleito sem mandato naquele registo).
-- Backfill alinhado a observações TSE e convenções existentes do ingest.

ALTER TABLE historico_politico
  ADD COLUMN IF NOT EXISTS tipo_evento text
  CHECK (tipo_evento IS NULL OR tipo_evento IN ('mandato', 'candidatura'));

COMMENT ON COLUMN historico_politico.tipo_evento IS
  'mandato = cargo exercido ou posição (P39, curadoria); candidatura = pleito TSE sem mandato ou linha Candidatura:';

-- Candidaturas explícitas na observação
UPDATE historico_politico
SET tipo_evento = 'candidatura'
WHERE tipo_evento IS NULL
  AND COALESCE(observacoes, '') ~* '^\s*Candidatura:';

-- Pleitos TSE com mesmo ano início/fim (não eleito / suplente / etc.)
UPDATE historico_politico
SET tipo_evento = 'candidatura'
WHERE tipo_evento IS NULL
  AND periodo_inicio IS NOT NULL
  AND periodo_fim IS NOT NULL
  AND periodo_inicio = periodo_fim
  AND COALESCE(observacoes, '') ILIKE '%TSE%';

-- Demais linhas com período = mandato ou posição
UPDATE historico_politico
SET tipo_evento = 'mandato'
WHERE tipo_evento IS NULL;
