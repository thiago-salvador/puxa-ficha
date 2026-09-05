-- Somente leitura. Compara o conjunto publicável esperado com os dois papéis.
BEGIN;
DO $$
DECLARE tabela text; papel text; esperado text[]; obtido text[]; expostos bigint; p record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260905220000') THEN
    RAISE EXCEPTION 'publicacao: versão ausente no ledger';
  END IF;
  FOREACH tabela IN ARRAY ARRAY['mudancas_partido','patrimonio','pontos_atencao'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=tabela AND c.relrowsecurity) THEN
      RAISE EXCEPTION 'publicacao: RLS ausente em %', tabela;
    END IF;
    SELECT * INTO p FROM pg_policies WHERE schemaname='public' AND tablename=tabela
      AND policyname='publicacao_sem_despublicados';
    IF NOT FOUND OR p.permissive <> 'RESTRICTIVE' OR p.cmd <> 'SELECT'
      OR p.roles <> ARRAY['anon','authenticated']::name[] OR p.qual <> '(despublicado_em IS NULL)'
      OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=tabela AND cmd IN ('SELECT','ALL')) <> 2 THEN
      RAISE EXCEPTION 'publicacao: drift da barreira em %', tabela;
    END IF;
    EXECUTE format('SELECT coalesce(array_agg(id::text ORDER BY id::text), ARRAY[]::text[]) FROM public.%I WHERE despublicado_em IS NULL AND public.is_public_candidate(candidato_id)%s', tabela,
      CASE WHEN tabela='pontos_atencao' THEN ' AND public.is_public_attention_point(visivel,gerado_por,verificado,gravidade,fontes)' ELSE '' END) INTO esperado;
    FOREACH papel IN ARRAY ARRAY['anon','authenticated'] LOOP
      EXECUTE format('SET LOCAL ROLE %I', papel);
      EXECUTE format('SELECT count(*) FROM public.%I WHERE despublicado_em IS NOT NULL', tabela) INTO expostos;
      IF expostos <> 0 THEN RAISE EXCEPTION 'publicacao: despublicados expostos em % para %', tabela, papel; END IF;
      EXECUTE format('SELECT coalesce(array_agg(id::text ORDER BY id::text), ARRAY[]::text[]) FROM public.%I', tabela) INTO obtido;
      RESET ROLE;
      IF obtido <> esperado THEN RAISE EXCEPTION 'publicacao: conjunto público divergente em % para %', tabela, papel; END IF;
    END LOOP;
  END LOOP;
END $$;
ROLLBACK;
