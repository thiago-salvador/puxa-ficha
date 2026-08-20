BEGIN;

-- /doadores: RPC deixa de ser executavel pelo anon key e deixa de varrer jsonb.
--
-- Tres furos medidos na search_financiamento_by_doador_normalized paginada:
--
--   1. EXECUTE para anon e authenticated. Quem tem a chave publica POST
--      /rest/v1/rpc/... e pula o limiter de IP em Next.js.
--   2. OFFSET sem teto. p_limit ja era 1..200; p_offset so tinha GREATEST 0.
--   3. Casamento por position(q IN normalize_for_search(d.nome)) depois de
--      jsonb_to_recordset em maiores_doadores. Nao usa indice.
--
-- Esta migration materializa o nome ja sanitizado (maiores_doadores_publicos,
-- nunca o JSON bruto), indexa com trigram GIN, reescreve a RPC para LIKE
-- indexavel, cap p_offset em 1000 (o app pede 0 e pagina 100; dez paginas e
-- folga, nao e OFFSET livre) e concede EXECUTE so a service_role.
--
-- SECURITY INVOKER: o Next chama com service_role, que ignora RLS. O SQL da
-- funcao ainda junta candidatos_publico e financiamento_publico, para linha
-- despublicada nao vazar se a tabela de busca estiver um pouco atrasada.
--
-- pg_trgm mora em extensions (20260601210500). search_path local cobre o
-- operator class gin_trgm_ops na criacao do indice.

SET LOCAL search_path = public, extensions;

CREATE TABLE public.financiamento_doador_search (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  financiamento_id uuid NOT NULL REFERENCES public.financiamento(id) ON DELETE CASCADE,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  ano_eleicao integer NOT NULL,
  valor numeric,
  tipo text NOT NULL DEFAULT '',
  doador_nome_exibicao text NOT NULL,
  nome_normalizado text NOT NULL
);

CREATE INDEX financiamento_doador_search_financiamento_idx
  ON public.financiamento_doador_search (financiamento_id);

CREATE INDEX financiamento_doador_search_candidato_idx
  ON public.financiamento_doador_search (candidato_id);

CREATE INDEX financiamento_doador_search_nome_trgm_idx
  ON public.financiamento_doador_search
  USING gin (nome_normalizado gin_trgm_ops);

COMMENT ON TABLE public.financiamento_doador_search IS
  'Indice de busca reversa por doador. Uma linha por nome de exibicao sanitizado (top 10 publico). Sem SELECT para anon/authenticated.';
COMMENT ON COLUMN public.financiamento_doador_search.nome_normalizado IS
  'public.normalize_for_search(doador_nome_exibicao). Busca por LIKE %termo% com gin_trgm_ops.';
COMMENT ON COLUMN public.financiamento_doador_search.doador_nome_exibicao IS
  'Nome ja sanitizado de maiores_doadores_publicos. Nao copia o JSON bruto nem documento.';

