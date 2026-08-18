-- A tabela nasceu (20260807181000) sem RLS: qualquer cliente `anon` lia as
-- linhas inteiras via PostgREST, incluindo candidato_id e sq_candidato de
-- candidatos fora da superfície pública. Espelha o padrão de
-- 20260813040200_harden_historico_politico_publico_rls.sql: leitura pública
-- somente para candidato público; escrita continua restrita à service role.

ALTER TABLE public.patrimonio_ausencia_oficial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública" ON public.patrimonio_ausencia_oficial;
CREATE POLICY "Leitura pública"
ON public.patrimonio_ausencia_oficial
FOR SELECT
USING (
  public.is_public_candidate(candidato_id)
);
