BEGIN;

-- Alinha ordem com `normalizeForSearch` em `src/lib/search-normalize.ts`:
-- NFD → strip marcas U+0300–U+036F → lower → trim (antes: lower/trim → NFD → strip).
CREATE OR REPLACE FUNCTION public.normalize_for_search(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  t text := COALESCE(p_text, '');
BEGIN
  t := normalize(t, NFD);
  t := regexp_replace(t, '[\u0300-\u036F]', '', 'g');
  RETURN lower(trim(t));
END;
$$;

COMMIT;
