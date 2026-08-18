BEGIN;

-- /doadores: dar teto a varredura da busca reversa por doador.
--
-- A versao anterior (20260421110000) recebia so p_query e devolvia TODA linha
-- que casasse, sem LIMIT. O termo vem do visitante, o casamento e por substring
-- (`position(q.n IN normalize_for_search(d.nome)) > 0`), e o resultado ainda era
-- gravado por 1 hora no Data Cache do Next sob a chave daquele termo. Um termo
-- de 1 caractere casa com quase todo doador da base.
--
-- Tres mudancas, todas de contencao:
--
--   1. p_limit / p_offset, com o teto imposto DENTRO da funcao (1..200). Quem
--      chama nao consegue pedir mais do que 200 linhas por chamada, entao o teto
--      nao depende do aplicativo estar correto.
--
--   2. Piso de comprimento do termo tambem aqui (3 caracteres, espelhando
--      DOADOR_REVERSE_MIN_QUERY_LENGTH em src/lib/doador-reverse-shared.ts).
--      Termo curto devolve zero linha em vez de varrer.
--
--   3. ORDER BY deterministico. A ordem antiga (ano, valor) empata com
--      frequencia, e empate sob OFFSET faz a mesma linha aparecer em duas
--      paginas ou em nenhuma. Mesma licao do `order("id")` do PR #65.
--
-- A assinatura de 1 argumento e removida no fim. Manter as duas seria pior do
-- que remover: uma delas continua sem teto e com EXECUTE concedido a anon.
-- O aplicativo tolera a ordem: enquanto esta migration nao roda, ele reconhece
-- o PGRST202 da assinatura nova, cai na antiga e corta as linhas no aplicativo.

CREATE OR REPLACE FUNCTION public.search_financiamento_by_doador_normalized(
  p_query text,
  p_limit integer,
  p_offset integer
)
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
  WITH bounds AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200) AS lim,
      GREATEST(COALESCE(p_offset, 0), 0) AS off
  ),
  trimmed AS (
    SELECT NULLIF(trim(COALESCE(p_query, '')), '') AS t
  ),
  q AS (
    SELECT public.normalize_for_search(trimmed.t) AS n
    FROM trimmed
    WHERE trimmed.t IS NOT NULL
      AND char_length(public.normalize_for_search(trimmed.t)) >= 3
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
  ORDER BY f.ano_eleicao DESC, d.valor DESC NULLS LAST, c.id, d.nome
  LIMIT (SELECT lim FROM bounds)
  OFFSET (SELECT off FROM bounds);
$$;

REVOKE ALL ON FUNCTION public.search_financiamento_by_doador_normalized(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_financiamento_by_doador_normalized(text, integer, integer) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.search_financiamento_by_doador_normalized(text);

COMMENT ON FUNCTION public.search_financiamento_by_doador_normalized(text, integer, integer) IS
  'Busca reversa por doador em financiamento_publico. Teto de 200 linhas e piso de 3 caracteres no termo, ambos impostos aqui e nao pelo chamador.';

COMMIT;
