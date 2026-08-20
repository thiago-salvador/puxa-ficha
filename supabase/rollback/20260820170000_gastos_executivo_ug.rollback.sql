-- Volta o grão órgão-mês. Com várias UGs no mesmo mês a unique antiga não
-- aplica: esvazie ou colapse a tabela antes.

ALTER TABLE public.gastos_executivo
  DROP CONSTRAINT IF EXISTS gastos_executivo_candidato_orgao_ug_mes_unique;

DROP INDEX IF EXISTS public.gastos_executivo_candidato_orgao_mes_idx;

ALTER TABLE public.gastos_executivo
  DROP COLUMN IF EXISTS qtd_portador_sigiloso,
  DROP COLUMN IF EXISTS qtd_portador_nominado,
  DROP COLUMN IF EXISTS qtd_portador_ausente,
  DROP COLUMN IF EXISTS qtd_estabelecimento_sigiloso,
  DROP COLUMN IF EXISTS qtd_estabelecimento_nominado,
  DROP COLUMN IF EXISTS qtd_estabelecimento_ausente,
  DROP COLUMN IF EXISTS ug_codigo,
  DROP COLUMN IF EXISTS ug_nome;

ALTER TABLE public.gastos_executivo
  DROP CONSTRAINT IF EXISTS gastos_executivo_candidato_orgao_mes_unique;

ALTER TABLE public.gastos_executivo
  ADD CONSTRAINT gastos_executivo_candidato_orgao_mes_unique
    UNIQUE (candidato_id, orgao_codigo, mes_extrato);

COMMENT ON TABLE public.gastos_executivo IS
  'Totais mensais institucionais do órgão público. Não representam gasto pessoal do candidato titular.';
