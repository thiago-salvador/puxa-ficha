\set ON_ERROR_STOP on
-- Recibos por candidato para a matriz de cobertura (audit-cobertura-fichas.ts).
-- Leitura pura: transação somente leitura. Todo o histórico por candidato é
-- exportado (não só o último por fonte) porque coletores gravaram famílias
-- diferentes com a mesma fonte `tse` e anos diferentes na mesma execução; o
-- adaptador escolhe o último por família e funde a mesma execução.
-- O arquivo gerado pode conter detalhe antigo com dado pessoal: fica no runner
-- e nunca vai para artefato.
SET default_transaction_read_only = on;
SET statement_timeout = '120s';

-- Coorte de atualização: fichas congeladas depois do turno viram
-- `atualizacao_encerrada` na matriz (audit-cobertura-fichas.ts), não célula
-- aberta. Antes da migration de schema a view não existe e a lista sai vazia.
SELECT to_regclass('public.candidaturas_fase_2026_publico') IS NOT NULL AS pf_tem_fase \gset
\if :pf_tem_fase
\set pf_fase_sql 'SELECT slug, atualizacao_encerrada_em FROM public.candidaturas_fase_2026_publico WHERE atualizacao_encerrada_em IS NOT NULL'
\else
\set pf_fase_sql 'SELECT NULL::text AS slug, NULL::date AS atualizacao_encerrada_em WHERE false'
\endif

SELECT jsonb_build_object(
  'generated_at', now(),
  'atualizacao_encerrada', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('slug', f.slug, 'atualizacao_encerrada_em', f.atualizacao_encerrada_em) ORDER BY f.slug), '[]'::jsonb)
    FROM (:pf_fase_sql) AS f
  ),
  'rows', COALESCE(jsonb_agg(jsonb_build_object(
    'fonte', log.fonte,
    'escopo', log.escopo,
    'alvo', log.alvo,
    'candidato_id', log.candidato_id,
    'executado_em', log.executado_em,
    'resultado', log.resultado,
    'volume', log.volume,
    'url', log.url,
    'detalhe', log.detalhe,
    'execucao', log.execucao
  ) ORDER BY log.id), '[]'::jsonb)
)
FROM public.coleta_log log
WHERE log.escopo = 'candidato';
