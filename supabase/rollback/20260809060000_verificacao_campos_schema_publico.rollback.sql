-- ROLLBACK EXECUTAVEL da 20260809060000_verificacao_campos_schema_publico.sql
--
-- NAO EXECUTAR sem confirmacao nomeada.
--
-- ## Por que este arquivo foi reescrito em 09/08/2026
--
-- A primeira versao tentava tirar a coluna da view com `CREATE OR REPLACE VIEW`.
-- Isso NAO funciona, e a prova e o erro do proprio Postgres 17:
--
--     ERROR:  cannot drop columns from view
--
-- `CREATE OR REPLACE VIEW` so aceita ACRESCENTAR coluna no fim. Remover exige
-- DROP, e `public.candidatos_publico` tem duas dependentes que leem dela:
-- `public.v_ficha_candidato` e `public.v_comparador` (ambas
-- `FROM public.candidatos_publico c`, 20260725160000). Logo o DROP e CASCADE, e
-- as tres views precisam voltar, junto com o COMMENT e os GRANTs, que o DROP
-- destroi.
--
-- ## Sem BEGIN/COMMIT proprios
--
-- Mesma razao da migration forward: quem executa envolve tudo, mais a linha do
-- ledger, numa transacao externa unica. Fronteira interna quebraria o dry-run.
--
-- ## O rollback e literal e completo
--
-- Ele desfaz as TRES coisas que a migration forward fez, mais a linha do ledger:
--
--   1. tira a coluna da view publica (DROP CASCADE e recriacao das tres views);
--   2. REVOGA o privilegio de coluna que a forward concedeu;
--   3. DERRUBA a coluna, com guarda fail-closed;
--   4. remove a versao do ledger, na MESMA transacao externa.
--
-- O passo 3 e fail-closed de proposito: em vez de ficar comentado esperando que
-- alguem lembre de conferir, ele PROPRIO confere e LANCA se houver verificacao
-- gravada. Rollback que depende de o operador lembrar de descomentar uma linha
-- nao e rollback, e um bilhete.
--
-- Se ele lancar, a leitura correta e: a etapa 9 ja escreveu, e derrubar a coluna
-- destruiria verificacao real.
--
-- ATENCAO ao que o abort de fato faz. Como o arquivo inteiro roda numa transacao
-- externa unica, o `RAISE EXCEPTION` aborta ESSA transacao e desfaz TAMBEM a
-- recriacao das views e o `REVOKE` do passo 2. O banco fica exatamente como
-- estava antes, com a coluna, o privilegio e a view com a coluna. Nada de
-- parcial sobrevive, e isso e o comportamento seguro.
--
-- Portanto, para tirar so da superficie publica sem derrubar a coluna, rode os
-- passos 1 e 2 em uma execucao SEPARADA, sem o bloco 3. Nao adianta "rodar so
-- ate o REVOKE" dentro deste arquivo: ou a transacao inteira comita, ou ela
-- inteira volta.
--
-- ## Verificado
--
-- Executado de ponta a ponta em Postgres 17 efemero: aplicado o conjunto de
-- schema com a 20260809060000, rodado este rollback, e o `pg_dump --schema-only`
-- resultante comparado com o do conjunto SEM a migration. Iguais.

DROP VIEW IF EXISTS public.candidatos_publico CASCADE;

CREATE VIEW public.candidatos_publico
WITH (security_invoker = true) AS
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
    ( SELECT array_agg(f.valor ORDER BY f.ord)
        FROM unnest(c.fonte_dados) WITH ORDINALITY AS f(valor, ord)
       WHERE f.valor NOT LIKE 'interno:%') AS fonte_dados,
    ultima_atualizacao
   FROM public.candidatos c
  WHERE status <> 'removido'::text AND publicavel = true;

COMMENT ON VIEW public.candidatos_publico IS
  'View publica de candidatos publicaveis. A coluna idade e derivada de data_nascimento quando candidatos.idade esta vazia (mesma regra de public.v_comparador), para ficha, API publica, card e embed convergirem com o comparador. Etapa 2C da auditoria de 2026-07-24.';

