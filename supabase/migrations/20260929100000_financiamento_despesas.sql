BEGIN;

-- Despesas de campanha declaradas na prestação de contas do TSE.
--
-- Uma linha por candidatura (candidato, ano, SQ do TSE). Os totais ficam null
-- quando a fonte não informa; zero só quando a prestação declara zero. Os três
-- campos JSONB são calculados em código e nunca levam documento: fornecedor
-- pessoa física aparece só somado, e nomes passam por remoção de sequências de
-- 11 e 14 dígitos antes da escrita.
--
-- Só DDL, sem DML, e idempotente: reaplicar a migration não muda o estado.
--
-- Exposição pública pela view `financiamento_despesas_publico`, com
-- security_invoker. Na tabela base o grant é por coluna, listado um a um:
-- coluna nova acrescentada no futuro nasce sem SELECT para anon, e as colunas
-- operacionais (id_ultima_entrega, tipo_entrega, created_at, updated_at) nunca
-- recebem grant. Escrita só pelo service_role.
--
-- Valores monetários dentro dos JSONB devem chegar arredondados em centavos:
-- o CHECK de documento reprova qualquer sequência de 11 dígitos no texto do
-- JSONB, inclusive casas decimais longas de ponto flutuante.

DO $precondition$
BEGIN
  IF to_regclass('public.candidatos') IS NULL THEN
    RAISE EXCEPTION '20260929100000: tabela public.candidatos ausente';
  END IF;
  IF to_regprocedure('public.is_public_candidate(uuid)') IS NULL THEN
    RAISE EXCEPTION '20260929100000: função public.is_public_candidate(uuid) ausente';
  END IF;
END
$precondition$;

