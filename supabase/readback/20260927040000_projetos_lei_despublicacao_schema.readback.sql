BEGIN READ ONLY;
DO $readback$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'projetos_lei'
         AND ((column_name = 'despublicado_em' AND data_type = 'timestamp with time zone')
           OR (column_name = 'despublicacao_motivo' AND data_type = 'text'))) <> 2 THEN
    RAISE EXCEPTION 'projetos-lei-despublicacao readback: colunas ausentes ou com tipo inesperado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projetos_lei'
      AND policyname = 'Leitura pública' AND cmd = 'SELECT'
      AND qual = '(is_public_candidate(candidato_id) AND (despublicado_em IS NULL))'
  ) OR (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'projetos_lei' AND cmd IN ('SELECT', 'ALL')) <> 1 THEN
    RAISE EXCEPTION 'projetos-lei-despublicacao readback: politica publica nao filtra despublicadas';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname = 'public' AND tablename = 'projetos_lei'
                   AND indexname = 'idx_projetos_lei_despublicado'
                   AND indexdef LIKE '%WHERE (despublicado_em IS NOT NULL)%') THEN
    RAISE EXCEPTION 'projetos-lei-despublicacao readback: indice parcial ausente';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'identidade_timeline_quarentena_snapshot_tabela_check'
                   AND conrelid = 'public.identidade_timeline_quarentena_snapshot'::regclass
                   AND pg_get_constraintdef(oid) LIKE '%projetos_lei%'
                   AND pg_get_constraintdef(oid) LIKE '%chapas_2026%') THEN
    RAISE EXCEPTION 'projetos-lei-despublicacao readback: snapshot nao aceita projetos_lei';
  END IF;
END
$readback$;
COMMIT;
