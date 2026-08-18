-- Impede que linhas de trajetória em quarentena sejam lidas diretamente pela
-- API pública do banco. A aplicação já filtrava `despublicado_em`, mas a policy
-- anterior protegia apenas a publicação do candidato e ainda deixava a linha
-- despublicada acessível a `anon` e `authenticated` via PostgREST.

ALTER TABLE public.historico_politico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública" ON public.historico_politico;
CREATE POLICY "Leitura pública"
ON public.historico_politico
FOR SELECT
USING (
  public.is_public_candidate(candidato_id)
  AND despublicado_em IS NULL
);