CREATE TABLE IF NOT EXISTS public.financiamento_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  ano_eleicao integer NOT NULL,
  sq_candidato text NOT NULL,
  uf text,
  municipio_codigo text,
  cargo_candidatura text,
  estado_coleta text NOT NULL,
  total_despesas_contratadas numeric(14,2),
  total_despesas_pagas numeric(14,2),
  total_doacoes_a_terceiros numeric(14,2),
  recursos_financeiros numeric(14,2),
  recursos_estimaveis numeric(14,2),
  divida_campanha numeric(14,2),
  sobra_financeira numeric(14,2),
  concentracao_despesas jsonb NOT NULL DEFAULT '[]'::jsonb,
  maiores_fornecedores jsonb NOT NULL DEFAULT '[]'::jsonb,
  doacoes_a_terceiros jsonb NOT NULL DEFAULT '[]'::jsonb,
  prestacao_parcial boolean NOT NULL DEFAULT false,
  data_entrega timestamptz,
  fonte text NOT NULL,
  fonte_url text,
  coletado_em timestamptz NOT NULL,
  despublicado_em timestamptz,
  id_ultima_entrega text,
  tipo_entrega text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financiamento_despesas_candidatura_key
    UNIQUE (candidato_id, ano_eleicao, sq_candidato),
  CONSTRAINT financiamento_despesas_ano_eleicao_check
    CHECK (ano_eleicao BETWEEN 2002 AND 2100 AND ano_eleicao % 2 = 0),
  CONSTRAINT financiamento_despesas_sq_candidato_check
    CHECK (sq_candidato ~ '^[0-9]{1,15}$'),
  CONSTRAINT financiamento_despesas_uf_check
    CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  CONSTRAINT financiamento_despesas_municipio_codigo_check
    CHECK (municipio_codigo IS NULL OR municipio_codigo ~ '^[0-9]{1,7}$'),
  CONSTRAINT financiamento_despesas_estado_coleta_check
    CHECK (estado_coleta IN ('declarado', 'sem_prestacao', 'falha_coleta')),
  CONSTRAINT financiamento_despesas_totais_nao_negativos_check
    CHECK (
      (total_despesas_contratadas IS NULL OR total_despesas_contratadas >= 0)
      AND (total_despesas_pagas IS NULL OR total_despesas_pagas >= 0)
      AND (total_doacoes_a_terceiros IS NULL OR total_doacoes_a_terceiros >= 0)
      AND (recursos_financeiros IS NULL OR recursos_financeiros >= 0)
      AND (recursos_estimaveis IS NULL OR recursos_estimaveis >= 0)
      AND (divida_campanha IS NULL OR divida_campanha >= 0)
      AND (sobra_financeira IS NULL OR sobra_financeira >= 0)
    ),
  CONSTRAINT financiamento_despesas_jsonb_array_check
    CHECK (
      jsonb_typeof(concentracao_despesas) = 'array'
      AND jsonb_typeof(maiores_fornecedores) = 'array'
      AND jsonb_typeof(doacoes_a_terceiros) = 'array'
    ),
  CONSTRAINT financiamento_despesas_jsonb_sem_documento_check
    CHECK (
      concentracao_despesas::text !~* '"[^"]*(cpf|cnpj|documento)[^"]*"\s*:'
      AND maiores_fornecedores::text !~* '"[^"]*(cpf|cnpj|documento)[^"]*"\s*:'
      AND doacoes_a_terceiros::text !~* '"[^"]*(cpf|cnpj|documento)[^"]*"\s*:'
      AND concentracao_despesas::text !~ '[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}'
      AND maiores_fornecedores::text !~ '[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}'
      AND doacoes_a_terceiros::text !~ '[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}|[0-9]{2}\.[0-9]{3}\.[0-9]{3}/[0-9]{4}-[0-9]{2}'
      -- Textos do JSONB com os separadores de documento (espaço, ponto, barra,
      -- hífen) colapsados: "123 456 789 01", "123.456.789/01" e
      -- "12 345 678 0001 90" viram 11 ou 14 dígitos seguidos. Só as folhas de
      -- texto entram, porque o ponto decimal de um valor não é separador.
      AND regexp_replace(jsonb_path_query_array(concentracao_despesas, 'lax $.** ? (@.type() == "string")')::text, '([0-9])[[:space:]./-]+(?=[0-9])', '\1', 'g') !~ '[0-9]{11}'
      AND regexp_replace(jsonb_path_query_array(maiores_fornecedores, 'lax $.** ? (@.type() == "string")')::text, '([0-9])[[:space:]./-]+(?=[0-9])', '\1', 'g') !~ '[0-9]{11}'
      AND regexp_replace(jsonb_path_query_array(doacoes_a_terceiros, 'lax $.** ? (@.type() == "string")')::text, '([0-9])[[:space:]./-]+(?=[0-9])', '\1', 'g') !~ '[0-9]{11}'
    ),
  CONSTRAINT financiamento_despesas_fonte_check
    CHECK (btrim(fonte) <> ''),
  CONSTRAINT financiamento_despesas_fonte_url_check
    CHECK (fonte_url IS NULL OR fonte_url ~ '^https?://')
);

COMMENT ON TABLE public.financiamento_despesas IS
  'Despesas de campanha por candidatura (prestação de contas do TSE). Sem documento de fornecedor; leitura pública só pela view financiamento_despesas_publico.';
COMMENT ON COLUMN public.financiamento_despesas.estado_coleta IS
  'declarado: prestação lida (lista vazia = zero declarado); sem_prestacao: nada entregue até a coleta; falha_coleta: a leitura falhou.';
COMMENT ON COLUMN public.financiamento_despesas.maiores_fornecedores IS
  'Até 10 fornecedores pessoa jurídica por valor, mais uma linha PF_agregado com a soma das pessoas físicas. Sem CPF nem CNPJ.';

