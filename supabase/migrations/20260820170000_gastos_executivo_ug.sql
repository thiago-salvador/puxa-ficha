-- Grão mensal por unidade gestora do órgão público.
-- O gasto pertence ao órgão, nunca à pessoa que o chefia.
-- Portador só é nomeado quando a fonte nomeia; no CPGF federal o token
-- Sigiloso conta como classificado, não como nome.
-- Governador: a regra de nomear portador só vale quando o portal estadual
-- nomear. Esta tabela já carrega esse contrato; o ingest atual liga só o
-- órgão federal 20101 (Presidência da República).
-- RLS permanece a policy pública is_public_candidate da tabela.

ALTER TABLE public.gastos_executivo
  ADD COLUMN IF NOT EXISTS ug_codigo text NOT NULL DEFAULT '-'
    CHECK (btrim(ug_codigo) <> ''),
  ADD COLUMN IF NOT EXISTS ug_nome text NOT NULL DEFAULT 'Unidade gestora não discriminada'
    CHECK (btrim(ug_nome) <> ''),
  ADD COLUMN IF NOT EXISTS qtd_portador_sigiloso integer NOT NULL DEFAULT 0
    CHECK (qtd_portador_sigiloso >= 0),
  ADD COLUMN IF NOT EXISTS qtd_portador_nominado integer NOT NULL DEFAULT 0
    CHECK (qtd_portador_nominado >= 0),
  ADD COLUMN IF NOT EXISTS qtd_portador_ausente integer NOT NULL DEFAULT 0
    CHECK (qtd_portador_ausente >= 0),
  ADD COLUMN IF NOT EXISTS qtd_estabelecimento_sigiloso integer NOT NULL DEFAULT 0
    CHECK (qtd_estabelecimento_sigiloso >= 0),
  ADD COLUMN IF NOT EXISTS qtd_estabelecimento_nominado integer NOT NULL DEFAULT 0
    CHECK (qtd_estabelecimento_nominado >= 0),
  ADD COLUMN IF NOT EXISTS qtd_estabelecimento_ausente integer NOT NULL DEFAULT 0
    CHECK (qtd_estabelecimento_ausente >= 0);

ALTER TABLE public.gastos_executivo
  DROP CONSTRAINT IF EXISTS gastos_executivo_candidato_orgao_mes_unique;

ALTER TABLE public.gastos_executivo
  DROP CONSTRAINT IF EXISTS gastos_executivo_candidato_orgao_ug_mes_unique;

ALTER TABLE public.gastos_executivo
  ADD CONSTRAINT gastos_executivo_candidato_orgao_ug_mes_unique
    UNIQUE (candidato_id, orgao_codigo, ug_codigo, mes_extrato);

ALTER TABLE public.gastos_executivo
  ALTER COLUMN ug_codigo DROP DEFAULT,
  ALTER COLUMN ug_nome DROP DEFAULT;

CREATE INDEX IF NOT EXISTS gastos_executivo_candidato_orgao_mes_idx
  ON public.gastos_executivo (candidato_id, orgao_codigo, mes_extrato DESC);

COMMENT ON TABLE public.gastos_executivo IS
  'Totais mensais por unidade gestora do órgão público. Não representam gasto pessoal do candidato titular. O dado pertence ao órgão, não à pessoa.';
COMMENT ON COLUMN public.gastos_executivo.ug_codigo IS
  'Código da unidade gestora na fonte. Grão com candidato, órgão e mês. Não identifica a pessoa titular.';
COMMENT ON COLUMN public.gastos_executivo.ug_nome IS
  'Nome da unidade gestora na fonte, sem normalizar acento que a fonte não trouxe.';
COMMENT ON COLUMN public.gastos_executivo.qtd_portador_sigiloso IS
  'Transações cujo portador a fonte classificou (token Sigiloso no CPGF federal). Nunca persistir esse token como nome.';
COMMENT ON COLUMN public.gastos_executivo.qtd_portador_nominado IS
  'Transações cujo portador a fonte nomeou de fato. Portal estadual futuro: só contar aqui quando o portal nomear.';
COMMENT ON COLUMN public.gastos_executivo.qtd_portador_ausente IS
  'Transações sem portador na fonte.';
COMMENT ON COLUMN public.gastos_executivo.qtd_estabelecimento_sigiloso IS
  'Transações cujo estabelecimento a fonte classificou.';
COMMENT ON COLUMN public.gastos_executivo.qtd_estabelecimento_nominado IS
  'Transações cujo estabelecimento a fonte nomeou de fato.';
COMMENT ON COLUMN public.gastos_executivo.qtd_estabelecimento_ausente IS
  'Transações sem estabelecimento na fonte.';
COMMENT ON COLUMN public.gastos_executivo.fonte IS
  'URL da fonte do valor persistido. No CPGF federal é o download oficial mensal, não a API de cartões, porque essa API às vezes devolve valor truncado no mesmo id.';
