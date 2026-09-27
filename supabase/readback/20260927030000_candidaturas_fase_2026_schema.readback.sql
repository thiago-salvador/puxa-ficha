BEGIN READ ONLY;
DO $readback$
BEGIN
  IF to_regclass('public.candidaturas_fase_2026') IS NULL THEN
    RAISE EXCEPTION 'fase-2026 readback: tabela ausente';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'candidaturas_fase_2026'
         AND column_name IN ('candidato_id','sq_candidato_2026','cargo_disputado','fase_eleitoral','fase_turno',
                             'atualizacao_encerrada_em','situacao_tse','fonte_url','fonte_sha256','migration_version','registrado_em')) <> 11 THEN
    RAISE EXCEPTION 'fase-2026 readback: colunas divergem';
  END IF;
  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.candidaturas_fase_2026'::regclass AND contype = 'c'
         AND conname IN ('candidaturas_fase_2026_em_disputa_sem_encerramento','candidaturas_fase_2026_fora_encerra',
                         'candidaturas_fase_2026_eleito_encerra','candidaturas_fase_2026_segundo_turno_executivo',
                         'candidaturas_fase_2026_senado_primeiro_turno')) <> 5 THEN
    RAISE EXCEPTION 'fase-2026 readback: CHECK de consistência ausente';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.candidaturas_fase_2026'::regclass) THEN
    RAISE EXCEPTION 'fase-2026 readback: RLS desligada';
  END IF;
  IF has_column_privilege('anon', 'public.candidaturas_fase_2026', 'fonte_url', 'SELECT')
     OR has_table_privilege('anon', 'public.candidaturas_fase_2026', 'INSERT')
     OR has_table_privilege('anon', 'public.candidaturas_fase_2026', 'UPDATE')
     OR NOT has_column_privilege('anon', 'public.candidaturas_fase_2026', 'atualizacao_encerrada_em', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.candidaturas_fase_2026', 'fase_eleitoral', 'SELECT') THEN
    RAISE EXCEPTION 'fase-2026 readback: grants divergem';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.candidaturas_fase_2026_publico'::regclass
                   AND reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'fase-2026 readback: view pública ausente ou sem security_invoker';
  END IF;
  IF NOT has_table_privilege('anon', 'public.candidaturas_fase_2026_publico', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.candidaturas_fase_2026_publico', 'SELECT') THEN
    RAISE EXCEPTION 'fase-2026 readback: grant da view ausente';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'candidaturas_fase_2026_publico') <> 6 THEN
    RAISE EXCEPTION 'fase-2026 readback: view pública com colunas divergentes';
  END IF;
END
$readback$;
COMMIT;
