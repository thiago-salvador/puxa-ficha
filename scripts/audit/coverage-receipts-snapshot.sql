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

SELECT jsonb_build_object(
  'generated_at', now(),
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
