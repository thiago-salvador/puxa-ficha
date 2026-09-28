-- Restaura a projeção anterior de financiamento_publico e os grants da tabela base.
-- RESTRICT impede remover colunas que passaram a ter novos dependentes.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.financiamento IN SHARE ROW EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260927095346' THEN
    RAISE EXCEPTION 'financiamento categorias rollback: ledger divergiu';
  END IF;
  IF EXISTS (SELECT 1 FROM public.financiamento WHERE categorias_origem IS NOT NULL) THEN
    RAISE EXCEPTION 'financiamento categorias rollback: há categorias preenchidas; preservar dados antes de reverter';
  END IF;
END
$guard$;

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
REVOKE SELECT (categorias_origem) ON TABLE public.financiamento FROM anon, authenticated;
GRANT SELECT ON public.financiamento_publico TO anon, authenticated;
ALTER TABLE public.financiamento
  DROP COLUMN categorias_origem_hash RESTRICT,
  DROP COLUMN maiores_doadores_hash RESTRICT,
  DROP COLUMN categorias_origem RESTRICT;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927095346';
COMMIT;
