-- Etapa 6 da re-verificacao: SCHEMA PURO de `verificacao_campos`.
--
-- A intencao vem de 20260807052000_b2_current_profiles_tse_2026.sql, que
-- continua RETIDA por carregar dado de ficha no mesmo arquivo (issue #136:
-- migration que cria objeto persistente nao carrega dado de ficha). Aqui vai SO
-- a estrutura: coluna, privilegio de coluna e a view publica. Zero INSERT, zero
-- UPDATE, zero DELETE, zero linha de candidato.
--
-- A view e derivada da definicao de REGISTRO em vigor,
-- 20260803142851_fonte_dados_prefixo_interno_fora_da_superficie_publica.sql,
-- e nao da copia que vive na migration retida. As duas sao equivalentes hoje
-- (as duas trazem o filtro `interno:%`), mas a de registro e a que o banco
-- aplicou e a que o replay de schema reproduz; copiar da retida seria depender
-- de um arquivo que ninguem aplicou. `tests/candidatos-publico-view-contrato.test.ts`
-- confere essa derivacao por parse, para deixar de depender de leitura humana.
--
-- Classificacao esperada: `schema`, `mista: false`. Em
-- scripts/audit/lib/migrations-classificacao.ts a classe so vira `curadoria`
-- por DML em tabela de conteudo, e ALTER TABLE, GRANT e CREATE VIEW sobre
-- `candidatos` nao sao DML. Sem statement de escrita, tambem nao ha anotacao de
-- escrita auditada a declarar.
--
-- Todos os statements sao idempotentes: no banco atual criam a coluna e
-- substituem a view no lugar; num Postgres vazio do replay, idem.
--
-- SEM `BEGIN;`/`COMMIT;` PROPRIOS, e isso e requisito, nao estilo. O
-- procedimento canonico desta casa aplica DDL mais a linha do ledger na MESMA
-- transacao externa (Settings/WORKFLOWS.md). Um `COMMIT;` no meio do arquivo
-- encerraria essa transacao ANTES da gravacao do ledger, quebrando a
-- atomicidade e o dry-run em `BEGIN ... ROLLBACK`: a DDL ficaria aplicada e o
-- rollback nao a desfaria. A 20260809052600, aplicada por esse mesmo
-- procedimento, tambem nao tem fronteiras internas. Sob
-- `psql --single-transaction`, que e como o replay roda, um BEGIN interno ainda
-- emite "there is already a transaction in progress" e o COMMIT interno fecha a
-- transacao do harness.

ALTER TABLE public.candidatos
  ADD COLUMN IF NOT EXISTS verificacao_campos jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.candidatos.verificacao_campos IS
  'Data de verificacao por campo. Chave presente significa campo verificado (publicado ou vazio_confirmado). Chave AUSENTE preserva a data anterior no merge com ||; null a apagaria. Contrato e vocabulario em src/lib/verificacao-campos.ts.';

-- Este GRANT e carregante, nao decorativo. A 20260712003000 fez
-- `REVOKE SELECT ON TABLE public.candidatos FROM PUBLIC, anon, authenticated` e
-- devolveu privilegio coluna a coluna. Coluna nova nasce com `attacl` vazio, ou
-- seja, sem privilegio nenhum. Como `candidatos_publico` e `security_invoker`,
-- sem esta linha a leitura publica falharia com 42501, mensagem que NAO casa com
-- `isMissingVerificationColumnError` em src/lib/api.ts e portanto NAO cairia no
-- CANDIDATO_COLUMNS_LEGACY: a ficha inteira degradaria em vez de degradar so a
-- coluna.
GRANT SELECT (verificacao_campos) ON TABLE public.candidatos TO anon, authenticated;

-- Definicao de registro (20260803142851) mais a coluna nova NO FIM da lista, que
-- e a unica alteracao que CREATE OR REPLACE VIEW aceita: colunas existentes nao
-- podem ser removidas, renomeadas, reordenadas nem ter o tipo trocado.
--
-- `security_invoker = true` e reafirmado de proposito. CREATE OR REPLACE
-- preserva reloptions, mas deixar implicito seria contar com isso em silencio, e
-- a 20260712003000 existe justamente porque essa opcao importa.
--
-- O COMMENT ON VIEW da 20260725170000 NAO e reemitido: CREATE OR REPLACE nao
-- dropa o objeto, o OID e preservado e a linha de pg_description continua
-- valendo. Nunca trocar isto por DROP VIEW: derrubaria o comentario, o GRANT da
-- view e as dependentes v_comparador e v_ficha_candidato.
CREATE OR REPLACE VIEW public.candidatos_publico
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
    ultima_atualizacao,
    verificacao_campos
   FROM public.candidatos c
  WHERE status <> 'removido'::text AND publicavel = true;

GRANT SELECT ON public.candidatos_publico TO anon, authenticated;
