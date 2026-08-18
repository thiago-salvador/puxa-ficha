-- Remove linha patrimonial antiga sem fonte final do perfil publico de Lula.
-- A linha 2002 vinha de mock_curado, sem bens detalhados e fora da coorte TSE suportada no seed.

BEGIN;

DELETE FROM public.patrimonio
WHERE id = 'cea8126e-16de-46fe-821e-b0f7ca4c5340'
  AND ano_eleicao = 2002
  AND fonte = 'mock_curado'
  AND COALESCE(jsonb_array_length(bens::jsonb), 0) = 0;

COMMIT;
