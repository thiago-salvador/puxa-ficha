-- Restore the column-level privileges required by the public security-invoker view.
-- The base table remains closed except for these explicitly published fields.
BEGIN;

GRANT SELECT (
  titular_sq_candidato,
  vice_sq_candidato,
  vice_situacao_divulgacand
) ON TABLE public.chapas_2026 TO anon, authenticated;

COMMIT;

-- Rollback (run only after the dependent public view is reverted):
-- REVOKE SELECT (
--   titular_sq_candidato,
--   vice_sq_candidato,
--   vice_situacao_divulgacand
-- ) ON TABLE public.chapas_2026 FROM anon, authenticated;
