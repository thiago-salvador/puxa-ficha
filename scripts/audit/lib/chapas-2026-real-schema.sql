-- Schema real (colunas e CHECK constraints) de public.chapas_2026,
-- public.candidatos, public.patrimonio e public.coleta_log, lido de
-- produção via information_schema.columns e pg_get_constraintdef em
-- 17/09/2026. Fonte compartilhada pelos provadores PG17 desta issue (#340)
-- para que a prova rode contra as MESMAS constraints de produção, não um
-- fixture minimalista que as omite (causa raiz do incidente de apply
-- 35179453431: a prova de 20260916150000 tinha um chapas_2026 sem nenhuma
-- CHECK constraint).
--
-- Ampliado em 17/09/2026 (mesma issue, dry-run de produção pós-#357): as
-- primeiras versões deste arquivo só cobriam chapas_2026_fonte_detalhe_check
-- em profundidade; candidatos/patrimonio/coleta_log tinham fixtures
-- minimalistas SEM as CHECK constraints reais, e por isso as provas de
-- 20260917000001 (coleta_log_escopo_check, escopo='chapa' inválido) e
-- 20260917000100 (candidatos.foto_credito é jsonb, não text) passaram
-- localmente e falharam no dry-run real de produção. Este arquivo agora
-- carrega o schema real das quatro tabelas.
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
  nome_completo text NOT NULL,
  nome_urna text NOT NULL,
  slug text NOT NULL UNIQUE,
  cpf_hash text,
  data_nascimento date,
  idade integer,
  naturalidade text,
  formacao text,
  profissao_declarada text,
  partido_atual text NOT NULL,
  partido_sigla text NOT NULL,
  cargo_atual text,
  cargo_disputado text NOT NULL,
  estado text,
  status text DEFAULT 'pre-candidato',
  foto_url text,
  site_campanha text,
  redes_sociais jsonb DEFAULT '{}'::jsonb,
  fonte_dados text[],
  ultima_atualizacao timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  biografia text,
  cpf text,
  tcu_inabilitado boolean DEFAULT false,
  tcu_contas_irregulares boolean DEFAULT false,
  situacao_candidatura text,
  wikidata_id text,
  genero text,
  estado_civil text,
  cor_raca text,
  email_campanha text,
  publicavel boolean DEFAULT false,
  verificacao_campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  foto_credito jsonb,
  sq_candidato_2026 text,
  formacao_instituicao text
);

CREATE UNIQUE INDEX IF NOT EXISTS candidatos_sq_candidato_2026_unico
  ON public.candidatos (sq_candidato_2026) WHERE sq_candidato_2026 IS NOT NULL;

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_publicavel_requires_disputa
  CHECK (
    publicavel IS NOT TRUE
    OR (cargo_disputado IS NOT NULL AND cargo_disputado <> 'Nenhum' AND status NOT IN ('removido', 'desistente'))
  );

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_cpf_formato_check
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$');

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_status_dominio
  CHECK (status IN ('pre-candidato', 'candidato', 'indeferido', 'desistente', 'removido'));

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_sq_candidato_2026_formato
  CHECK (sq_candidato_2026 IS NULL OR sq_candidato_2026 ~ '^[0-9]{9,15}$');

ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_situacao_candidatura_dominio
  CHECK (situacao_candidatura IS NULL OR situacao_candidatura IN (
    'aguardando julgamento', 'candidatura declarada', 'incerto',
    'deferido', 'deferido com recurso', 'indeferido', 'indeferido com recurso',
    'pendente de julgamento'
  ));

-- Publicação mínima 2026: cargos de alta visibilidade (Presidente,
-- Governador, Senador) exigem ficha completa para poderem ser publicavel.
ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_publicacao_minima_2026_check
  CHECK (
    publicavel IS DISTINCT FROM true
    OR cargo_disputado NOT IN ('Presidente', 'Governador', 'Senador')
    OR (
      coalesce(btrim(foto_url), '') <> ''
      AND coalesce(btrim(partido_sigla), '') <> ''
      AND coalesce(btrim(situacao_candidatura), '') <> ''
      AND coalesce(btrim(biografia), '') <> ''
      AND coalesce(btrim(naturalidade), '') <> ''
      AND coalesce(btrim(formacao), '') <> ''
      AND coalesce(btrim(profissao_declarada), '') <> ''
      AND coalesce(btrim(genero), '') <> ''
      AND coalesce(btrim(estado_civil), '') <> ''
      AND coalesce(btrim(cor_raca), '') <> ''
      AND data_nascimento IS NOT NULL
      AND verificacao_campos ? 'candidate_registration'
      AND verificacao_campos ? 'candidate_complement'
    )
  );

CREATE TABLE IF NOT EXISTS public.patrimonio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid REFERENCES public.candidatos(id) ON DELETE CASCADE,
  ano_eleicao integer NOT NULL,
  valor_total numeric,
  bens jsonb,
  fonte text DEFAULT 'TSE',
  created_at timestamptz DEFAULT now(),
  despublicacao_motivo text,
  despublicado_em timestamptz,
  ano_arquivo integer,
  sq_candidato text,
  uf_candidatura text,
  cargo_candidatura text,
  data_eleicao date,
  tipo_eleicao text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patrimonio_contexto_eleitoral
  ON public.patrimonio (candidato_id, ano_eleicao, sq_candidato) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text,
  candidato_id uuid REFERENCES public.candidatos(id) ON DELETE SET NULL,
  executado_em timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL,
  volume integer NOT NULL DEFAULT 0,
  detalhe text,
  url text,
  execucao text,
  duracao_ms integer,
  lote_cursor integer,
  natureza text NOT NULL DEFAULT 'coleta'
);

