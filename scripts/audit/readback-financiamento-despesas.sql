-- Readback da migration 20260929100000 (despesas de campanha).
--
-- Roda dentro da transação do apply, antes do COMMIT, e de novo sozinho em
-- modo somente leitura. Por isso não abre nem fecha transação. A troca de
-- papel acontece dentro do bloco DO (SET LOCAL ROLE, desfeito por RESET ROLE
-- no fim do bloco): vale nos dois modos e não vaza para o resto do apply.
-- Escrita real como anon fica na prova PG17; aqui a transação pode ser
-- somente leitura, então DML é conferido por função.
DO $readback$
DECLARE
  v_publicas text[] := ARRAY[
    'id', 'candidato_id', 'ano_eleicao', 'sq_candidato', 'uf', 'municipio_codigo',
    'cargo_candidatura', 'estado_coleta', 'total_despesas_contratadas',
    'total_despesas_pagas', 'total_doacoes_a_terceiros', 'recursos_financeiros',
    'recursos_estimaveis', 'divida_campanha', 'sobra_financeira',
    'concentracao_despesas', 'maiores_fornecedores', 'doacoes_a_terceiros',
    'prestacao_parcial', 'data_entrega', 'fonte', 'fonte_url', 'coletado_em'
  ];
  v_privadas text[] := ARRAY['id_ultima_entrega', 'tipo_entrega', 'created_at', 'updated_at'];
  v_papel text;
  v_coluna text;
  v_privilegio text;
  v_relacao text;
  v_colunas_view text;
  v_documento integer;
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version = '20260929100000') <> 1 THEN
    RAISE EXCEPTION 'readback 20260929100000: versao ausente ou duplicada no ledger';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.financiamento_despesas_publico'::regclass
       AND coalesce(reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION 'readback 20260929100000: view publica nao e security_invoker';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.financiamento_despesas'::regclass) THEN
    RAISE EXCEPTION 'readback 20260929100000: tabela sem RLS';
  END IF;

  IF pg_get_viewdef('public.financiamento_despesas_publico'::regclass, true) NOT ILIKE '%despublicado_em IS NULL%'
     OR pg_get_viewdef('public.financiamento_despesas_publico'::regclass, true) NOT ILIKE '%is_public_candidate%' THEN
    RAISE EXCEPTION 'readback 20260929100000: filtro da view divergiu';
  END IF;

  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_colunas_view
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'financiamento_despesas_publico';
  IF v_colunas_view IS DISTINCT FROM array_to_string(v_publicas, ',') THEN
    RAISE EXCEPTION 'readback 20260929100000: colunas da view divergiram: %', v_colunas_view;
  END IF;

  SELECT count(*) INTO v_documento
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('financiamento_despesas', 'financiamento_despesas_publico')
     AND (column_name ILIKE '%cpf%' OR column_name ILIKE '%cnpj%'
          OR column_name ILIKE '%hash%' OR column_name ILIKE '%documento%');
  IF v_documento > 0 THEN
    RAISE EXCEPTION 'readback 20260929100000: coluna de documento na superficie publica';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.financiamento_despesas'::regclass
       AND conname = 'financiamento_despesas_jsonb_sem_documento_check'
  ) THEN
    RAISE EXCEPTION 'readback 20260929100000: CHECK de documento nos JSONB ausente';
  END IF;

  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_coluna IN ARRAY v_publicas || ARRAY['despublicado_em'] LOOP
      IF NOT has_column_privilege(v_papel, 'public.financiamento_despesas', v_coluna, 'SELECT') THEN
        RAISE EXCEPTION 'readback 20260929100000: % sem SELECT na coluna %', v_papel, v_coluna;
      END IF;
    END LOOP;
    FOREACH v_coluna IN ARRAY v_privadas LOOP
      IF has_column_privilege(v_papel, 'public.financiamento_despesas', v_coluna, 'SELECT') THEN
        RAISE EXCEPTION 'readback 20260929100000: % com SELECT na coluna privada %', v_papel, v_coluna;
      END IF;
    END LOOP;
    IF has_table_privilege(v_papel, 'public.financiamento_despesas', 'SELECT') THEN
      RAISE EXCEPTION 'readback 20260929100000: % com SELECT de tabela inteira', v_papel;
    END IF;
    IF NOT has_table_privilege(v_papel, 'public.financiamento_despesas_publico', 'SELECT') THEN
      RAISE EXCEPTION 'readback 20260929100000: % sem SELECT na view publica', v_papel;
    END IF;
    FOREACH v_relacao IN ARRAY ARRAY['public.financiamento_despesas', 'public.financiamento_despesas_publico'] LOOP
      FOREACH v_privilegio IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_papel, v_relacao, v_privilegio) THEN
          RAISE EXCEPTION 'readback 20260929100000: % com % em %', v_papel, v_privilegio, v_relacao;
        END IF;
      END LOOP;
      FOREACH v_privilegio IN ARRAY ARRAY['INSERT', 'UPDATE', 'REFERENCES'] LOOP
        IF has_any_column_privilege(v_papel, v_relacao, v_privilegio) THEN
          RAISE EXCEPTION 'readback 20260929100000: % com % de coluna em %', v_papel, v_privilegio, v_relacao;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$readback$;

DO $readback_anon$
BEGIN
  SET LOCAL ROLE anon;

  -- A view e a tabela base pelas colunas concedidas precisam responder.
  PERFORM id, candidato_id, ano_eleicao, sq_candidato, uf, municipio_codigo,
          cargo_candidatura, estado_coleta, total_despesas_contratadas,
          total_despesas_pagas, total_doacoes_a_terceiros, recursos_financeiros,
          recursos_estimaveis, divida_campanha, sobra_financeira,
          concentracao_despesas, maiores_fornecedores, doacoes_a_terceiros,
          prestacao_parcial, data_entrega, fonte, fonte_url, coletado_em
     FROM public.financiamento_despesas_publico
    LIMIT 1;
  PERFORM id, candidato_id, ano_eleicao, sq_candidato, estado_coleta, despublicado_em
     FROM public.financiamento_despesas
    LIMIT 1;

  -- Coluna operacional sem grant: select=* e leitura direta negados.
  BEGIN
    PERFORM updated_at FROM public.financiamento_despesas LIMIT 1;
    RAISE EXCEPTION 'readback 20260929100000: anon leu updated_at';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM id_ultima_entrega FROM public.financiamento_despesas LIMIT 1;
    RAISE EXCEPTION 'readback 20260929100000: anon leu id_ultima_entrega';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM * FROM public.financiamento_despesas LIMIT 1;
    RAISE EXCEPTION 'readback 20260929100000: anon leu select * da tabela base';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RESET ROLE;
END
$readback_anon$;
