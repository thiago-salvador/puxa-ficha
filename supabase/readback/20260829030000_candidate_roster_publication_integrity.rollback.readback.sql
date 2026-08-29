DO $$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version IN ('20260829030000','20260829030001')) <> 0 THEN
    RAISE EXCEPTION 'readback rollback roster: ledger ainda contém as duas versões';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='chapas_2026_publico' AND relkind='v') THEN
    RAISE EXCEPTION 'readback rollback roster: view pública ausente';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='candidatos_publicacao_minima_2026_check') THEN
    RAISE EXCEPTION 'readback rollback roster: constraint ainda presente';
  END IF;
END $$;
