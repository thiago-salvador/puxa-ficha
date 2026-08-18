-- Data factual opcional para pontos de atencao (timeline e futuros usos).
ALTER TABLE pontos_atencao
  ADD COLUMN IF NOT EXISTS data_referencia DATE;

COMMENT ON COLUMN pontos_atencao.data_referencia IS
  'Data do fato quando conhecida; timeline publica so inclui ponto quando preenchida e demais regras de visibilidade.';
