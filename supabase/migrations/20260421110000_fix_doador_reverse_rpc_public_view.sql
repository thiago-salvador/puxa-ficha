BEGIN;
-- Fluxo 3 / Doadores:
-- Depois que SELECT publico da tabela bruta financiamento foi revogado, a RPC
-- SECURITY INVOKER precisa ler a superficie sanitizada financiamento_publico.
-- Nao conceder SELECT anon/authenticated de volta para financiamento.

CREATE OR REPLACE VIEW public.financiamento_publico AS
SELECT
  f.id,
  f.candidato_id,
  f.ano_eleicao,
  f.total_arrecadado,
  f.total_fundo_partidario,
  f.total_fundo_eleitoral,
  f.total_pessoa_fisica,
  f.total_recursos_proprios,
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'nome', elem.value ->> 'nome',
        'valor', elem.value ->> 'valor',
        'tipo', elem.value ->> 'tipo'
      )
      ORDER BY (elem.value ->> 'valor')::numeric DESC NULLS LAST
    ) FILTER (WHERE elem.value IS NOT NULL),
    '[]'::jsonb
  ) AS maiores_doadores,
  f.fonte,
  f.created_at
FROM public.financiamento f
LEFT JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN f.maiores_doadores IS NOT NULL AND jsonb_typeof(f.maiores_doadores) = 'array' THEN f.maiores_doadores
    ELSE '[]'::jsonb
  END
) AS elem(value) ON true
WHERE public.is_public_candidate(f.candidato_id)
GROUP BY
  f.id,
  f.candidato_id,
  f.ano_eleicao,
  f.total_arrecadado,
  f.total_fundo_partidario,
  f.total_fundo_eleitoral,
  f.total_pessoa_fisica,
  f.total_recursos_proprios,
  f.fonte,
  f.created_at;
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;
REVOKE SELECT ON public.financiamento FROM anon, authenticated;
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
  FROM public.financiamento_publico f
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
