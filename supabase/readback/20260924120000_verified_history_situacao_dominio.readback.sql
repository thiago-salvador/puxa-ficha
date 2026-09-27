BEGIN READ ONLY;
-- Prova, sem gravar nada, que a RPC aceita todo o domínio vigente de
-- situacao_candidatura e continua rejeitando valor fora dele. As chamadas usam
-- um candidato inexistente: um valor aceito passa da validação e para depois,
-- na FK (dentro da transação do apply) ou na guarda de transação somente
-- leitura (readback avulso). Um valor rejeitado para antes, com 22023.
DO $readback$
DECLARE
  fn constant regprocedure := 'public.observe_verified_candidate_change(uuid,text,integer,text,text,text)'::regprocedure;
  esperado constant text[] := ARRAY[
    'aguardando julgamento',
    'candidatura declarada',
    'incerto',
    'deferido',
    'deferido com recurso',
    'indeferido',
    'indeferido com recurso',
    'pendente de julgamento'
  ];
  ausente constant uuid := '00000000-0000-4000-8000-00000000c0de';
  fonte constant text := 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip';
  dominio text[];
  valor text;
  mensagem text;
  role_name text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = fn AND prosecdef AND provolatile = 'v'
      AND proconfig = ARRAY['search_path=pg_catalog, public']
  ) THEN
    RAISE EXCEPTION 'verified history situacao: function security drifted';
  END IF;
  IF has_function_privilege('public', fn, 'EXECUTE') OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'verified history situacao: function privilege drifted';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(role_name, fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'verified history situacao: % can execute the collector RPC', role_name;
    END IF;
  END LOOP;

  -- O domínio lido do CHECK vivo, não de uma cópia.
  SELECT array_agg(t.m[1] ORDER BY t.ord) INTO dominio
  FROM pg_constraint c,
    regexp_matches(pg_get_constraintdef(c.oid), '''([^'']*)''::text', 'g') WITH ORDINALITY AS t(m, ord)
  WHERE c.conrelid = 'public.candidatos'::regclass
    AND c.conname = 'candidatos_situacao_candidatura_dominio';
  IF dominio IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'verified history situacao: candidatos domain differs from the RPC list: %', dominio;
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE id = ausente) THEN
    RAISE EXCEPTION 'verified history situacao: probe candidate id exists';
  END IF;

  FOREACH valor IN ARRAY dominio || ARRAY['Pendente de Julgamento', '  pendente de julgamento  '] LOOP
    BEGIN
      PERFORM public.observe_verified_candidate_change(ausente, 'situacao', 2026, valor, fonte, 'readback:situacao');
      RAISE EXCEPTION 'verified history situacao: probe call for % returned without stopping', valor;
    EXCEPTION
      WHEN foreign_key_violation OR read_only_sql_transaction THEN NULL;
      WHEN invalid_parameter_value THEN
        RAISE EXCEPTION 'verified history situacao: % still rejected', valor;
    END;
  END LOOP;

  FOREACH valor IN ARRAY ARRAY['renuncia', 'cancelado', 'falecido', 'cassado', 'apto', 'pendente'] LOOP
    BEGIN
      PERFORM public.observe_verified_candidate_change(ausente, 'situacao', 2026, valor, fonte, 'readback:situacao');
      RAISE EXCEPTION 'verified history situacao: % accepted', valor;
    EXCEPTION
      WHEN invalid_parameter_value THEN
        GET STACKED DIAGNOSTICS mensagem = MESSAGE_TEXT;
        IF mensagem <> 'Invalid verified registration status' THEN
          RAISE EXCEPTION 'verified history situacao: % rejected by the wrong rule: %', valor, mensagem;
        END IF;
    END;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.verified_candidate_observations WHERE candidate_id = ausente OR source_identity = 'readback:situacao')
    OR EXISTS (SELECT 1 FROM public.verified_candidate_updates WHERE candidate_id = ausente OR source_identity = 'readback:situacao') THEN
    RAISE EXCEPTION 'verified history situacao: probe left rows behind';
  END IF;
END
$readback$;
SELECT 'verified history situacao readback ok' AS status;
COMMIT;
