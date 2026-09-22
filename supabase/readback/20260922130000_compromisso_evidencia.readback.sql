-- Readback somente leitura de 20260922130000.
DO $readback$
BEGIN
  IF to_regclass('public.compromisso_evidencia') IS NULL THEN
    RAISE EXCEPTION 'readback: tabela compromisso_evidencia ausente';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.compromisso_evidencia'::regclass) THEN
    RAISE EXCEPTION 'readback: RLS inativa em compromisso_evidencia';
  END IF;
  IF has_table_privilege('anon', 'public.compromisso_evidencia', 'SELECT')
     OR has_any_column_privilege('anon', 'public.compromisso_evidencia', 'SELECT')
     OR has_table_privilege('authenticated', 'public.compromisso_evidencia', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.compromisso_evidencia', 'SELECT') THEN
    RAISE EXCEPTION 'readback: compromisso_evidencia legivel por papel publico';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'compromisso_evidencia') THEN
    RAISE EXCEPTION 'readback: policy inesperada em compromisso_evidencia';
  END IF;
  IF NOT (SELECT reloptions @> ARRAY['security_barrier=true', 'security_invoker=true']
          FROM pg_class WHERE oid = 'public.compromisso_evidencia_publica'::regclass) THEN
    RAISE EXCEPTION 'readback: view publica sem security_invoker/security_barrier';
  END IF;
  IF NOT has_table_privilege('anon', 'public.compromisso_evidencia_publica', 'SELECT') THEN
    RAISE EXCEPTION 'readback: view publica sem grant para anon';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.is_public_compromisso_evidencia(uuid)'::regprocedure) IS NOT TRUE THEN
    RAISE EXCEPTION 'readback: filtro da view precisa ser SECURITY DEFINER';
  END IF;
  IF pg_get_functiondef('public.is_public_compromisso_evidencia(uuid)'::regprocedure)
     !~ 'e\.verificado' THEN
    RAISE EXCEPTION 'readback: filtro da view nao exige verificado';
  END IF;
END
$readback$;
SELECT 'PASS readback 20260922130000 compromisso_evidencia' AS result;
