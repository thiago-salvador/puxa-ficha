-- Estado verificavel por candidatura para pleitos sem linha em financiamento.
-- Esta migration cria somente o contrato. A carga reconciliada e separada.
ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS sq_candidato text,
  ADD COLUMN IF NOT EXISTS uf_candidatura text;

ALTER TABLE public.financiamento
  DROP CONSTRAINT IF EXISTS financiamento_uf_candidatura_check;
ALTER TABLE public.financiamento
  ADD CONSTRAINT financiamento_uf_candidatura_check
  CHECK (uf_candidatura IS NULL OR uf_candidatura ~ '^[A-Z]{2}$');

CREATE TABLE public.financiamento_verificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  ano_eleicao integer NOT NULL CHECK (ano_eleicao BETWEEN 1900 AND 2100),
  sq_candidato text,
  uf_candidatura text,
  resultado text NOT NULL CHECK (
    resultado IN ('ausencia_oficial', 'nao_coletado', 'erro')
  ),
  fonte_url text,
  verificado_em timestamptz,
  detalhe text,
  execucao text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidato_id, ano_eleicao),
  CHECK (uf_candidatura IS NULL OR uf_candidatura ~ '^[A-Z]{2}$'),
  CHECK (
    resultado <> 'ausencia_oficial'
    OR (
      sq_candidato IS NOT NULL
      AND uf_candidatura IS NOT NULL
      AND fonte_url IS NOT NULL
      AND verificado_em IS NOT NULL
    )
  ),
  CHECK (resultado <> 'erro' OR detalhe IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.financiamento_publicado_recusa_verificacao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.candidato_id::text || ':' || NEW.ano_eleicao::text, 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.financiamento_verificacoes
    WHERE candidato_id = NEW.candidato_id
      AND ano_eleicao = NEW.ano_eleicao
  ) THEN
    RAISE EXCEPTION
      'financiamento: pleito %/% ja possui verificacao sem dado publicado',
      NEW.candidato_id,
      NEW.ano_eleicao;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER financiamento_publicado_recusa_verificacao_trigger
BEFORE INSERT OR UPDATE OF candidato_id, ano_eleicao ON public.financiamento
FOR EACH ROW EXECUTE FUNCTION public.financiamento_publicado_recusa_verificacao();

CREATE OR REPLACE FUNCTION public.financiamento_verificacao_recusa_publicado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.candidato_id::text || ':' || NEW.ano_eleicao::text, 0)
  );
  IF EXISTS (
    SELECT 1
    FROM public.financiamento
    WHERE candidato_id = NEW.candidato_id
      AND ano_eleicao = NEW.ano_eleicao
  ) THEN
    RAISE EXCEPTION
      'financiamento_verificacoes: pleito %/% ja possui dado publicado',
      NEW.candidato_id,
      NEW.ano_eleicao;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER financiamento_verificacao_recusa_publicado_trigger
BEFORE INSERT OR UPDATE OF candidato_id, ano_eleicao ON public.financiamento_verificacoes
FOR EACH ROW EXECUTE FUNCTION public.financiamento_verificacao_recusa_publicado();

ALTER TABLE public.financiamento_verificacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.financiamento_verificacoes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financiamento_verificacoes TO service_role;

CREATE OR REPLACE VIEW public.financiamento_verificacoes_publico
WITH (security_invoker = true) AS
SELECT
  candidato_id,
  ano_eleicao,
  resultado,
  fonte_url,
  verificado_em,
  detalhe
FROM public.financiamento_verificacoes;

REVOKE ALL ON public.financiamento_verificacoes_publico FROM PUBLIC;
GRANT SELECT ON public.financiamento_verificacoes_publico TO service_role;

COMMENT ON TABLE public.financiamento_verificacoes IS
  'Desfecho por pleito sem linha financeira. Erro e nao coletado nunca afirmam ausencia.';
COMMENT ON VIEW public.financiamento_verificacoes_publico IS
  'Proveniencia publica para ausencia oficial, nao coletado e erro de financiamento.';