ALTER TABLE public.financiamento_despesas ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.financiamento_despesas FROM PUBLIC;
REVOKE ALL ON TABLE public.financiamento_despesas FROM anon, authenticated;
REVOKE ALL ON TABLE public.financiamento_despesas FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.financiamento_despesas TO service_role;
GRANT SELECT (
  id,
  candidato_id,
  ano_eleicao,
  sq_candidato,
  uf,
  municipio_codigo,
  cargo_candidatura,
  estado_coleta,
  total_despesas_contratadas,
  total_despesas_pagas,
  total_doacoes_a_terceiros,
  recursos_financeiros,
  recursos_estimaveis,
  divida_campanha,
  sobra_financeira,
  concentracao_despesas,
  maiores_fornecedores,
  doacoes_a_terceiros,
  prestacao_parcial,
  data_entrega,
  fonte,
  fonte_url,
  coletado_em,
  despublicado_em
) ON TABLE public.financiamento_despesas TO anon, authenticated;

DROP POLICY IF EXISTS "Leitura pública" ON public.financiamento_despesas;
CREATE POLICY "Leitura pública"
  ON public.financiamento_despesas
  FOR SELECT
  TO anon, authenticated
  USING (public.is_public_candidate(candidato_id) AND despublicado_em IS NULL);

CREATE OR REPLACE VIEW public.financiamento_despesas_publico
WITH (security_invoker = true) AS
SELECT
  d.id,
  d.candidato_id,
  d.ano_eleicao,
  d.sq_candidato,
  d.uf,
  d.municipio_codigo,
  d.cargo_candidatura,
  d.estado_coleta,
  d.total_despesas_contratadas,
  d.total_despesas_pagas,
  d.total_doacoes_a_terceiros,
  d.recursos_financeiros,
  d.recursos_estimaveis,
  d.divida_campanha,
  d.sobra_financeira,
  d.concentracao_despesas,
  d.maiores_fornecedores,
  d.doacoes_a_terceiros,
  d.prestacao_parcial,
  d.data_entrega,
  d.fonte,
  d.fonte_url,
  d.coletado_em
FROM public.financiamento_despesas AS d
WHERE public.is_public_candidate(d.candidato_id)
  AND d.despublicado_em IS NULL;

COMMENT ON VIEW public.financiamento_despesas_publico IS
  'Despesas de campanha das candidaturas publicadas. Sem documento e sem colunas operacionais.';

-- A view é atualizável automaticamente (uma tabela, sem agregação): os
-- privilégios padrão do schema dariam escrita a anon por ela. REVOKE antes do
-- GRANT deixa só leitura.
REVOKE ALL ON TABLE public.financiamento_despesas_publico FROM PUBLIC;
REVOKE ALL ON TABLE public.financiamento_despesas_publico FROM anon, authenticated;
REVOKE ALL ON TABLE public.financiamento_despesas_publico FROM service_role;
GRANT SELECT ON TABLE public.financiamento_despesas_publico TO anon, authenticated;
GRANT SELECT ON TABLE public.financiamento_despesas_publico TO service_role;

DO $postcondition$
DECLARE
  v_publicas text[] := ARRAY[
    'id', 'candidato_id', 'ano_eleicao', 'sq_candidato', 'uf', 'municipio_codigo',
    'cargo_candidatura', 'estado_coleta', 'total_despesas_contratadas',
    'total_despesas_pagas', 'total_doacoes_a_terceiros', 'recursos_financeiros',
    'recursos_estimaveis', 'divida_campanha', 'sobra_financeira',
    'concentracao_despesas', 'maiores_fornecedores', 'doacoes_a_terceiros',
    'prestacao_parcial', 'data_entrega', 'fonte', 'fonte_url', 'coletado_em'
  ];
  v_privadas text[] := ARRAY[
    'id_ultima_entrega', 'tipo_entrega', 'created_at', 'updated_at'
  ];
  v_papel text;
  v_coluna text;
  v_privilegio text;
  v_relacao text;
  v_colunas_tabela text;
  v_colunas_view text;
  v_vazado text;
