-- Sucede 20260916140000. Issue #340 follow-up, redesenho pós-incidente de
-- 20260916150000_refrescar_fonte_detalhe_prtb.sql (mergeado em #357, JAMAIS
-- aplicado: a run de apply 35179453431 abortou limpo com
-- "new row for relation chapas_2026 violates check constraint
-- chapas_2026_fonte_detalhe_check", ledger permaneceu em 20260916140000).
-- Aquele arquivo não é editado no lugar (migration mergeada é imutável
-- neste repositório, mesmo nunca aplicada — mesma convenção de
-- supabase/migrations-pendentes/README.md: "retomada" sempre usa timestamp
-- novo, nunca edita o arquivo antigo); foi removido de supabase/migrations/
-- nesta mesma PR. A escrita de dado que a 20260916150000 tentava fazer no
-- MESMO arquivo do alargamento saiu daqui: o gate do repositório recusa
-- migration nova que mistura DDL persistente com dado de ficha (teste
-- "nenhuma migration nova mistura DDL persistente com dado de ficha",
-- mesmo padrão que já separava 20260916130000 de 20260916140000). O
-- alargamento fica só aqui; a atualização da chapa do PRTB é
-- 20260917000001_refrescar_fonte_detalhe_prtb.sql, que sucede esta.
--
-- =====================================================================
-- A CAUSA RAIZ
-- =====================================================================
--
-- `chapas_2026_fonte_detalhe_check` (criada por
-- 20260907193000_chapas_divulgacand_fonte_direta.sql) exige, para
-- fonte_tipo='divulgacand_detalhe':
--   1. fonte_detalhe->titular->descricao_situacao E fonte_detalhe->vice->
--      descricao_situacao IN ('Aguardando julgamento','Deferido',
--      'Deferido com recurso') -- sem 'Pendente de julgamento'.
--   2. fonte_detalhe->titular->descricao_situacao = tse_situacao_codigo
--      (coluna top-level, distinta de tse_situacao_titular_codigo/
--      tse_situacao_vice_codigo, que para este fonte_tipo têm que ser NULL).
-- A 20260916150000 escrevia 'Pendente de julgamento' nos dois descricao_
-- situacao SEM alargar o domínio nem sincronizar tse_situacao_codigo:
-- violava as duas cláusulas de uma vez. A prova PG17 daquela PR não pegou
-- porque o fixture não tinha a constraint real (só chapas_2026_fonte_
-- detalhe_check era criada; nenhuma outra). A prova desta migration usa a
-- constraint completa, lida de produção via pg_get_constraintdef em
-- 17/09/2026 — ver scripts/audit/provar-pendente-julgamento-fonte-detalhe-check-pg17.sh.
--
-- =====================================================================
-- O QUE ESTA MIGRATION FAZ
-- =====================================================================
--
-- Alarga chapas_2026_fonte_detalhe_check para aceitar 'Pendente de
-- julgamento' no descricao_situacao do titular E do vice (mesmo vocabulário
-- de código 17/consulta_cand_complementar já usado em 20260916130000 para
-- candidatos.situacao_candidatura). Schema puro, sem DML de conteúdo.
--
-- NAO aplicar por `supabase db push` nem por automacao: producao so recebe
-- esta migration pelo workflow apply-pendente-julgamento-fonte-detalhe-check-production.yml,
-- CAS previous_version=20260916140000.
BEGIN;

-- Guard de replay linear: mesma razao da 20260916130000. Alargar um
-- dominio que nunca foi instalado (banco sintetico onde as migrations que
-- criam chapas_2026_fonte_detalhe_check tambem falham por guard) nao e o
-- caso que esta migration precisa cobrir.
DO $alargar$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.chapas_2026'::regclass
       AND conname = 'chapas_2026_fonte_detalhe_check'
       AND contype = 'c'
  ) THEN
    RAISE NOTICE 'pendente-julgamento-fonte-detalhe-check: constraint ausente (replay); alargamento ignorado';
    RETURN;
  END IF;

  ALTER TABLE public.chapas_2026
    DROP CONSTRAINT IF EXISTS chapas_2026_fonte_detalhe_check;

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

  EXECUTE format(
    'COMMENT ON CONSTRAINT chapas_2026_fonte_detalhe_check ON public.chapas_2026 IS %L',
    'Contrato do snapshot congelado fonte_detalhe para fonte_tipo=divulgacand_detalhe. Domínio de descricao_situacao (titular e vice) alargado em 17/09/2026 (issue #340) para incluir ''Pendente de julgamento'' (código 17/consulta_cand_complementar, mesmo código 12 de situacaoVice ao vivo), mesmo vocabulário de candidatos_situacao_candidatura_dominio. Mudou lá, muda aqui.');
END
$alargar$;

DO $conferencia$
DECLARE
  tem_constraint boolean;
  aceita_pendente boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.chapas_2026'::regclass
       AND conname = 'chapas_2026_fonte_detalhe_check'
       AND contype = 'c'
       AND convalidated
  ) INTO tem_constraint;

  IF NOT tem_constraint THEN
    RAISE NOTICE 'pendente-julgamento-fonte-detalhe-check: sem dominio instalado, nada a conferir';
    RETURN;
  END IF;

  SELECT pg_get_constraintdef(oid) LIKE '%Pendente de julgamento%'
    INTO aceita_pendente
    FROM pg_constraint
   WHERE conrelid = 'public.chapas_2026'::regclass
     AND conname = 'chapas_2026_fonte_detalhe_check';
  IF NOT aceita_pendente THEN
    RAISE EXCEPTION 'pendente-julgamento-fonte-detalhe-check: constraint existe mas nao aceita Pendente de julgamento';
  END IF;
END
$conferencia$;

COMMIT;
