BEGIN;

-- Doador recorrente: mesmo doador entre os maiores doadores de mais de uma
-- candidatura publicada, de pessoas diferentes.
--
-- A tabela é materializada por scripts/materializar-doador-recorrente.ts, com
-- service role e escrita auditada. Ela NÃO guarda documento: o CNPJ ou o
-- cpf_hash que agrupa o doador existe só na memória do script. O vínculo entre
-- as linhas é `doador_grupo`, um uuid aleatório por execução.
--
-- Exposição pública só pela view, com security_invoker. As duas pontas do
-- par são revalidadas contra financiamento_publico e candidatos_publico, então
-- despublicar uma ficha ou uma prestação some com o par mesmo antes da próxima
-- materialização.
--
-- Grant por coluna, não por tabela: coluna nova que alguém acrescente aqui no
-- futuro nasce sem SELECT para anon.

CREATE TABLE public.financiamento_doador_recorrente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doador_grupo uuid NOT NULL,
  financiamento_id uuid NOT NULL REFERENCES public.financiamento(id) ON DELETE CASCADE,
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  pessoa_chave text NOT NULL,
  ano_eleicao integer NOT NULL,
  doador_nome text NOT NULL CHECK (btrim(doador_nome) <> ''),
  doador_tipo text NOT NULL CHECK (doador_tipo IN ('PF', 'PJ')),
  valor numeric,
  regra_versao text NOT NULL,
  materializado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financiamento_doador_recorrente_pj_ate_2014
    CHECK (doador_tipo <> 'PJ' OR ano_eleicao < 2016),
  CONSTRAINT financiamento_doador_recorrente_grupo_financiamento_key
    UNIQUE (doador_grupo, financiamento_id)
);

CREATE INDEX financiamento_doador_recorrente_candidato_idx
  ON public.financiamento_doador_recorrente (candidato_id);
CREATE INDEX financiamento_doador_recorrente_grupo_idx
  ON public.financiamento_doador_recorrente (doador_grupo);

COMMENT ON TABLE public.financiamento_doador_recorrente IS
  'Aparições de doador recorrente, materializadas por script. Sem CNPJ nem cpf_hash; o agrupamento é doador_grupo, aleatório por execução.';
COMMENT ON COLUMN public.financiamento_doador_recorrente.doador_nome IS
  'Nome já sanitizado de maiores_doadores_publicos, na mesma posição do doador bruto.';
COMMENT ON COLUMN public.financiamento_doador_recorrente.pessoa_chave IS
  'Slug canônico da pessoa. Duas linhas com a mesma chave são a mesma pessoa e não formam par.';

ALTER TABLE public.financiamento_doador_recorrente ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financiamento_doador_recorrente FROM PUBLIC;
REVOKE ALL ON TABLE public.financiamento_doador_recorrente FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financiamento_doador_recorrente TO service_role;
GRANT SELECT (
  doador_grupo, financiamento_id, candidato_id, pessoa_chave, ano_eleicao,
  doador_nome, doador_tipo, valor, regra_versao, materializado_em
) ON TABLE public.financiamento_doador_recorrente TO anon, authenticated;

CREATE POLICY financiamento_doador_recorrente_select_publico
  ON public.financiamento_doador_recorrente
  FOR SELECT
  TO anon, authenticated
  USING (public.is_public_candidate(candidato_id));

CREATE VIEW public.financiamento_doador_recorrente_publico
WITH (security_invoker = true) AS
SELECT
  a.candidato_id,
  a.ano_eleicao,
  a.doador_grupo,
  a.doador_nome,
  a.doador_tipo,
  a.valor,
  b.ano_eleicao AS outra_ano_eleicao,
  b.valor AS outra_valor,
  cb.slug AS outra_slug,
  cb.nome_urna AS outra_nome_urna,
  cb.partido_sigla AS outra_partido_sigla,
  a.regra_versao,
  a.materializado_em
FROM public.financiamento_doador_recorrente AS a
JOIN public.financiamento_doador_recorrente AS b
  ON b.doador_grupo = a.doador_grupo
 AND b.pessoa_chave <> a.pessoa_chave
JOIN public.financiamento_publico AS fa ON fa.id = a.financiamento_id
JOIN public.financiamento_publico AS fb ON fb.id = b.financiamento_id
JOIN public.candidatos_publico AS cb ON cb.id = b.candidato_id;

COMMENT ON VIEW public.financiamento_doador_recorrente_publico IS
  'Par (aparição nesta ficha, aparição em outra candidatura publicada) do mesmo doador. Sem documento nem hash.';

REVOKE ALL ON TABLE public.financiamento_doador_recorrente_publico FROM PUBLIC;
REVOKE ALL ON TABLE public.financiamento_doador_recorrente_publico FROM anon, authenticated;
GRANT SELECT ON TABLE public.financiamento_doador_recorrente_publico TO anon, authenticated, service_role;

DO $guard$
DECLARE
  vazado text;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ')
    INTO vazado
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('financiamento_doador_recorrente', 'financiamento_doador_recorrente_publico')
    AND (column_name ILIKE '%cnpj%' OR column_name ILIKE '%cpf%' OR column_name ILIKE '%hash%'
         OR column_name ILIKE '%documento%');
  IF vazado IS NOT NULL THEN
    RAISE EXCEPTION 'doador recorrente: coluna de documento na superfície pública: %', vazado;
  END IF;

  IF has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'INSERT')
     OR has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'UPDATE')
     OR has_table_privilege('anon', 'public.financiamento_doador_recorrente', 'DELETE') THEN
    RAISE EXCEPTION 'doador recorrente: anon com escrita na tabela materializada';
  END IF;

  IF NOT has_table_privilege('anon', 'public.financiamento_doador_recorrente_publico', 'SELECT') THEN
    RAISE EXCEPTION 'doador recorrente: anon sem SELECT na view pública';
  END IF;
END
$guard$;

COMMIT;
