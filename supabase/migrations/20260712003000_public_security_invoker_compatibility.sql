BEGIN;

-- `security_invoker` exige que anon/authenticated tenham SELECT nas colunas-base
-- usadas pelas views. Concedemos somente a superfície já pública; CPF e o JSON
-- bruto de doadores continuam sem privilégio de leitura direta.
REVOKE SELECT ON TABLE public.candidatos FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, nome_completo, nome_urna, slug, data_nascimento, idade, naturalidade,
  formacao, profissao_declarada, genero, estado_civil, cor_raca, partido_atual,
  partido_sigla, cargo_atual, cargo_disputado, estado, status,
  situacao_candidatura, biografia, foto_url, site_campanha, redes_sociais,
  fonte_dados, ultima_atualizacao, publicavel
) ON TABLE public.candidatos TO anon, authenticated;

ALTER TABLE public.financiamento
  ADD COLUMN IF NOT EXISTS maiores_doadores_publicos jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.sanitize_financiamento_doadores_publicos(value jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'nome', public.mask_document_like_sequences(item.value ->> 'nome'),
        'valor', item.value ->> 'valor',
        'tipo', public.mask_document_like_sequences(item.value ->> 'tipo')
      )
      ORDER BY item.ordinality
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(value) = 'array' THEN value
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS item(value, ordinality)
$$;

CREATE OR REPLACE FUNCTION public.sync_financiamento_doadores_publicos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.maiores_doadores_publicos :=
    public.sanitize_financiamento_doadores_publicos(NEW.maiores_doadores);
  RETURN NEW;
END
$$;

UPDATE public.financiamento
SET maiores_doadores_publicos =
  public.sanitize_financiamento_doadores_publicos(maiores_doadores)
WHERE maiores_doadores_publicos IS DISTINCT FROM
  public.sanitize_financiamento_doadores_publicos(maiores_doadores);

DROP TRIGGER IF EXISTS sync_financiamento_doadores_publicos ON public.financiamento;
CREATE TRIGGER sync_financiamento_doadores_publicos
BEFORE INSERT OR UPDATE OF maiores_doadores ON public.financiamento
FOR EACH ROW EXECUTE FUNCTION public.sync_financiamento_doadores_publicos();

CREATE OR REPLACE VIEW public.financiamento_publico AS
SELECT
  f.id,
  f.candidato_id,
  f.ano_eleicao,
  f.total_arrecadado,
  f.total_fundo_partidario,
  f.total_fundo_eleitoral,
  f.total_pessoa_fisica,
  f.total_recursos_proprios,
  f.maiores_doadores_publicos AS maiores_doadores,
  f.fonte,
  f.created_at
FROM public.financiamento AS f
WHERE public.is_public_candidate(f.candidato_id);

ALTER VIEW public.financiamento_publico SET (security_invoker = true);

REVOKE SELECT ON TABLE public.financiamento FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario,
  total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios,
  maiores_doadores_publicos, fonte, created_at
) ON TABLE public.financiamento TO anon, authenticated;
GRANT SELECT ON TABLE public.candidatos_publico, public.financiamento_publico
  TO anon, authenticated;

-- Remove privilégios herdados de PUBLIC, além dos grants diretos já removidos.
DO $$
DECLARE
  relation_name text;
  relation_kind "char";
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'candidatos', 'historico_politico', 'patrimonio', 'financiamento',
    'pontos_atencao', 'processos', 'projetos_lei', 'votos_candidato',
    'legislacao_mandato_executivo', 'gastos_parlamentares', 'mudancas_partido',
    'noticias_candidato', 'posicoes_declaradas', 'sancoes_administrativas',
    'votacoes_chave', 'indicadores_estaduais', 'candidatos_publico',
    'financiamento_publico', 'v_ficha_candidato', 'v_comparador'
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
        'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        relation_name
      );
    ELSIF relation_kind IN ('v', 'm') THEN
      EXECUTE format(
        'REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM PUBLIC, anon, authenticated',
        relation_name
      );
    END IF;
  END LOOP;
END
$$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
ON TABLES FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.sanitize_financiamento_doadores_publicos(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_financiamento_doadores_publicos()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_financiamento_doadores_publicos(jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_financiamento_doadores_publicos()
  TO service_role;

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.candidatos', 'cpf', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not read candidatos.cpf';
  END IF;
  IF has_column_privilege('anon', 'public.financiamento', 'maiores_doadores', 'SELECT') THEN
    RAISE EXCEPTION 'anon must not read financiamento.maiores_doadores';
  END IF;
  IF NOT has_column_privilege('anon', 'public.candidatos', 'slug', 'SELECT') OR
     NOT has_column_privilege('anon', 'public.financiamento', 'maiores_doadores_publicos', 'SELECT') THEN
    RAISE EXCEPTION 'security_invoker public column grants are incomplete';
  END IF;
  IF has_table_privilege('anon', 'public.patrimonio', 'UPDATE') OR
     has_table_privilege('anon', 'public.patrimonio', 'INSERT') OR
     has_table_privilege('anon', 'public.patrimonio', 'DELETE') THEN
    RAISE EXCEPTION 'anon DML remains on patrimonio';
  END IF;
END
$$;

COMMIT;
