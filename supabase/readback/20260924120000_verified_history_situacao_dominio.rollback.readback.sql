BEGIN READ ONLY;
-- Depois do rollback a RPC volta à lista de sete situações de 20260908160000:
-- 'pendente de julgamento' volta a ser rejeitado, e o resto continua aceito.
DO $readback$
DECLARE
  fn constant regprocedure := 'public.observe_verified_candidate_change(uuid,text,integer,text,text,text)'::regprocedure;
  ausente constant uuid := '00000000-0000-4000-8000-00000000c0de';
  fonte constant text := 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand_complementar/consulta_cand_complementar_2026.zip';
  valor text;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260924120000') THEN
    RAISE EXCEPTION 'verified history situacao rollback: ledger row remains';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = fn AND prosecdef AND proconfig = ARRAY['search_path=pg_catalog, public']
  ) OR has_function_privilege('public', fn, 'EXECUTE')
    OR has_function_privilege('anon', fn, 'EXECUTE')
    OR has_function_privilege('authenticated', fn, 'EXECUTE')
    OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'verified history situacao rollback: function security drifted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidatos WHERE id = ausente) THEN
    RAISE EXCEPTION 'verified history situacao rollback: probe candidate id exists';
  END IF;
  FOREACH valor IN ARRAY ARRAY['aguardando julgamento', 'deferido', 'indeferido com recurso'] LOOP
    BEGIN
      PERFORM public.observe_verified_candidate_change(ausente, 'situacao', 2026, valor, fonte, 'readback:situacao');
      RAISE EXCEPTION 'verified history situacao rollback: probe call for % returned without stopping', valor;
    EXCEPTION
      WHEN foreign_key_violation OR read_only_sql_transaction THEN NULL;
      WHEN invalid_parameter_value THEN
        RAISE EXCEPTION 'verified history situacao rollback: % rejected', valor;
    END;
  END LOOP;
  BEGIN
    PERFORM public.observe_verified_candidate_change(ausente, 'situacao', 2026, 'pendente de julgamento', fonte, 'readback:situacao');
    RAISE EXCEPTION 'verified history situacao rollback: pendente de julgamento still accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END
$readback$;
SELECT 'verified history situacao rollback readback ok' AS status;
COMMIT;
