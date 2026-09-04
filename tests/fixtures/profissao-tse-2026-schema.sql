-- Schema extraído de produção por SELECT pg_catalog em 2026-09-04.
-- Sem dados pessoais. Recorte real: candidatos, coleta_log e candidatos_publico.
-- Não inclui ACL/RLS/triggers; a prova cobre DML, constraints, tipos e a view consultada.
CREATE TABLE public.candidatos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome_completo text NOT NULL,
  nome_urna text NOT NULL,
  slug text NOT NULL,
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
  status text DEFAULT 'pre-candidato'::text,
  foto_url text,
  site_campanha text,
  redes_sociais jsonb DEFAULT '{}'::jsonb,
  fonte_dados text[],
  ultima_atualizacao timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
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
  verificacao_campos jsonb DEFAULT '{}'::jsonb NOT NULL,
  foto_credito jsonb,
  sq_candidato_2026 text,
  formacao_instituicao text
);
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_cpf_formato_check CHECK (((cpf IS NULL) OR (cpf ~ '^[0-9]{11}$'::text)));
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_pkey PRIMARY KEY (id);
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_publicacao_minima_2026_check CHECK (((publicavel IS DISTINCT FROM true) OR (cargo_disputado <> ALL (ARRAY['Presidente'::text, 'Governador'::text])) OR ((COALESCE(btrim(foto_url), ''::text) <> ''::text) AND (COALESCE(btrim(partido_sigla), ''::text) <> ''::text) AND (COALESCE(btrim(situacao_candidatura), ''::text) <> ''::text) AND (COALESCE(btrim(biografia), ''::text) <> ''::text) AND (COALESCE(btrim(naturalidade), ''::text) <> ''::text) AND (data_nascimento IS NOT NULL) AND (COALESCE(btrim(formacao), ''::text) <> ''::text) AND (COALESCE(btrim(profissao_declarada), ''::text) <> ''::text) AND (COALESCE(btrim(genero), ''::text) <> ''::text) AND (COALESCE(btrim(estado_civil), ''::text) <> ''::text) AND (COALESCE(btrim(cor_raca), ''::text) <> ''::text) AND (COALESCE(verificacao_campos, '{}'::jsonb) ? 'candidate_registration'::text) AND (COALESCE(verificacao_campos, '{}'::jsonb) ? 'candidate_complement'::text))));
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_publicavel_requires_disputa CHECK (((publicavel IS NOT TRUE) OR ((cargo_disputado IS NOT NULL) AND (cargo_disputado <> 'Nenhum'::text) AND (status <> ALL (ARRAY['removido'::text, 'desistente'::text])))));
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_situacao_candidatura_dominio CHECK ((situacao_candidatura = ANY (ARRAY['aguardando julgamento'::text, 'candidatura declarada'::text, 'incerto'::text, 'deferido'::text, 'deferido com recurso'::text, 'indeferido'::text, 'indeferido com recurso'::text])));
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_slug_key UNIQUE (slug);
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_sq_candidato_2026_formato CHECK (((sq_candidato_2026 IS NULL) OR (sq_candidato_2026 ~ '^[0-9]{9,15}$'::text)));
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_status_dominio CHECK ((status = ANY (ARRAY['pre-candidato'::text, 'candidato'::text, 'indeferido'::text, 'desistente'::text, 'removido'::text])));
CREATE TABLE public.coleta_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  fonte text NOT NULL,
  escopo text NOT NULL,
  alvo text NOT NULL,
  candidato_id uuid,
  executado_em timestamp with time zone DEFAULT now() NOT NULL,
  resultado text NOT NULL,
  volume integer DEFAULT 0 NOT NULL,
  detalhe text,
  url text,
  execucao text,
  duracao_ms integer,
  lote_cursor integer,
  natureza text DEFAULT 'coleta'::text NOT NULL
);
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_candidato_id_fkey FOREIGN KEY (candidato_id) REFERENCES candidatos(id) ON DELETE SET NULL;
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_candidato_id_so_em_escopo_candidato CHECK (((escopo = 'candidato'::text) OR (candidato_id IS NULL)));
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_duracao_ms_check CHECK (((duracao_ms IS NULL) OR (duracao_ms >= 0)));
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_escopo_check CHECK ((escopo = ANY (ARRAY['candidato'::text, 'territorio'::text, 'global'::text])));
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_execucao_lote_candidato_unique UNIQUE (fonte, execucao, lote_cursor, candidato_id);
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_lote_cursor_check CHECK (((lote_cursor IS NULL) OR (lote_cursor >= 0)));
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_natureza_check CHECK ((natureza = ANY (ARRAY['coleta'::text, 'escrita'::text])));
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_pkey PRIMARY KEY (id);
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_resultado_check CHECK ((resultado = ANY (ARRAY['encontrado'::text, 'vazio_confirmado'::text, 'sem_achado_no_escopo'::text, 'nao_aplicavel'::text, 'erro'::text, 'indeterminado'::text])));
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_volume_check CHECK ((volume >= 0));
ALTER TABLE public.coleta_log ADD CONSTRAINT coleta_log_volume_coerente CHECK (
CASE resultado
    WHEN 'encontrado'::text THEN (volume > 0)
    WHEN 'vazio_confirmado'::text THEN (volume = 0)
    WHEN 'sem_achado_no_escopo'::text THEN (volume = 0)
    WHEN 'nao_aplicavel'::text THEN (volume = 0)
    WHEN 'indeterminado'::text THEN (volume = 0)
    ELSE true
END);
CREATE VIEW public.candidatos_publico AS
 SELECT id,
    nome_completo,
    nome_urna,
    slug,
    data_nascimento,
    COALESCE(idade, EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone, data_nascimento::timestamp with time zone))::integer) AS idade,
    naturalidade,
    formacao,
    profissao_declarada,
    genero,
    estado_civil,
    cor_raca,
    partido_atual,
    partido_sigla,
    cargo_atual,
    cargo_disputado,
    estado,
    status,
    situacao_candidatura,
    biografia,
    foto_url,
    site_campanha,
    redes_sociais,
    ( SELECT array_agg(f.valor ORDER BY f.ord) AS array_agg
           FROM unnest(c.fonte_dados) WITH ORDINALITY f(valor, ord)
          WHERE f.valor !~~ 'interno:%'::text) AS fonte_dados,
    ultima_atualizacao,
    verificacao_campos,
    foto_credito,
    formacao_instituicao
   FROM candidatos c
  WHERE status <> 'removido'::text AND publicavel = true;
