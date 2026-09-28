-- Remove apenas a coluna gerada por 20260927095347.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('puxa-ficha:production-db-migrations', 0));
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.patrimonio IN SHARE ROW EXCLUSIVE MODE;
DO $guard$
BEGIN
  IF (SELECT max(version) FROM supabase_migrations.schema_migrations) IS DISTINCT FROM '20260927095347' THEN
    RAISE EXCEPTION 'patrimonio CAS rollback: ledger divergiu';
  END IF;
END
$guard$;
ALTER TABLE public.patrimonio DROP COLUMN bens_hash RESTRICT;
REVOKE SELECT (
  id, candidato_id, ano_eleicao, valor_total, bens, fonte, created_at,
  despublicacao_motivo, despublicado_em, ano_arquivo, sq_candidato,
  uf_candidatura, cargo_candidatura, data_eleicao, tipo_eleicao
) ON TABLE public.patrimonio FROM anon, authenticated;
GRANT SELECT ON TABLE public.patrimonio TO anon, authenticated;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260927095347';
COMMIT;
