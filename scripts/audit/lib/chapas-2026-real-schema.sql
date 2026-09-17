-- Schema real (colunas e CHECK constraints) de public.chapas_2026,
-- public.candidatos, public.patrimonio e public.coleta_log, lido de
-- produção via information_schema.columns e pg_get_constraintdef em
-- 17/09/2026. Fonte compartilhada pelos provadores PG17 desta issue (#340)
-- para que a prova rode contra as MESMAS constraints de produção, não um
-- fixture minimalista que as omite (causa raiz do incidente de apply
-- 35179453431: a prova de 20260916150000 tinha um chapas_2026 sem nenhuma
-- CHECK constraint).
--
-- chapas_2026_fonte_detalhe_check aqui já é a versão ALARGADA (pós-
-- 20260917000000, aceitando 'Pendente de julgamento'): é o estado real
-- corrente depois desta PR. O provador do próprio alargamento
-- (provar-pendente-julgamento-fonte-detalhe-pg17.sh) troca essa constraint
-- pela versão estreita ANTES de rodar a migration, para provar a transição
-- estreito->largo; os demais provadores usam este arquivo tal como está.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY, idempotency_key text
);

CREATE TABLE IF NOT EXISTS public.candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome_completo text, nome_urna text, partido_sigla text, partido_atual text,
  cargo_disputado text, estado text, sq_candidato_2026 text UNIQUE,
  data_nascimento date, naturalidade text, formacao text, profissao_declarada text,
  genero text, estado_civil text, cor_raca text, foto_url text, foto_credito text,
  biografia text, situacao_candidatura text, status text NOT NULL DEFAULT 'candidato',
  publicavel boolean NOT NULL DEFAULT true, fonte_dados text[], verificacao_campos jsonb,
  ultima_atualizacao timestamptz NOT NULL DEFAULT '2026-01-01T00:00:00Z',
  created_at timestamptz NOT NULL DEFAULT '2026-01-01T00:00:00Z',
  CONSTRAINT candidatos_situacao_candidatura_dominio
    CHECK (situacao_candidatura IS NULL OR situacao_candidatura IN (
      'aguardando julgamento', 'candidatura declarada', 'incerto',
      'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso',
      'pendente de julgamento'
    ))
);

CREATE TABLE IF NOT EXISTS public.patrimonio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid REFERENCES public.candidatos(id),
  ano_eleicao integer NOT NULL, valor_total numeric, bens jsonb, fonte text,
  sq_candidato text, uf_candidatura text, cargo_candidatura text,
  despublicacao_motivo text, despublicado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT '2026-01-01T00:00:00Z'
);

CREATE TABLE IF NOT EXISTS public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte text NOT NULL, escopo text, alvo text, candidato_id uuid,
  resultado text, volume integer, detalhe text, url text, execucao text, natureza text
);

-- Colunas de public.chapas_2026 lidas de information_schema em 17/09/2026
-- (31 colunas nomeadas, ordinal 1-32 pulando 31 no dump original).
CREATE TABLE IF NOT EXISTS public.chapas_2026 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,
  eleicao_codigo text NOT NULL,
  eleicao_data date NOT NULL,
  uf text,
  cargo_titular text NOT NULL,
  sq_coligacao text,
  identidade_status text NOT NULL,
  vinculo_titular_status text NOT NULL,
  tse_situacao_codigo text NOT NULL,
  tse_situacao_titular_codigo text,
  tse_situacao_vice_codigo text,
  tipo_agremiacao text NOT NULL,
  composicao text NOT NULL,
  titular_candidato_id uuid REFERENCES public.candidatos(id),
  vice_candidato_id uuid REFERENCES public.candidatos(id),
  titular_sq_candidato text,
  vice_sq_candidato text,
  titular_nome_completo text NOT NULL,
  titular_nome_urna text NOT NULL,
  titular_partido_sigla text NOT NULL,
  vice_nome_completo text NOT NULL,
  vice_nome_urna text NOT NULL,
  vice_partido_sigla text NOT NULL,
  alternativas_oficiais jsonb NOT NULL DEFAULT '[]'::jsonb,
  fonte_url text NOT NULL,
  fonte_sha256 text NOT NULL,
  snapshot_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  fonte_tipo text NOT NULL DEFAULT 'legado',
  fonte_detalhe jsonb,
  vice_situacao_divulgacand jsonb
);

ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_cargo_titular_check
  CHECK (cargo_titular = ANY (ARRAY['Presidente', 'Governador']));

ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_check
  CHECK (((cargo_titular = 'Presidente' AND uf IS NULL) OR (cargo_titular = 'Governador' AND uf ~ '^[A-Z]{2}$')));

ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_check1
  CHECK (
    (fonte_tipo = 'legado' AND ((identidade_status = 'confirmada' AND sq_coligacao IS NOT NULL) OR identidade_status = 'duplicidade_oficial'))
    OR (fonte_tipo = 'divulgacand_detalhe' AND identidade_status = 'confirmada')
  );

ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_check2
  CHECK (
    identidade_status <> 'duplicidade_oficial'
    OR (
      jsonb_array_length(alternativas_oficiais) = 2
      AND (
        (sq_coligacao IS NULL AND titular_sq_candidato IS NULL AND vice_sq_candidato IS NULL)
        OR (sq_coligacao IS NOT NULL AND titular_sq_candidato IS NOT NULL AND vice_sq_candidato IS NOT NULL)
      )
    )
  );

ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_check3
  CHECK (
    vinculo_titular_status = ANY (ARRAY['confirmado', 'novo_perfil_oficial'])
    OR (titular_candidato_id IS NULL AND titular_sq_candidato IS NULL)
  );

ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_fonte_legado_check
  CHECK (
    fonte_tipo = ANY (ARRAY['legado', 'divulgacand_detalhe'])
    AND (fonte_tipo <> 'legado' OR (fonte_detalhe IS NULL AND tse_situacao_titular_codigo IS NOT NULL AND tse_situacao_vice_codigo IS NOT NULL))
  );

ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_identidade_status_check
  CHECK (identidade_status = ANY (ARRAY['confirmada', 'duplicidade_oficial']));

ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_vinculo_titular_status_check
  CHECK (vinculo_titular_status = ANY (ARRAY['confirmado', 'revisao_identidade', 'duplicidade_oficial', 'novo_perfil_oficial']));

