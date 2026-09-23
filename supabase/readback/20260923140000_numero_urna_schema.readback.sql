-- Readback is intentionally outside a transaction and never changes session role.
DO $readback$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'candidatos' AND column_name = 'numero_urna' AND data_type = 'text') THEN RAISE EXCEPTION 'readback numero_urna: coluna text ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'candidatos_numero_urna_estado_cargo_idx') THEN RAISE EXCEPTION 'readback numero_urna: indice ausente'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'candidatos_publico' AND column_name = 'numero_urna') THEN RAISE EXCEPTION 'readback numero_urna: view publica sem coluna'; END IF;
  IF NOT has_column_privilege('anon', 'public.candidatos', 'numero_urna', 'SELECT') OR NOT has_column_privilege('authenticated', 'public.candidatos', 'numero_urna', 'SELECT') THEN RAISE EXCEPTION 'readback numero_urna: grant de coluna ausente'; END IF;
  IF NOT has_table_privilege('anon', 'public.candidatos_publico', 'SELECT') OR NOT has_table_privilege('authenticated', 'public.candidatos_publico', 'SELECT') THEN RAISE EXCEPTION 'readback numero_urna: grant da view ausente'; END IF;
END
$readback$;

SELECT 'numero_urna readback ok' AS status;