CREATE VIEW public.v_ficha_candidato
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.nome_completo,
  c.nome_urna,
  c.slug,
  c.data_nascimento,
  c.idade,
  c.naturalidade,
  c.formacao,
  c.profissao_declarada,
  c.genero,
  c.estado_civil,
  c.cor_raca,
  c.partido_atual,
  c.partido_sigla,
  c.cargo_atual,
  c.cargo_disputado,
  c.estado,
  c.status,
  c.situacao_candidatura,
  c.biografia,
  c.foto_url,
  c.site_campanha,
  c.redes_sociais,
  c.fonte_dados,
  c.ultima_atualizacao,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id) AS total_processos,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id AND p.tipo = 'criminal') AS processos_criminais,
  (SELECT COUNT(*) FROM public.mudancas_partido mp WHERE mp.candidato_id = c.id) AS total_mudancas_partido,
  (
    SELECT COUNT(*)
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
  ) AS total_pontos_atencao,
  (
    SELECT COUNT(*)
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
      AND pa.categoria <> 'feito_positivo'
      AND pa.gravidade = 'critica'
  ) AS pontos_criticos,
  (SELECT pat.valor_total FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS ultimo_patrimonio,
  (SELECT pat.ano_eleicao FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS ano_ultimo_patrimonio
FROM public.candidatos_publico c;

CREATE VIEW public.v_comparador
WITH (security_invoker = true)
AS
SELECT
  c.id,
  c.nome_urna,
  c.slug,
  c.partido_sigla,
  c.cargo_disputado,
  c.estado,
  c.foto_url,
  COALESCE(c.idade, EXTRACT(YEAR FROM age(CURRENT_DATE, c.data_nascimento))::INTEGER) AS idade,
  c.formacao,
  (SELECT COUNT(*) FROM public.processos p WHERE p.candidato_id = c.id) AS total_processos,
  (SELECT COUNT(*) FROM public.mudancas_partido mp WHERE mp.candidato_id = c.id) AS mudancas_partido,
  (
    SELECT COUNT(*)
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
      AND pa.categoria <> 'feito_positivo'
      AND pa.gravidade IN ('critica', 'alta')
  ) AS alertas_graves,
  (SELECT pat.valor_total FROM public.patrimonio pat WHERE pat.candidato_id = c.id ORDER BY pat.ano_eleicao DESC LIMIT 1) AS patrimonio_declarado,
  (
    SELECT json_agg(json_build_object('titulo', pa.titulo, 'categoria', pa.categoria, 'gravidade', pa.gravidade))
    FROM public.pontos_atencao pa
    WHERE pa.candidato_id = c.id
      AND public.is_public_attention_point(pa.visivel, pa.gerado_por, pa.verificado, pa.gravidade, pa.fontes)
  ) AS pontos_atencao
FROM public.candidatos_publico c;

GRANT SELECT ON public.candidatos_publico TO anon, authenticated;
GRANT SELECT ON public.v_ficha_candidato TO anon, authenticated;
GRANT SELECT ON public.v_comparador TO anon, authenticated;

-- 2. Revogar o privilegio de coluna concedido pela forward. Vale por si: se o
--    passo 3 nao puder rodar, isto ja tira `anon`/`authenticated` da coluna.
REVOKE SELECT (verificacao_campos) ON TABLE public.candidatos FROM anon, authenticated;

-- 3. Derrubar a coluna, com guarda fail-closed. Nada de linha comentada.
DO $rollback$
DECLARE
  gravadas bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'candidatos'
      AND column_name = 'verificacao_campos'
  ) THEN
    RAISE NOTICE 'verificacao_campos ja nao existe; nada a derrubar';
    RETURN;
  END IF;

  SELECT count(*) INTO gravadas
  FROM public.candidatos
  WHERE verificacao_campos IS NOT NULL AND verificacao_campos <> '{}'::jsonb;

  IF gravadas > 0 THEN
    RAISE EXCEPTION
      'rollback abortado: % linha(s) com verificacao gravada em verificacao_campos. Derrubar a coluna destruiria verificacao real. Este abort desfez a transacao INTEIRA, inclusive a recriacao das views e o REVOKE: o banco esta como estava. Para tirar so da superficie publica, rode os passos 1 e 2 numa execucao separada, sem este bloco.',
      gravadas;
  END IF;

  ALTER TABLE public.candidatos DROP COLUMN verificacao_campos;
END
$rollback$;

-- 4. Reconciliar o ledger, na MESMA transacao externa. Sem isto o banco afirma
--    ter aplicado uma migration cujo efeito acabou de ser desfeito, que e a
--    divergencia ledger-versus-realidade da issue #131 com o sinal trocado.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260809060000';