BEGIN
  SELECT string_agg(column_name, ',' ORDER BY column_name) INTO v_colunas_tabela
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'financiamento_despesas';
  IF v_colunas_tabela IS DISTINCT FROM (
    SELECT string_agg(c, ',' ORDER BY c)
      FROM unnest(v_publicas || v_privadas || ARRAY['despublicado_em']) AS c
  ) THEN
    RAISE EXCEPTION '20260929100000: colunas da tabela divergiram: %', v_colunas_tabela;
  END IF;

  SELECT string_agg(column_name, ',' ORDER BY ordinal_position) INTO v_colunas_view
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'financiamento_despesas_publico';
  IF v_colunas_view IS DISTINCT FROM array_to_string(v_publicas, ',') THEN
    RAISE EXCEPTION '20260929100000: colunas da view divergiram: %', v_colunas_view;
  END IF;

  SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_vazado
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name IN ('financiamento_despesas', 'financiamento_despesas_publico')
     AND (column_name ILIKE '%cpf%' OR column_name ILIKE '%cnpj%'
          OR column_name ILIKE '%hash%' OR column_name ILIKE '%documento%');
  IF v_vazado IS NOT NULL THEN
    RAISE EXCEPTION '20260929100000: coluna de documento na superfície pública: %', v_vazado;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.financiamento_despesas'::regclass) THEN
    RAISE EXCEPTION '20260929100000: tabela sem RLS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'financiamento_despesas'
       AND policyname = 'Leitura pública' AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION '20260929100000: policy de leitura pública ausente';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.financiamento_despesas_publico'::regclass
       AND coalesce(reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']
  ) THEN
    RAISE EXCEPTION '20260929100000: view pública não é security_invoker';
  END IF;

  FOREACH v_papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_coluna IN ARRAY v_publicas || ARRAY['despublicado_em'] LOOP
      IF NOT has_column_privilege(v_papel, 'public.financiamento_despesas', v_coluna, 'SELECT') THEN
        RAISE EXCEPTION '20260929100000: % sem SELECT na coluna %', v_papel, v_coluna;
      END IF;
    END LOOP;

    FOREACH v_coluna IN ARRAY v_privadas LOOP
      IF has_column_privilege(v_papel, 'public.financiamento_despesas', v_coluna, 'SELECT') THEN
        RAISE EXCEPTION '20260929100000: % com SELECT na coluna privada %', v_papel, v_coluna;
      END IF;
    END LOOP;

    IF has_table_privilege(v_papel, 'public.financiamento_despesas', 'SELECT') THEN
      RAISE EXCEPTION '20260929100000: % com SELECT de tabela inteira', v_papel;
    END IF;

    IF NOT has_table_privilege(v_papel, 'public.financiamento_despesas_publico', 'SELECT') THEN
      RAISE EXCEPTION '20260929100000: % sem SELECT na view pública', v_papel;
    END IF;

    FOREACH v_relacao IN ARRAY ARRAY['public.financiamento_despesas', 'public.financiamento_despesas_publico'] LOOP
      FOREACH v_privilegio IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
        IF has_table_privilege(v_papel, v_relacao, v_privilegio) THEN
          RAISE EXCEPTION '20260929100000: % com % em %', v_papel, v_privilegio, v_relacao;
        END IF;
      END LOOP;
      FOREACH v_privilegio IN ARRAY ARRAY['INSERT', 'UPDATE', 'REFERENCES'] LOOP
        IF has_any_column_privilege(v_papel, v_relacao, v_privilegio) THEN
          RAISE EXCEPTION '20260929100000: % com % de coluna em %', v_papel, v_privilegio, v_relacao;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.financiamento_despesas', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.financiamento_despesas', 'UPDATE')
     OR NOT has_table_privilege('service_role', 'public.financiamento_despesas', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.financiamento_despesas_publico', 'SELECT') THEN
    RAISE EXCEPTION '20260929100000: service_role sem os privilégios de escrita e leitura esperados';
  END IF;
END
$postcondition$;

COMMIT;
