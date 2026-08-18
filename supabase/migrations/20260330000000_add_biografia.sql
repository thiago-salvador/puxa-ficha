-- Add biografia column for candidate summaries
ALTER TABLE candidatos ADD COLUMN IF NOT EXISTS biografia TEXT;
-- Add feito_positivo and escandalo as valid pontos_atencao categories
-- (no schema change needed, categories are free-text in the DB)
-- New categories: feito_positivo, escandalo

-- Update schema.sql comment for reference
COMMENT ON COLUMN candidatos.biografia IS 'Resumo biografico do candidato (Wikipedia-style)';
