BEGIN;

-- Normalização espelhando `normalizeForSearch` em `src/lib/search-normalize.ts`:
-- NFD + remoção de marcas combinantes U+0300–U+036F + lower + trim (sem extensão unaccent).
CREATE OR REPLACE FUNCTION public.normalize_for_search(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  t text := lower(trim(COALESCE(p_text, '')));
BEGIN
  t := normalize(t, NFD);
  RETURN regexp_replace(t, '[\u0300-\u036F]', '', 'g');
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_for_search(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_for_search(text) TO anon, authenticated, service_role;

-- Visão reversa: doadores (top 10 TSE por campanha) → candidatos publicados apenas.
-- Semântica de match: substring no nome normalizado (equiv. a LIKE '%query%'), não igualdade exata.
-- Ex.: busca "silva" casa "SILVANA", "DA SILVA LTDA". MVP aceita ruído; se incomodar em produção,
-- trocar para = (exato normalizado) ou starts_with / tokenização.
CREATE OR REPLACE FUNCTION public.search_financiamento_by_doador_normalized(p_query text)
RETURNS TABLE (
  candidato_id uuid,
  slug text,
  nome_urna text,
  partido_sigla text,
  cargo_disputado text,
  estado text,
  ano_eleicao integer,
  valor numeric,
  tipo text,
  doador_nome_exibicao text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH trimmed AS (
    SELECT NULLIF(trim(COALESCE(p_query, '')), '') AS t
  ),
  q AS (
    SELECT public.normalize_for_search(trimmed.t) AS n
    FROM trimmed
    WHERE trimmed.t IS NOT NULL
  )
  SELECT
    c.id,
    c.slug,
    c.nome_urna,
    c.partido_sigla,
    c.cargo_disputado::text,
    c.estado,
    f.ano_eleicao,
    d.valor,
    COALESCE(d.tipo::text, ''),
    COALESCE(d.nome, '')
  FROM public.financiamento f
  INNER JOIN public.candidatos_publico c ON c.id = f.candidato_id
  CROSS JOIN LATERAL jsonb_to_recordset(
    CASE
      WHEN f.maiores_doadores IS NOT NULL AND jsonb_typeof(f.maiores_doadores) = 'array' THEN f.maiores_doadores
      ELSE '[]'::jsonb
    END
  ) AS d(nome text, valor numeric, tipo text)
  CROSS JOIN q
  WHERE d.nome IS NOT NULL
    AND trim(d.nome) <> ''
    AND position(q.n IN public.normalize_for_search(d.nome)) > 0
  ORDER BY f.ano_eleicao DESC, d.valor DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.search_financiamento_by_doador_normalized(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_financiamento_by_doador_normalized(text) TO anon, authenticated, service_role;

COMMIT;
