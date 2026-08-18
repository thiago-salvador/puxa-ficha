-- Bloco 2 (review 2026-04-24) — hardening de policies/grants anon.
--
-- Problema fixado:
-- 1. `noticias_candidato` herdou policy permissiva `noticias_read USING (true)` criada em
--    20260331133453. A migration 20260403113000 adicionou uma policy restritiva
--    `"Leitura pública" USING (is_public_candidate(candidato_id))`, mas NÃO dropou a
--    legacy. PostgreSQL combina políticas PERMISSIVE com OR, então `true OR …` vale TRUE
--    e anon lê notícias ligadas a candidatos `publicavel=false`.
-- 2. `sancoes_administrativas` tem o mesmo padrão: migration 20260331031013 criou
--    `"Leitura publica"` (sem acento) com USING (true); 20260403113000 só dropou
--    `"Leitura pública"` (com acento) antes de recriar restritiva. A legacy sem acento
--    continua ativa e OR-combina anulando a restrição.
-- 3. Tabelas PII/operacionais (`alert_subscribers`, `alert_subscriptions`,
--    `candidate_changes`, `notification_log`, `quiz_result_short_links`) já tinham RLS
--    habilitado sem policy, então anon recebe [] hoje. Mas o GRANT default sobre o
--    schema public deixa a query ser aceita. Defesa em profundidade: revogar SELECT/ALL
--    direto de anon+authenticated para que o DB recuse a query no nível de permissão
--    (essas tabelas só devem ser acessadas via service role — todas as rotas em
--    src/app/api/alerts/** e src/lib/quiz-short-link-store.ts usam getServiceClient()).

BEGIN;

-- ---- 1. Legacy permissive policy em noticias_candidato ----
DROP POLICY IF EXISTS noticias_read ON public.noticias_candidato;

-- Reafirma a policy restritiva (idempotente; garante paridade mesmo se alguém dropou
-- manualmente no painel Supabase).
DROP POLICY IF EXISTS "Leitura pública" ON public.noticias_candidato;
CREATE POLICY "Leitura pública"
ON public.noticias_candidato
FOR SELECT
USING (public.is_public_candidate(candidato_id));

-- ---- 2. Legacy permissive policy em sancoes_administrativas (nome sem acento) ----
DROP POLICY IF EXISTS "Leitura publica" ON public.sancoes_administrativas;

-- Reafirma a policy restritiva por paridade.
DROP POLICY IF EXISTS "Leitura pública" ON public.sancoes_administrativas;
CREATE POLICY "Leitura pública"
ON public.sancoes_administrativas
FOR SELECT
USING (public.is_public_candidate(candidato_id));

-- ---- 3. Revogar grants diretos de anon/authenticated em tabelas PII/operacionais ----
REVOKE ALL ON public.alert_subscribers FROM anon, authenticated;
REVOKE ALL ON public.alert_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.candidate_changes FROM anon, authenticated;
REVOKE ALL ON public.notification_log FROM anon, authenticated;
REVOKE ALL ON public.quiz_result_short_links FROM anon, authenticated;

COMMIT;
