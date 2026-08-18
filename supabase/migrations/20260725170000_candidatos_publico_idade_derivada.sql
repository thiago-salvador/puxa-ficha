-- =====================================================================
-- IDADE DERIVADA EM public.candidatos_publico (etapa 2C da auditoria de
-- integridade de 2026-07-24, docs/auditoria-integridade-2026-07-24.md,
-- achado C1.1 reverificado em scratchpad/audit/_c11-corrigido.md).
--
-- O QUE ESTA MIGRATION CORRIGE
--
-- Existem duas views publicas e elas tratam idade de forma diferente:
--
--   public.candidatos_publico  expoe a coluna crua candidatos.idade
--   public.v_comparador        deriva com
--                              COALESCE(idade, EXTRACT(year FROM age(...)))
--                              e le justamente de candidatos_publico
--
-- A coluna crua candidatos.idade esta vazia para 100% dos publicaveis,
-- entao o mesmo candidato aparece com idade no comparador e sem idade na
-- propria ficha, na /api/candidato-profile/[slug], no CandidatoCard e no
-- EmbedWidget. Lula: 80 anos no comparador da home, nenhuma idade na ficha,
-- no mesmo dia.
--
-- A correcao aplica em candidatos_publico o MESMO COALESCE que v_comparador
-- ja usa e ja tem validado em producao. Como v_comparador le de
-- candidatos_publico, as duas superficies passam a convergir por construcao,
-- sem tocar em nenhum componente de React, sem backfill e sem escrever uma
-- linha de dado. O COALESCE mantem a coluna crua com precedencia caso o
-- pipeline de ingestao passe a preenche-la.
--
-- NAO ha UPDATE, INSERT nem DELETE aqui. E troca de projecao de view.
--
-- IDEMPOTENCIA E REVERSAO
--
-- CREATE OR REPLACE VIEW: rodar duas vezes deixa o mesmo estado. A lista de
-- colunas, a ordem e os tipos sao identicos aos atuais, entao a substituicao
-- nao exige DROP e nao quebra public.v_comparador, que depende desta view.
-- Para reverter, basta repetir o CREATE OR REPLACE trocando a expressao de
-- idade de volta pela coluna crua "idade".
--
-- security_invoker = true e declarado explicitamente porque e o valor atual
-- da view (pg_class.reloptions = {security_invoker=true}, consultado em
-- 2026-07-25) e perde-lo silenciosamente trocaria o modelo de permissao.
--
-- VALIDACAO RODADA ANTES DE ESCREVER ESTE ARQUIVO
-- (project_id wskpzsobvqwhnbsdsmok, somente SELECT, 2026-07-25)
--
--   select
--     (select data_type from information_schema.columns
--       where table_schema='public' and table_name='candidatos'
--         and column_name='idade') as candidatos_idade_type,          -- integer
--     (select data_type from information_schema.columns
--       where table_schema='public' and table_name='candidatos_publico'
--         and column_name='idade') as view_idade_type,                -- integer
--     (select count(*) from public.candidatos_publico) as publicaveis, -- 195
--     (select count(*) from public.candidatos_publico
--       where idade is not null) as cp_com_idade,                      -- 0
--     (select count(*) from public.candidatos_publico
--       where data_nascimento is not null) as cp_com_dn,               -- 176
--     (select count(*) from public.v_comparador
--       where idade is not null) as vc_com_idade,                      -- 176
--     (select count(*) from public.candidatos_publico
--       where data_nascimento > CURRENT_DATE) as dn_futura;            -- 0
--
--   select
--     count(*) as publicaveis,                                          -- 195
--     count(*) filter (where COALESCE(idade,
--       (EXTRACT(year FROM age(CURRENT_DATE::timestamptz,
--                              data_nascimento::timestamptz)))::integer)
--       is not null) as com_idade_derivada,                             -- 176
--     min(...) as idade_min,                                            -- 27
--     max(...) as idade_max                                             -- 80
--   from public.candidatos_publico;
--
-- Ou seja: 176 dos 195 publicaveis passam a ter idade (os 19 restantes sao
-- exatamente os que nao tem data_nascimento, e continuam mostrando o estado
-- vazio honesto). Nenhuma data de nascimento no futuro, entao nao ha risco
-- de idade negativa. Faixa resultante 27 a 80 anos, plausivel.
-- =====================================================================

CREATE OR REPLACE VIEW public.candidatos_publico
WITH (security_invoker = true) AS
SELECT
  id,
  nome_completo,
  nome_urna,
  slug,
  data_nascimento,
  -- Antes: a coluna crua "idade", nula em 195 de 195 publicaveis.
  -- Agora: mesma derivacao ja usada e validada em public.v_comparador.
  COALESCE(
    idade,
    (EXTRACT(year FROM age(CURRENT_DATE::timestamptz, data_nascimento::timestamptz)))::integer
  ) AS idade,
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
  fonte_dados,
  ultima_atualizacao
FROM candidatos c
WHERE status <> 'removido'::text AND publicavel = true;

COMMENT ON VIEW public.candidatos_publico IS
  'View publica de candidatos publicaveis. A coluna idade e derivada de data_nascimento quando candidatos.idade esta vazia (mesma regra de public.v_comparador), para ficha, API publica, card e embed convergirem com o comparador. Etapa 2C da auditoria de 2026-07-24.';

-- Verificacao pos-aplicacao sugerida (deve devolver 176 nas duas colunas):
--   select
--     (select count(*) from public.candidatos_publico where idade is not null),
--     (select count(*) from public.v_comparador where idade is not null);
