-- Conferência somente leitura depois do rollback da quarentena ampliada (20260925221042).
-- O script de rollback embute este texto na transação do rollback.
DO $readback$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260925221042') THEN
    RAISE EXCEPTION 'gastos-universo rollback readback: versão continua no ledger';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gastos_parlamentares WHERE despublicacao_motivo LIKE 'gastos-universo:%') THEN
    RAISE EXCEPTION 'gastos-universo rollback readback: sobrou marca da quarentena ampliada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.gastos_parlamentares
    WHERE despublicacao_motivo LIKE 'gastos-129:%' AND despublicado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'gastos-universo rollback readback: a quarentena anterior foi tocada';
  END IF;
END $readback$;
