BEGIN;

-- Expose the reconciled category totals already stored on financiamento.
-- This changes only the public projection; it does not write candidate rows.
-- The earlier A2 migration is retained and can fail during a blank replay, so
-- this schema step must stand on its own and be idempotent.
ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS categorias_origem jsonb;

-- Server-computed CAS tokens keep private donor JSON and category JSON out of URLs.
ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS maiores_doadores_hash text
  GENERATED ALWAYS AS (md5(COALESCE(maiores_doadores::text, 'sql-null:'))) STORED;
ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS categorias_origem_hash text
  GENERATED ALWAYS AS (md5(COALESCE(categorias_origem::text, 'sql-null:'))) STORED;

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
  f.maiores_doadores_publicos AS maiores_doadores,
  f.fonte,
  f.created_at,
  f.categorias_origem,
  f.cargo_candidatura
FROM public.financiamento AS f
WHERE public.is_public_candidate(f.candidato_id) AND f.despublicado_em IS NULL;

ALTER VIEW public.financiamento_publico SET (security_invoker = true);

-- A security-invoker view also requires column-level access on its base table.
GRANT SELECT (categorias_origem) ON TABLE public.financiamento TO anon, authenticated;
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;

COMMIT;
