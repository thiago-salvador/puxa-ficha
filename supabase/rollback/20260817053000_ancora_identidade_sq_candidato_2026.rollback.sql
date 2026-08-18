-- Rollback de 20260817053000_ancora_identidade_sq_candidato_2026.
--
-- ATENÇÃO: derrubar a coluna APAGA a âncora de identidade de todas as fichas.
-- O dado é recuperável, porque o sequencial vem do pacote oficial do TSE e o
-- script de backfill o relê da fonte, mas até ele rodar de novo a base volta a
-- não saber qual candidatura é cada ficha, que é exatamente o estado que
-- produziu os dez CPF de terceiro.
--
-- Prefira derrubar só as restrições, se o problema for uma delas.

BEGIN;

DROP INDEX IF EXISTS public.candidatos_sq_candidato_2026_unico;

ALTER TABLE public.candidatos
  DROP CONSTRAINT IF EXISTS candidatos_sq_candidato_2026_formato;

-- Descomente apenas se a intenção for mesmo apagar os valores.
-- ALTER TABLE public.candidatos DROP COLUMN IF EXISTS sq_candidato_2026;

COMMIT;
