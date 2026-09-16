-- Registra, sem apagar a evidência da consulta, que um ano não é aplicável
-- porque o pacote nacional completo não contém candidatura para a âncora.
ALTER TABLE public.financiamento_verificacoes
  ADD COLUMN IF NOT EXISTS fonte_sha256 text;

ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT IF EXISTS financiamento_verificacoes_resultado_check;
ALTER TABLE public.financiamento_verificacoes
  ADD CONSTRAINT financiamento_verificacoes_resultado_check
  CHECK (resultado IN ('ausencia_oficial', 'nao_coletado', 'erro', 'nao_aplicavel'));

ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT IF EXISTS financiamento_verificacoes_fonte_sha256_check;
ALTER TABLE public.financiamento_verificacoes
  ADD CONSTRAINT financiamento_verificacoes_fonte_sha256_check
  CHECK (fonte_sha256 IS NULL OR fonte_sha256 ~ '^[0-9a-f]{64}$');

ALTER TABLE public.financiamento_verificacoes
  DROP CONSTRAINT IF EXISTS financiamento_verificacoes_nao_aplicavel_check;
ALTER TABLE public.financiamento_verificacoes
  ADD CONSTRAINT financiamento_verificacoes_nao_aplicavel_check
  CHECK (
    resultado <> 'nao_aplicavel'
    OR (
      sq_candidato IS NULL
      AND uf_candidatura IS NULL
      AND fonte_url IS NOT NULL
      AND fonte_sha256 IS NOT NULL
      AND verificado_em IS NOT NULL
      AND detalhe IS NOT NULL
    )
  );

COMMENT ON COLUMN public.financiamento_verificacoes.fonte_sha256 IS
  'Hash SHA-256 do pacote oficial usado na prova; nunca contém identificador pessoal.';
COMMENT ON TABLE public.financiamento_verificacoes IS
  'Desfecho por pleito sem linha financeira. nao_aplicavel preserva a consulta quando não houve candidatura no ano.';

CREATE OR REPLACE VIEW public.financiamento_verificacoes_publico
WITH (security_invoker = true) AS
SELECT
  candidato_id,
  ano_eleicao,
  resultado,
  fonte_url,
  verificado_em,
  detalhe
FROM public.financiamento_verificacoes;

