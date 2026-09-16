-- Uma mesma pessoa pode ter mais de uma candidatura no mesmo ano.
-- A ausência/erro pertence ao contexto TSE (SQ + UF), não ao ano isolado.
ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT IF EXISTS financiamento_verificacoes_candidato_id_ano_eleicao_key;
ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT IF EXISTS financiamento_verificacoes_contexto_unique;

ALTER TABLE public.financiamento_verificacoes
  ADD COLUMN IF NOT EXISTS cargo_candidatura text;

ALTER TABLE public.financiamento_verificacoes
  ADD CONSTRAINT financiamento_verificacoes_contexto_unique
  UNIQUE NULLS NOT DISTINCT (candidato_id, ano_eleicao, sq_candidato, uf_candidatura);

-- CREATE OR REPLACE substitui também proconfig. Repetir o search_path vazio da
-- higiene 20260815190000 evita reabrir o alerta de search_path mutável.
CREATE OR REPLACE FUNCTION public.financiamento_publicado_recusa_verificacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.candidato_id::text || ':' || NEW.ano_eleicao::text || ':' ||
      coalesce(NEW.sq_candidato, '') || ':' || coalesce(NEW.uf_candidatura, ''), 0
    )
  );
  IF EXISTS (
    SELECT 1
    FROM public.financiamento_verificacoes
    WHERE candidato_id = NEW.candidato_id
      AND ano_eleicao = NEW.ano_eleicao
      AND sq_candidato IS NOT DISTINCT FROM NEW.sq_candidato
      AND uf_candidatura IS NOT DISTINCT FROM NEW.uf_candidatura
  ) THEN
    RAISE EXCEPTION
      'financiamento: contexto %/%/% ja possui verificacao sem dado publicado',
      NEW.candidato_id,
      NEW.ano_eleicao,
      NEW.sq_candidato;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.financiamento_verificacao_recusa_publicado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.candidato_id::text || ':' || NEW.ano_eleicao::text || ':' ||
      coalesce(NEW.sq_candidato, '') || ':' || coalesce(NEW.uf_candidatura, ''), 0
    )
  );
  IF EXISTS (
    SELECT 1
    FROM public.financiamento
    WHERE candidato_id = NEW.candidato_id
      AND ano_eleicao = NEW.ano_eleicao
      AND sq_candidato IS NOT DISTINCT FROM NEW.sq_candidato
      AND uf_candidatura IS NOT DISTINCT FROM NEW.uf_candidatura
  ) THEN
    RAISE EXCEPTION
      'financiamento_verificacoes: contexto %/%/% ja possui dado publicado',
      NEW.candidato_id,
      NEW.ano_eleicao,
      NEW.sq_candidato;
  END IF;
  RETURN NEW;
END
$$;

DROP VIEW IF EXISTS public.financiamento_verificacoes_publico;

CREATE VIEW public.financiamento_verificacoes_publico
WITH (security_invoker = true) AS
SELECT
  candidato_id,
  ano_eleicao,
  sq_candidato,
  uf_candidatura,
  cargo_candidatura,
  resultado,
  fonte_url,
  verificado_em,
  detalhe
FROM public.financiamento_verificacoes;

-- CREATE VIEW reaplica privilégios padrão do Supabase. Preservar o contrato
-- restrito da migração 20260810120500, inclusive em replay local do schema.
REVOKE ALL PRIVILEGES ON public.financiamento_verificacoes
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.financiamento_verificacoes TO service_role;
REVOKE ALL PRIVILEGES ON public.financiamento_verificacoes_publico
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.financiamento_verificacoes_publico TO service_role;

COMMENT ON TABLE public.financiamento_verificacoes IS
  'Desfecho por contexto TSE (candidato, ano, SQ e UF) sem linha financeira. Erro e nao coletado nunca afirmam ausencia.';
