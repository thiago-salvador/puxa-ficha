-- Série mensal de gastos institucionais de órgãos chefiados por candidatos.
-- Não atribui despesa ao titular: o dado pertence ao órgão público e a fonte
-- pode manter portador e estabelecimento sob sigilo por segurança.

CREATE TABLE public.gastos_executivo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  orgao_codigo text NOT NULL CHECK (orgao_codigo ~ '^\d+$'),
  orgao_nome text NOT NULL CHECK (btrim(orgao_nome) <> ''),
  mes_extrato date NOT NULL CHECK (EXTRACT(DAY FROM mes_extrato) = 1),
  valor_total numeric(18, 2) NOT NULL CHECK (valor_total >= 0),
  qtd_transacoes integer NOT NULL CHECK (qtd_transacoes >= 0),
  fonte text NOT NULL CHECK (fonte ~ '^https://'),
  coletado_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gastos_executivo_candidato_orgao_mes_unique
    UNIQUE (candidato_id, orgao_codigo, mes_extrato)
);

CREATE INDEX gastos_executivo_candidato_mes_idx
  ON public.gastos_executivo (candidato_id, mes_extrato DESC);

COMMENT ON TABLE public.gastos_executivo IS
  'Totais mensais institucionais do órgão público. Não representam gasto pessoal do candidato titular.';
COMMENT ON COLUMN public.gastos_executivo.valor_total IS
  'Soma das transações retornadas pela fonte para o órgão e mês, inclusive zero quando a consulta completa veio vazia.';
COMMENT ON COLUMN public.gastos_executivo.qtd_transacoes IS
  'Quantidade de transações retornadas após paginação até a primeira página vazia.';

ALTER TABLE public.gastos_executivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos_executivo FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gastos_executivo FROM PUBLIC;
REVOKE ALL ON TABLE public.gastos_executivo FROM anon, authenticated;

CREATE POLICY "Leitura pública"
ON public.gastos_executivo
FOR SELECT
TO anon, authenticated
USING (public.is_public_candidate(candidato_id));

GRANT SELECT ON TABLE public.gastos_executivo TO anon, authenticated;
