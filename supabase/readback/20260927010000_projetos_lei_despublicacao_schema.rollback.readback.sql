BEGIN READ ONLY;
DO $readback$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'projetos_lei'
               AND column_name IN ('despublicado_em', 'despublicacao_motivo'))
     OR EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_projetos_lei_despublicado')
     OR NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = 'projetos_lei'
                      AND policyname = 'Leitura pública' AND qual = 'is_public_candidate(candidato_id)')
     OR EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'identidade_timeline_quarentena_snapshot_tabela_check'
                  AND pg_get_constraintdef(oid) LIKE '%projetos_lei%')
     OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260927010000') THEN
    RAISE EXCEPTION 'projetos-lei-despublicacao rollback readback: schema ou ledger nao voltaram';
  END IF;
END
$readback$;
COMMIT;
