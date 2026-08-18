-- Higiene mecânica dos advisors do Supabase, sem DML.
-- Mantém as trigger functions com resolução de nomes fechada e cobre as duas
-- FKs de chapas_2026 que ainda não tinham índice de apoio.

ALTER FUNCTION public.financiamento_publicado_recusa_verificacao()
  SET search_path = '';

ALTER FUNCTION public.financiamento_verificacao_recusa_publicado()
  SET search_path = '';

CREATE INDEX IF NOT EXISTS idx_chapas_2026_titular_candidato_id
  ON public.chapas_2026 (titular_candidato_id);

CREATE INDEX IF NOT EXISTS idx_chapas_2026_vice_candidato_id
  ON public.chapas_2026 (vice_candidato_id);

-- (c) EXECUTE na função de gate público para o papel read-only da Management
-- API (42501 medido em 15/08: policies de RLS que chamam a função derrubavam
-- qualquer SELECT do supabase_read_only_user nas tabelas filhas, o que quebrava
-- o snapshot local do audit:superficie). Aplicado em produção em 15/08; esta é
-- a forma replay-safe. O DO/IF existe porque o papel é gerenciado pelo Supabase
-- e não existe no Postgres de replay do CI.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_read_only_user') THEN
    GRANT EXECUTE ON FUNCTION public.is_public_candidate(uuid) TO supabase_read_only_user;
  END IF;
END $$;