ALTER TABLE public.coleta_log
  ADD CONSTRAINT coleta_log_escopo_check
  CHECK (escopo IN ('candidato', 'territorio', 'global'));

ALTER TABLE public.coleta_log
  ADD CONSTRAINT coleta_log_candidato_id_requires_escopo_candidato
  CHECK (candidato_id IS NULL OR escopo = 'candidato');

ALTER TABLE public.coleta_log
  ADD CONSTRAINT coleta_log_resultado_dominio
  CHECK (resultado IN ('encontrado', 'vazio_confirmado', 'sem_achado_no_escopo', 'nao_aplicavel', 'erro', 'indeterminado'));

ALTER TABLE public.coleta_log
  ADD CONSTRAINT coleta_log_volume_coerente
  CHECK (
    volume >= 0
    AND (resultado <> 'encontrado' OR volume > 0)
    AND (resultado NOT IN ('vazio_confirmado', 'sem_achado_no_escopo', 'nao_aplicavel', 'indeterminado') OR volume = 0)
  );

ALTER TABLE public.coleta_log
  ADD CONSTRAINT coleta_log_natureza_dominio
  CHECK (natureza IN ('coleta', 'escrita'));

CREATE UNIQUE INDEX IF NOT EXISTS coleta_log_fonte_execucao_lote_candidato_key
  ON public.coleta_log (fonte, execucao, lote_cursor, candidato_id);

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
  titular_candidato_id uuid REFERENCES public.candidatos(id) ON DELETE RESTRICT,
  vice_candidato_id uuid REFERENCES public.candidatos(id) ON DELETE RESTRICT,
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

-- chapas_2026_vice_situacao_divulgacand_check, texto integral de
-- 20260912160000_chapas_vice_situacao_divulgacand.sql (produção). Nenhuma
-- das migrations desta issue (#340/#346) grava vice_situacao_divulgacand,
-- então a coluna fica NULL e a constraint é trivialmente satisfeita, mas
-- entra aqui para o fixture cobrir o schema real por completo.
ALTER TABLE public.chapas_2026
  ADD CONSTRAINT chapas_2026_vice_situacao_divulgacand_check
  CHECK (
    vice_situacao_divulgacand IS NULL OR (
      identidade_status = 'confirmada' AND vinculo_titular_status = 'confirmado'
      AND eleicao_codigo = '6259' AND eleicao_data = '2026-10-04'::date
      AND titular_sq_candidato IS NOT NULL AND vice_sq_candidato IS NOT NULL
      AND vice_situacao_divulgacand - ARRAY['domain', 'situacao_vice', 'status', 'titular_sq_candidato', 'vice_sq_candidato', 'vice_nome_urna', 'vice_partido_sigla', 'uf', 'source_url', 'source_sha256', 'checked_at'] = '{}'::jsonb
      AND vice_situacao_divulgacand @> jsonb_build_object(
        'domain', 'divulgacand_vices', 'situacao_vice', 3, 'status', 'inapto',
        'titular_sq_candidato', titular_sq_candidato, 'vice_sq_candidato', vice_sq_candidato,
        'vice_nome_urna', vice_nome_urna, 'vice_partido_sigla', vice_partido_sigla, 'uf', coalesce(uf, 'BR'),
        'source_url', 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/2026/' || coalesce(uf, 'BR') || '/20322002026/candidato/' || titular_sq_candidato)
      AND jsonb_typeof(vice_situacao_divulgacand->'source_sha256') = 'string'
      AND (vice_situacao_divulgacand->>'source_sha256') ~ '^[a-f0-9]{64}$'
      AND jsonb_typeof(vice_situacao_divulgacand->'checked_at') = 'string'
      AND isfinite((vice_situacao_divulgacand->>'checked_at')::timestamptz)
    ) IS TRUE
  );

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

-- Índices únicos parciais reais (fonte_tipo='divulgacand_detalhe'): impedem
-- duas chapas de fonte direta apontarem para o mesmo titular/vice.
CREATE UNIQUE INDEX IF NOT EXISTS chapas_2026_titular_sq_candidato_divulgacand_key
  ON public.chapas_2026 (titular_sq_candidato) WHERE fonte_tipo = 'divulgacand_detalhe';

CREATE UNIQUE INDEX IF NOT EXISTS chapas_2026_vice_sq_candidato_divulgacand_key
  ON public.chapas_2026 (vice_sq_candidato) WHERE fonte_tipo = 'divulgacand_detalhe';

CREATE UNIQUE INDEX IF NOT EXISTS chapas_2026_titular_candidato_id_divulgacand_key
  ON public.chapas_2026 (titular_candidato_id) WHERE fonte_tipo = 'divulgacand_detalhe';
