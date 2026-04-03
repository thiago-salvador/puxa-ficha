BEGIN;

CREATE OR REPLACE FUNCTION public.is_public_candidate(target_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidatos c
    WHERE c.id = target_candidate_id
      AND c.publicavel = true
      AND c.status <> 'removido'
  );
$$;

DROP POLICY IF EXISTS "Leitura pública" ON public.candidatos;
CREATE POLICY "Leitura pública"
ON public.candidatos
FOR SELECT
USING (publicavel = true AND status <> 'removido');

DROP POLICY IF EXISTS "Leitura pública" ON public.historico_politico;
CREATE POLICY "Leitura pública"
ON public.historico_politico
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.mudancas_partido;
CREATE POLICY "Leitura pública"
ON public.mudancas_partido
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.patrimonio;
CREATE POLICY "Leitura pública"
ON public.patrimonio
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.financiamento;
CREATE POLICY "Leitura pública"
ON public.financiamento
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.votos_candidato;
CREATE POLICY "Leitura pública"
ON public.votos_candidato
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.projetos_lei;
CREATE POLICY "Leitura pública"
ON public.projetos_lei
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.processos;
CREATE POLICY "Leitura pública"
ON public.processos
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.pontos_atencao;
CREATE POLICY "Leitura pública"
ON public.pontos_atencao
FOR SELECT
USING (visivel = true AND public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.gastos_parlamentares;
CREATE POLICY "Leitura pública"
ON public.gastos_parlamentares
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.sancoes_administrativas;
CREATE POLICY "Leitura pública"
ON public.sancoes_administrativas
FOR SELECT
USING (public.is_public_candidate(candidato_id));

DROP POLICY IF EXISTS "Leitura pública" ON public.noticias_candidato;
CREATE POLICY "Leitura pública"
ON public.noticias_candidato
FOR SELECT
USING (public.is_public_candidate(candidato_id));

GRANT SELECT
ON public.historico_politico,
   public.mudancas_partido,
   public.patrimonio,
   public.financiamento,
   public.votacoes_chave,
   public.votos_candidato,
   public.projetos_lei,
   public.processos,
   public.pontos_atencao,
   public.gastos_parlamentares,
   public.sancoes_administrativas,
   public.indicadores_estaduais,
   public.noticias_candidato
TO anon, authenticated;

DELETE FROM public.projetos_lei a
USING public.projetos_lei b
WHERE a.ctid < b.ctid
  AND a.candidato_id = b.candidato_id
  AND a.proposicao_id_api = b.proposicao_id_api
  AND a.proposicao_id_api IS NOT NULL;

ALTER TABLE public.projetos_lei
DROP CONSTRAINT IF EXISTS uq_projetos_lei_candidato_proposicao;

ALTER TABLE public.projetos_lei
ADD CONSTRAINT uq_projetos_lei_candidato_proposicao
UNIQUE (candidato_id, proposicao_id_api);

DELETE FROM public.mudancas_partido a
USING public.mudancas_partido b
WHERE a.ctid < b.ctid
  AND a.candidato_id = b.candidato_id
  AND a.ano IS NOT DISTINCT FROM b.ano
  AND a.partido_novo = b.partido_novo;

ALTER TABLE public.mudancas_partido
DROP CONSTRAINT IF EXISTS uq_mudancas_partido_candidato_ano_partido;

ALTER TABLE public.mudancas_partido
ADD CONSTRAINT uq_mudancas_partido_candidato_ano_partido
UNIQUE NULLS NOT DISTINCT (candidato_id, ano, partido_novo);

COMMIT;
