-- Remove low-confidence historico_politico entries from Wikipedia categories
-- These have periodo_inicio=0 or NULL and were inferred from Wikipedia category pages,
-- not from verified sources. Runtime filter (isLowConfidenceHistoricalEntry) is no longer needed.
DELETE FROM historico_politico
WHERE eleito_por ILIKE '%wikipedia (categorias)%'
  AND (periodo_inicio IS NULL OR periodo_inicio <= 0);
