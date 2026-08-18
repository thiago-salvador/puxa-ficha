-- Remove CPF/CNPJ-like sequences from every currently exposed public free-text surface,
-- prevent reintroduction on writes, close public DML grants, and make the two public
-- aggregate views execute with the caller's privileges.

CREATE OR REPLACE FUNCTION public.mask_document_like_sequences(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.mask_document_like_sequences(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.sanitize_public_document_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
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

UPDATE public.historico_politico
SET observacoes = public.mask_document_like_sequences(observacoes)
WHERE observacoes IS DISTINCT FROM public.mask_document_like_sequences(observacoes);

UPDATE public.patrimonio
SET bens = public.mask_document_like_sequences(bens)
WHERE bens IS DISTINCT FROM public.mask_document_like_sequences(bens);

UPDATE public.projetos_lei
SET ementa = public.mask_document_like_sequences(ementa)
WHERE ementa IS DISTINCT FROM public.mask_document_like_sequences(ementa);

UPDATE public.legislacao_mandato_executivo
SET
  ementa = public.mask_document_like_sequences(ementa),
  metadata = public.mask_document_like_sequences(metadata)
WHERE ementa IS DISTINCT FROM public.mask_document_like_sequences(ementa)
   OR metadata IS DISTINCT FROM public.mask_document_like_sequences(metadata);

UPDATE public.mudancas_partido
SET contexto = public.mask_document_like_sequences(contexto)
WHERE contexto IS DISTINCT FROM public.mask_document_like_sequences(contexto);

DROP TRIGGER IF EXISTS sanitize_historico_politico_documents ON public.historico_politico;
CREATE TRIGGER sanitize_historico_politico_documents
BEFORE INSERT OR UPDATE OF observacoes ON public.historico_politico
FOR EACH ROW EXECUTE FUNCTION public.sanitize_public_document_fields();

DROP TRIGGER IF EXISTS sanitize_patrimonio_documents ON public.patrimonio;
CREATE TRIGGER sanitize_patrimonio_documents
BEFORE INSERT OR UPDATE OF bens ON public.patrimonio
FOR EACH ROW EXECUTE FUNCTION public.sanitize_public_document_fields();

DROP TRIGGER IF EXISTS sanitize_projetos_lei_documents ON public.projetos_lei;
CREATE TRIGGER sanitize_projetos_lei_documents
BEFORE INSERT OR UPDATE OF ementa ON public.projetos_lei
FOR EACH ROW EXECUTE FUNCTION public.sanitize_public_document_fields();

DROP TRIGGER IF EXISTS sanitize_legislacao_mandato_executivo_documents ON public.legislacao_mandato_executivo;
CREATE TRIGGER sanitize_legislacao_mandato_executivo_documents
BEFORE INSERT OR UPDATE OF ementa, metadata ON public.legislacao_mandato_executivo
FOR EACH ROW EXECUTE FUNCTION public.sanitize_public_document_fields();

DROP TRIGGER IF EXISTS sanitize_mudancas_partido_documents ON public.mudancas_partido;
CREATE TRIGGER sanitize_mudancas_partido_documents
BEFORE INSERT OR UPDATE OF contexto ON public.mudancas_partido
FOR EACH ROW EXECUTE FUNCTION public.sanitize_public_document_fields();

DO $$
DECLARE
  relation_name text;
  relation_kind "char";
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'historico_politico',
    'patrimonio',
    'financiamento',
    'pontos_atencao',
    'processos',
    'projetos_lei',
    'votos_candidato',
    'legislacao_mandato_executivo',
    'gastos_parlamentares',
    'mudancas_partido',
    'noticias_candidato',
    'posicoes_declaradas',
    'sancoes_administrativas',
    'votacoes_chave',
    'indicadores_estaduais',
    'candidatos_publico',
    'financiamento_publico',
    'v_ficha_candidato',
    'v_comparador'
  ]
  LOOP
    SELECT c.relkind
    INTO relation_kind
    FROM pg_class AS c
    JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = relation_name;

    IF relation_kind IN ('r', 'p') THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.%I FROM anon, authenticated',
        relation_name
      );
    ELSIF relation_kind IN ('v', 'm') THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon, authenticated',
        relation_name
      );
    END IF;
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLES FROM anon, authenticated;

ALTER VIEW public.candidatos_publico SET (security_invoker = true);
ALTER VIEW public.financiamento_publico SET (security_invoker = true);

REVOKE ALL ON FUNCTION public.mask_document_like_sequences(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mask_document_like_sequences(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sanitize_public_document_fields() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.mask_document_like_sequences(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mask_document_like_sequences(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sanitize_public_document_fields() TO service_role;
