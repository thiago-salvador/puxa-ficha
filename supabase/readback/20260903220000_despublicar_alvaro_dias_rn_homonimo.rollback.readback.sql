DO $readback$
DECLARE
  ledger_count integer;
  divergentes integer;
  rollback_receipt_count integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903220000';
  IF ledger_count <> 0 THEN
    RAISE EXCEPTION 'rollback readback alvaro-dias-rn homonimo: migration ainda no ledger';
  END IF;

  SELECT count(*) INTO divergentes
  FROM (
    SELECT split_part(kv.key, ':', 1) AS tabela,
           (split_part(kv.key, ':', 2))::uuid AS id,
           kv.value AS valor
    FROM public.coleta_log r,
         jsonb_each(r.detalhe::jsonb) AS kv
    WHERE r.execucao = 'migration:20260903220000'
  ) pre
  LEFT JOIN (
    SELECT 'historico_politico'::text AS tabela, id, despublicado_em, despublicacao_motivo
      FROM public.historico_politico
    UNION ALL
    SELECT 'financiamento'::text, id, despublicado_em, despublicacao_motivo
      FROM public.financiamento
  ) atual ON atual.tabela = pre.tabela AND atual.id = pre.id
  WHERE atual.id IS NULL
     OR atual.despublicado_em IS DISTINCT FROM (pre.valor ->> 'despublicado_em')::timestamptz
     OR atual.despublicacao_motivo IS DISTINCT FROM (pre.valor ->> 'despublicacao_motivo');
  IF divergentes <> 0 THEN
    RAISE EXCEPTION 'rollback readback alvaro-dias-rn homonimo: % linha(s) diferentes da pre-imagem', divergentes;
  END IF;

  SELECT count(*) INTO rollback_receipt_count
  FROM public.coleta_log
  WHERE execucao = 'rollback:20260903220000';
  IF rollback_receipt_count <> 1 THEN
    RAISE EXCEPTION 'rollback readback alvaro-dias-rn homonimo: recibo de rollback ausente ou duplicado (%)', rollback_receipt_count;
  END IF;
END
$readback$;
