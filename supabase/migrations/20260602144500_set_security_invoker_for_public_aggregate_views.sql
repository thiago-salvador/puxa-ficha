-- Ponto 4 pos-Etapa 11: only the aggregate public views whose base relations
-- already have anon/authenticated SELECT under RLS are moved to invoker mode.
ALTER VIEW public.v_ficha_candidato SET (security_invoker = true);
ALTER VIEW public.v_comparador SET (security_invoker = true);