-- Versão ALARGADA (pós-20260917000000): titular/vice descricao_situacao
-- aceitam 'Pendente de julgamento'.
ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_fonte_detalhe_check
  CHECK (
    (fonte_tipo <> 'divulgacand_detalhe') OR ((
      jsonb_typeof(fonte_detalhe) = 'object'
      AND sq_coligacao IS NULL
      AND tse_situacao_titular_codigo IS NULL
      AND tse_situacao_vice_codigo IS NULL
      AND identidade_status = 'confirmada'
      AND vinculo_titular_status = ANY (ARRAY['confirmado', 'novo_perfil_oficial'])
      AND titular_candidato_id IS NOT NULL
      AND titular_sq_candidato ~ '^[0-9]+$'
      AND vice_sq_candidato ~ '^[0-9]+$'
      AND titular_sq_candidato <> vice_sq_candidato
      AND jsonb_array_length(alternativas_oficiais) = 0
      AND fonte_sha256 ~ '^[a-f0-9]{64}$'
      AND fonte_url = ('https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/' || COALESCE(uf, 'BR') || '/20322002026/candidato/' || titular_sq_candidato)
      AND (fonte_detalhe->'titular'->>'url') = fonte_url
      AND (fonte_detalhe->'titular'->>'sha256') = fonte_sha256
      AND (fonte_detalhe->'titular'->>'checked_at')::timestamptz = snapshot_em
      AND isfinite(snapshot_em)
      AND (fonte_detalhe->'titular'->>'http_status') = '200'
      AND (fonte_detalhe->'titular'->>'sq_candidato') = titular_sq_candidato
      AND (fonte_detalhe->'titular'->>'nome_completo') = titular_nome_completo
      AND (fonte_detalhe->'titular'->>'nome_urna') = titular_nome_urna
      AND (fonte_detalhe->'titular'->>'partido_sigla') = titular_partido_sigla
      AND (fonte_detalhe->'titular'->>'cargo') = cargo_titular
      AND (fonte_detalhe->'titular'->>'uf') = COALESCE(uf, 'BR')
      AND (fonte_detalhe->'titular'->>'descricao_situacao') = tse_situacao_codigo
      AND (fonte_detalhe->'titular'->>'descricao_situacao') = ANY (ARRAY['Aguardando julgamento', 'Deferido', 'Deferido com recurso', 'Pendente de julgamento'])
      AND (fonte_detalhe->'titular'->>'vice_vigente_sq') = vice_sq_candidato
      AND (fonte_detalhe->'titular'->'contagem_vices_vigentes') = '1'::jsonb
      AND (fonte_detalhe->'titular'->'is_candidato_inapto') = 'false'::jsonb
      AND (fonte_detalhe->'titular'->'substituido') = 'false'::jsonb
      AND (fonte_detalhe->'vice'->>'url') = ('https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/' || COALESCE(uf, 'BR') || '/20322002026/candidato/' || vice_sq_candidato)
      AND (fonte_detalhe->'vice'->>'sha256') ~ '^[a-f0-9]{64}$'
      AND isfinite((fonte_detalhe->'vice'->>'checked_at')::timestamptz)
      AND (fonte_detalhe->'vice'->>'http_status') = '200'
      AND (fonte_detalhe->'vice'->>'sq_candidato') = vice_sq_candidato
      AND (fonte_detalhe->'vice'->>'nome_completo') = vice_nome_completo
      AND (fonte_detalhe->'vice'->>'nome_urna') = vice_nome_urna
      AND (fonte_detalhe->'vice'->>'partido_sigla') = vice_partido_sigla
      AND (fonte_detalhe->'vice'->>'cargo') = CASE cargo_titular WHEN 'Governador' THEN 'Vice-governador' ELSE 'Vice-presidente' END
      AND (fonte_detalhe->'vice'->>'uf') = COALESCE(uf, 'BR')
      AND (fonte_detalhe->'vice'->>'descricao_situacao') = ANY (ARRAY['Aguardando julgamento', 'Deferido', 'Deferido com recurso', 'Pendente de julgamento'])
      AND (fonte_detalhe->'vice'->'is_candidato_inapto') = 'false'::jsonb
      AND (fonte_detalhe->'vice'->'substituido') = 'false'::jsonb
    ) IS TRUE)
  );

CREATE UNIQUE INDEX IF NOT EXISTS chapas_2026_chave_key ON public.chapas_2026 (chave);
