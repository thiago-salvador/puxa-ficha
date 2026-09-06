BEGIN READ ONLY;
SET LOCAL search_path = public, pg_catalog;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.chapas_2026_publico'::regclass AND reloptions @> ARRAY['security_invoker=true'])
    -- Canonical PostgreSQL 17 deparse, measured against the forward migration.
    OR md5(pg_get_viewdef('public.chapas_2026_publico'::regclass,true)) IS DISTINCT FROM '4663ede97a407bb1b950930b18876741'
    OR NOT has_table_privilege('anon','public.chapas_2026_publico','SELECT')
    OR NOT has_table_privilege('authenticated','public.chapas_2026_publico','SELECT') THEN
    RAISE EXCEPTION 'freshness-closeout: public chapa view boundary drift';
  END IF;
  IF EXISTS (SELECT chave FROM public.chapas_2026_publico EXCEPT SELECT ch.chave FROM public.chapas_2026 ch JOIN public.candidatos_publico c ON c.id=ch.titular_candidato_id WHERE ch.identidade_status='confirmada')
    OR EXISTS (SELECT ch.chave FROM public.chapas_2026 ch JOIN public.candidatos_publico c ON c.id=ch.titular_candidato_id WHERE ch.identidade_status='confirmada' EXCEPT SELECT chave FROM public.chapas_2026_publico) THEN
    RAISE EXCEPTION 'freshness-closeout: public chapa set differs from public titular set';
  END IF;
END $$;
SELECT set_config('pf.freshness_chapas_expected', COALESCE(md5(string_agg(chave, ',' ORDER BY chave)), 'empty'), true) FROM public.chapas_2026_publico;
SET LOCAL ROLE anon;
DO $$ BEGIN
  PERFORM to_jsonb(ch) FROM public.chapas_2026_publico ch;
  IF (SELECT COALESCE(md5(string_agg(chave, ',' ORDER BY chave)), 'empty') FROM public.chapas_2026_publico) IS DISTINCT FROM current_setting('pf.freshness_chapas_expected') THEN
    RAISE EXCEPTION 'freshness-closeout: anon chapa access differs';
  END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM to_jsonb(ch) FROM public.chapas_2026_publico ch;
  IF (SELECT COALESCE(md5(string_agg(chave, ',' ORDER BY chave)), 'empty') FROM public.chapas_2026_publico) IS DISTINCT FROM current_setting('pf.freshness_chapas_expected') THEN
    RAISE EXCEPTION 'freshness-closeout: authenticated chapa access differs';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
