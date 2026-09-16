BEGIN;

-- Contexto oficial do SQ quando a mesma pessoa tem mais de uma candidatura
-- financeira no mesmo ano. Nullable preserva todas as linhas legadas.
ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS cargo_candidatura TEXT;

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
  NULL::jsonb AS categorias_origem,
  f.cargo_candidatura
FROM public.financiamento AS f
WHERE public.is_public_candidate(f.candidato_id) AND f.despublicado_em IS NULL;

ALTER VIEW public.financiamento_publico SET (security_invoker = true);

GRANT SELECT (cargo_candidatura) ON TABLE public.financiamento TO anon, authenticated;
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;

COMMIT;