ALTER TABLE public.financiamento_doador_search ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financiamento_doador_search FROM PUBLIC;
REVOKE ALL ON TABLE public.financiamento_doador_search FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financiamento_doador_search TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_financiamento_doador_search(p_financiamento_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $refresh$
BEGIN
  -- @write tabela=financiamento_doador_search ref=doador-reverse-trgm campos=financiamento_id
  DELETE FROM public.financiamento_doador_search
  WHERE financiamento_id = p_financiamento_id
    AND 'doador-reverse-trgm' IS NOT NULL;

  -- @write tabela=financiamento_doador_search ref=doador-reverse-trgm campos=financiamento_id,candidato_id,ano_eleicao,valor,tipo,doador_nome_exibicao,nome_normalizado
  INSERT INTO public.financiamento_doador_search (
    financiamento_id,
    candidato_id,
    ano_eleicao,
    valor,
    tipo,
    doador_nome_exibicao,
    nome_normalizado
  )
  SELECT
    f.id,
    f.candidato_id,
    f.ano_eleicao,
    d.valor,
    COALESCE(d.tipo, ''),
    d.nome,
    public.normalize_for_search(d.nome)
  FROM public.financiamento f
  CROSS JOIN LATERAL jsonb_to_recordset(
    CASE
      WHEN f.maiores_doadores_publicos IS NOT NULL
           AND jsonb_typeof(f.maiores_doadores_publicos) = 'array'
      THEN f.maiores_doadores_publicos
      ELSE '[]'::jsonb
    END
  ) AS d(nome text, valor numeric, tipo text)
  WHERE f.id = p_financiamento_id
    AND f.despublicado_em IS NULL
    AND public.is_public_candidate(f.candidato_id)
    AND d.nome IS NOT NULL
    AND trim(d.nome) <> ''
    AND 'doador-reverse-trgm' IS NOT NULL;
END;
$refresh$;

REVOKE ALL ON FUNCTION public.refresh_financiamento_doador_search(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_financiamento_doador_search(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_financiamento_doador_search(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_financiamento_doador_search()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $sync$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  PERFORM public.refresh_financiamento_doador_search(NEW.id);
  RETURN NEW;
END;
$sync$;

REVOKE ALL ON FUNCTION public.sync_financiamento_doador_search() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_financiamento_doador_search() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_financiamento_doador_search() TO service_role;

DROP TRIGGER IF EXISTS sync_financiamento_doador_search ON public.financiamento;
CREATE TRIGGER sync_financiamento_doador_search
AFTER INSERT OR UPDATE OF
  maiores_doadores,
  maiores_doadores_publicos,
  candidato_id,
  ano_eleicao,
  despublicado_em
ON public.financiamento
FOR EACH ROW
EXECUTE FUNCTION public.sync_financiamento_doador_search();

CREATE OR REPLACE FUNCTION public.sync_financiamento_doador_search_candidato()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $cand$
DECLARE
  rec record;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.publicavel IS NOT DISTINCT FROM OLD.publicavel
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  FOR rec IN
    SELECT f.id
    FROM public.financiamento f
    WHERE f.candidato_id = NEW.id
  LOOP
    PERFORM public.refresh_financiamento_doador_search(rec.id);
  END LOOP;
  RETURN NEW;
END;
$cand$;

REVOKE ALL ON FUNCTION public.sync_financiamento_doador_search_candidato() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_financiamento_doador_search_candidato() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_financiamento_doador_search_candidato() TO service_role;

DROP TRIGGER IF EXISTS sync_financiamento_doador_search_candidato ON public.candidatos;
CREATE TRIGGER sync_financiamento_doador_search_candidato
AFTER UPDATE OF publicavel, status
ON public.candidatos
FOR EACH ROW
EXECUTE FUNCTION public.sync_financiamento_doador_search_candidato();

DO $backfill$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT f.id
    FROM public.financiamento f
    WHERE f.despublicado_em IS NULL
      AND public.is_public_candidate(f.candidato_id)
  LOOP
    PERFORM public.refresh_financiamento_doador_search(rec.id);
  END LOOP;
END
$backfill$;

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
SET search_path = public, extensions
AS $$
  WITH bounds AS (
    SELECT
      LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200) AS lim,
      LEAST(GREATEST(COALESCE(p_offset, 0), 0), 1000) AS off
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
    s.ano_eleicao,
    s.valor,
    COALESCE(s.tipo, ''),
    COALESCE(s.doador_nome_exibicao, '')
  FROM public.financiamento_doador_search s
  INNER JOIN public.candidatos_publico c ON c.id = s.candidato_id
  INNER JOIN public.financiamento_publico f ON f.id = s.financiamento_id
  CROSS JOIN q
  WHERE s.nome_normalizado LIKE '%' || q.n || '%'
  ORDER BY s.ano_eleicao DESC, s.valor DESC NULLS LAST, c.id, s.doador_nome_exibicao
  LIMIT (SELECT lim FROM bounds)
  OFFSET (SELECT off FROM bounds);
$$;

REVOKE ALL ON FUNCTION public.search_financiamento_by_doador_normalized(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_financiamento_by_doador_normalized(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_financiamento_by_doador_normalized(text, integer, integer) TO service_role;

DROP FUNCTION IF EXISTS public.search_financiamento_by_doador_normalized(text);

COMMENT ON FUNCTION public.search_financiamento_by_doador_normalized(text, integer, integer) IS
  'Busca reversa por doador. Server-only (EXECUTE so service_role): o anon key nao chama /rpc direto e o limiter de /doadores passa a valer. Teto de 200 linhas, offset no maximo 1000, piso de 3 caracteres. Casa nome_normalizado com LIKE trigram, nao jsonb + position(). Junta candidatos_publico e financiamento_publico mesmo com service_role, porque INVOKER ignora RLS.';

COMMIT;
