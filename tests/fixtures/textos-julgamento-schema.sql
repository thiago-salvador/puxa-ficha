-- Contrato extraído literalmente de pg_dump de produção em 2026-09-05, sem dados.
-- SHA-256 do dump-fonte: e7b1e5d1a9a7cee739f7da592335bab80058412a7a0a69da156111ccb242f749.
-- Objetos: 3 tabelas, constraints/índices únicos, identidade coleta_log, view candidatos_publico,
-- trigger real de observacoes e suas funções. ACL/RLS não simuladas: drivers usam papel de banco.
-- O único trigger de candidatos é UPDATE OF publicavel,status; nenhum desses campos é escrito.
-- Nenhum trigger em coleta_log. Dados de teste fora dos campos aprovados são sintéticos.
CREATE FUNCTION public.mask_document_like_sequences(value jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO ''
    AS $$
DECLARE
  value_type text;
BEGIN
  value_type := jsonb_typeof(value);

  CASE value_type
    WHEN 'string' THEN
      RETURN to_jsonb(public.mask_document_like_sequences(value #>> '{}'));
    WHEN 'array' THEN
      RETURN COALESCE(
        (
          SELECT jsonb_agg(public.mask_document_like_sequences(item))
          FROM jsonb_array_elements(value) AS items(item)
        ),
        '[]'::jsonb
      );
    WHEN 'object' THEN
      RETURN COALESCE(
        (
          SELECT jsonb_object_agg(key, public.mask_document_like_sequences(item))
          FROM jsonb_each(value) AS entries(key, item)
        ),
        '{}'::jsonb
      );
    ELSE
      RETURN value;
  END CASE;
END
$$;

CREATE FUNCTION public.mask_document_like_sequences(value text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    SET search_path TO ''
    AS $_$
  SELECT regexp_replace(
    regexp_replace(
      value,
      '((CPF|CNPJ)[^0-9]{0,30})((([0-9][. /-]?){13}[0-9])|(([0-9][. /-]?){10}[0-9]))([^0-9]|$)',
      '\1[documento mascarado]\8',
      'gi'
    ),
    '(^|[^0-9])(([0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})|([0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}))([^0-9]|$)',
    '\1[documento mascarado]\5',
    'g'
  )
$_$;

CREATE FUNCTION public.sanitize_public_document_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'historico_politico' THEN
      NEW := jsonb_populate_record(
        NEW,
        jsonb_build_object(
          'observacoes',
          public.mask_document_like_sequences(to_jsonb(NEW) ->> 'observacoes')
        )
      );
    WHEN 'patrimonio' THEN
      NEW := jsonb_populate_record(
        NEW,
        jsonb_build_object(
          'bens',
          public.mask_document_like_sequences(to_jsonb(NEW) -> 'bens')
        )
      );
    WHEN 'projetos_lei' THEN
      NEW := jsonb_populate_record(
        NEW,
        jsonb_build_object(
          'ementa',
          public.mask_document_like_sequences(to_jsonb(NEW) ->> 'ementa')
        )
      );
    WHEN 'legislacao_mandato_executivo' THEN
      NEW := jsonb_populate_record(
        NEW,
        jsonb_build_object(
          'ementa',
          public.mask_document_like_sequences(to_jsonb(NEW) ->> 'ementa'),
          'metadata',
          public.mask_document_like_sequences(to_jsonb(NEW) -> 'metadata')
        )
      );
    WHEN 'mudancas_partido' THEN
      NEW := jsonb_populate_record(
        NEW,
        jsonb_build_object(
          'contexto',
          public.mask_document_like_sequences(to_jsonb(NEW) ->> 'contexto')
        )
      );
    ELSE
      RAISE EXCEPTION 'sanitize_public_document_fields: unsupported table %', TG_TABLE_NAME;
  END CASE;

  RETURN NEW;
END
$$;

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
    formacao_instituicao text,
    CONSTRAINT candidatos_cpf_formato_check CHECK (((cpf IS NULL) OR (cpf ~ '^[0-9]{11}$'::text))),
    CONSTRAINT candidatos_publicacao_minima_2026_check CHECK (((publicavel IS DISTINCT FROM true) OR (cargo_disputado <> ALL (ARRAY['Presidente'::text, 'Governador'::text])) OR ((COALESCE(btrim(foto_url), ''::text) <> ''::text) AND (COALESCE(btrim(partido_sigla), ''::text) <> ''::text) AND (COALESCE(btrim(situacao_candidatura), ''::text) <> ''::text) AND (COALESCE(btrim(biografia), ''::text) <> ''::text) AND (COALESCE(btrim(naturalidade), ''::text) <> ''::text) AND (data_nascimento IS NOT NULL) AND (COALESCE(btrim(formacao), ''::text) <> ''::text) AND (COALESCE(btrim(profissao_declarada), ''::text) <> ''::text) AND (COALESCE(btrim(genero), ''::text) <> ''::text) AND (COALESCE(btrim(estado_civil), ''::text) <> ''::text) AND (COALESCE(btrim(cor_raca), ''::text) <> ''::text) AND (COALESCE(verificacao_campos, '{}'::jsonb) ? 'candidate_registration'::text) AND (COALESCE(verificacao_campos, '{}'::jsonb) ? 'candidate_complement'::text)))),
    CONSTRAINT candidatos_publicavel_requires_disputa CHECK (((publicavel IS NOT TRUE) OR ((cargo_disputado IS NOT NULL) AND (cargo_disputado <> 'Nenhum'::text) AND (status <> ALL (ARRAY['removido'::text, 'desistente'::text]))))),
    CONSTRAINT candidatos_situacao_candidatura_dominio CHECK ((situacao_candidatura = ANY (ARRAY['aguardando julgamento'::text, 'candidatura declarada'::text, 'incerto'::text, 'deferido'::text, 'deferido com recurso'::text, 'indeferido'::text, 'indeferido com recurso'::text]))),
    CONSTRAINT candidatos_sq_candidato_2026_formato CHECK (((sq_candidato_2026 IS NULL) OR (sq_candidato_2026 ~ '^[0-9]{9,15}$'::text))),
    CONSTRAINT candidatos_status_dominio CHECK ((status = ANY (ARRAY['pre-candidato'::text, 'candidato'::text, 'indeferido'::text, 'desistente'::text, 'removido'::text])))
);

CREATE VIEW public.candidatos_publico WITH (security_invoker='true') AS
 SELECT id,
    nome_completo,
    nome_urna,
    slug,
    data_nascimento,
    COALESCE(idade, (EXTRACT(year FROM age((CURRENT_DATE)::timestamp with time zone, (data_nascimento)::timestamp with time zone)))::integer) AS idade,
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
          WHERE (f.valor !~~ 'interno:%'::text)) AS fonte_dados,
    ultima_atualizacao,
    verificacao_campos,
    foto_credito,
    formacao_instituicao
   FROM public.candidatos c
  WHERE ((status <> 'removido'::text) AND (publicavel = true));

CREATE TABLE public.coleta_log (
    id bigint NOT NULL,
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
    natureza text DEFAULT 'coleta'::text NOT NULL,
    CONSTRAINT coleta_log_candidato_id_so_em_escopo_candidato CHECK (((escopo = 'candidato'::text) OR (candidato_id IS NULL))),
    CONSTRAINT coleta_log_duracao_ms_check CHECK (((duracao_ms IS NULL) OR (duracao_ms >= 0))),
    CONSTRAINT coleta_log_escopo_check CHECK ((escopo = ANY (ARRAY['candidato'::text, 'territorio'::text, 'global'::text]))),
    CONSTRAINT coleta_log_lote_cursor_check CHECK (((lote_cursor IS NULL) OR (lote_cursor >= 0))),
    CONSTRAINT coleta_log_natureza_check CHECK ((natureza = ANY (ARRAY['coleta'::text, 'escrita'::text]))),
    CONSTRAINT coleta_log_resultado_check CHECK ((resultado = ANY (ARRAY['encontrado'::text, 'vazio_confirmado'::text, 'sem_achado_no_escopo'::text, 'nao_aplicavel'::text, 'erro'::text, 'indeterminado'::text]))),
    CONSTRAINT coleta_log_volume_check CHECK ((volume >= 0)),
    CONSTRAINT coleta_log_volume_coerente CHECK (
CASE resultado
    WHEN 'encontrado'::text THEN (volume > 0)
    WHEN 'vazio_confirmado'::text THEN (volume = 0)
    WHEN 'sem_achado_no_escopo'::text THEN (volume = 0)
    WHEN 'nao_aplicavel'::text THEN (volume = 0)
    WHEN 'indeterminado'::text THEN (volume = 0)
    ELSE true
END)
);

ALTER TABLE public.coleta_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.coleta_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE public.historico_politico (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidato_id uuid,
    cargo text NOT NULL,
    periodo_inicio integer,
    periodo_fim integer,
    partido text,
    estado text,
    eleito_por text,
    observacoes text,
    created_at timestamp with time zone DEFAULT now(),
    cargo_canonico text,
    tipo_evento text,
    proveniencia text,
    despublicacao_motivo text,
    despublicado_em timestamp with time zone,
    CONSTRAINT historico_politico_proveniencia_check CHECK (((proveniencia IS NULL) OR (proveniencia = ANY (ARRAY['tse'::text, 'wikidata'::text, 'manual'::text, 'misto'::text, 'unknown'::text])))),
    CONSTRAINT historico_politico_tipo_evento_check CHECK (((tipo_evento IS NULL) OR (tipo_evento = ANY (ARRAY['mandato'::text, 'candidatura'::text]))))
);

ALTER TABLE ONLY public.candidatos
    ADD CONSTRAINT candidatos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.candidatos
    ADD CONSTRAINT candidatos_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.coleta_log
    ADD CONSTRAINT coleta_log_execucao_lote_candidato_unique UNIQUE (fonte, execucao, lote_cursor, candidato_id);

ALTER TABLE ONLY public.coleta_log
    ADD CONSTRAINT coleta_log_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.historico_politico
    ADD CONSTRAINT historico_politico_pkey PRIMARY KEY (id);

CREATE UNIQUE INDEX candidatos_sq_candidato_2026_unico ON public.candidatos USING btree (sq_candidato_2026) WHERE (sq_candidato_2026 IS NOT NULL);

CREATE UNIQUE INDEX idx_historico_candidato_cargo_periodo ON public.historico_politico USING btree (candidato_id, cargo, periodo_inicio);

CREATE UNIQUE INDEX uq_historico_politico_candidato_cargo_canon_inicio ON public.historico_politico USING btree (candidato_id, cargo_canonico, periodo_inicio) WHERE ((periodo_inicio IS NOT NULL) AND (cargo_canonico IS NOT NULL));

CREATE TRIGGER sanitize_historico_politico_documents BEFORE INSERT OR UPDATE OF observacoes ON public.historico_politico FOR EACH ROW EXECUTE FUNCTION public.sanitize_public_document_fields();

ALTER TABLE ONLY public.coleta_log
    ADD CONSTRAINT coleta_log_candidato_id_fkey FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.historico_politico
    ADD CONSTRAINT historico_politico_candidato_id_fkey FOREIGN KEY (candidato_id) REFERENCES public.candidatos(id) ON DELETE CASCADE;
