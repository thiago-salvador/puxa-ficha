-- Restaura somente a policy anterior. Nenhuma linha de histórico é alterada.

DROP POLICY IF EXISTS "Leitura pública" ON public.historico_politico;
CREATE POLICY "Leitura pública"
ON public.historico_politico
FOR SELECT
USING (public.is_public_candidate(candidato_id));