BEGIN;

-- Patrimônio pertence a uma candidatura TSE, não apenas à pessoa/ano. O ano
-- do arquivo oficial continua separado do ano efetivo do pleito suplementar.
ALTER TABLE public.patrimonio
  ADD COLUMN IF NOT EXISTS ano_arquivo integer,
  ADD COLUMN IF NOT EXISTS sq_candidato text,
  ADD COLUMN IF NOT EXISTS uf_candidatura text,
  ADD COLUMN IF NOT EXISTS cargo_candidatura text,
  ADD COLUMN IF NOT EXISTS data_eleicao date,
  ADD COLUMN IF NOT EXISTS tipo_eleicao text;

DROP INDEX IF EXISTS public.uq_patrimonio_candidato_ano_eleicao;
ALTER TABLE public.patrimonio
  DROP CONSTRAINT IF EXISTS patrimonio_candidato_id_ano_eleicao_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_patrimonio_contexto_eleitoral
  ON public.patrimonio (candidato_id, ano_eleicao, sq_candidato)
  NULLS NOT DISTINCT;

ALTER TABLE public.patrimonio_ausencia_oficial
  ADD COLUMN IF NOT EXISTS ano_arquivo integer,
  ADD COLUMN IF NOT EXISTS uf_candidatura text,
  ADD COLUMN IF NOT EXISTS cargo_candidatura text,
  ADD COLUMN IF NOT EXISTS data_eleicao date,
  ADD COLUMN IF NOT EXISTS tipo_eleicao text;

ALTER TABLE public.patrimonio_ausencia_oficial
  DROP CONSTRAINT IF EXISTS patrimonio_ausencia_oficial_candidato_id_ano_eleicao_key,
  DROP CONSTRAINT IF EXISTS patrimonio_ausencia_oficial_contexto_unique;
ALTER TABLE public.patrimonio_ausencia_oficial
  ADD CONSTRAINT patrimonio_ausencia_oficial_contexto_unique
  UNIQUE NULLS NOT DISTINCT (candidato_id, ano_eleicao, sq_candidato);

COMMENT ON COLUMN public.patrimonio.ano_eleicao IS
  'Ano efetivo do pleito; em eleição suplementar pode diferir do ciclo do arquivo oficial.';
COMMENT ON COLUMN public.patrimonio.ano_arquivo IS
  'Ano/ciclo do arquivo bem_candidato que originou a declaração.';
COMMENT ON COLUMN public.patrimonio_ausencia_oficial.ano_arquivo IS
  'Ano/ciclo do arquivo bem_candidato efetivamente examinado.';

COMMIT;
