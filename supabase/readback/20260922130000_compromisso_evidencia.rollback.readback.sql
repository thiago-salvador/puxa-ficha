-- Readback somente leitura depois do rollback de 20260922130000.
DO $readback$
BEGIN
  IF to_regclass('public.compromisso_evidencia') IS NOT NULL
     OR to_regclass('public.compromisso_evidencia_publica') IS NOT NULL
     OR to_regprocedure('public.is_public_compromisso_evidencia(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'rollback readback: objeto de compromisso_evidencia ainda existe';
  END IF;
END
$readback$;
SELECT 'PASS rollback readback 20260922130000 compromisso_evidencia' AS result;
