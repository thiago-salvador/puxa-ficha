-- Readback somente leitura do estado apos rollback.

DO $assert$
DECLARE
  alvo_count integer;
  forward_receipt_count integer;
  rollback_receipt_count integer;
  ledger_count integer;
BEGIN
  SELECT count(*) INTO alvo_count
  FROM public.votos_candidato
  WHERE id = 'be44d3a0-492b-4e68-9ed7-d812d7ce0e48'::uuid
    AND candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid
    AND votacao_id = '274f2ae4-58dc-43bb-b98c-c170b0fb132c'::uuid
    AND voto = 'ausente'
    AND contradicao = false
    AND contradicao_descricao IS NULL
    AND created_at = '2026-08-15T14:10:32.481313+00:00'::timestamptz;

  SELECT count(*) FILTER (WHERE execucao = 'migration:20260830143500'),
         count(*) FILTER (WHERE execucao = 'rollback:20260830143500')
    INTO forward_receipt_count, rollback_receipt_count
  FROM public.coleta_log
  WHERE fonte = 'camara-votos'
    AND escopo = 'candidato'
    AND alvo = 'jhc'
    AND candidato_id = 'ba62f5d0-3e39-40a7-a0af-ee1d86e97e75'::uuid;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260830143500';

  IF alvo_count <> 1 OR forward_receipt_count <> 1
     OR rollback_receipt_count <> 1 OR ledger_count <> 0 THEN
    RAISE EXCEPTION
      'rollback readback jhc artigo_17 falhou (alvo=%, forward=%, rollback=%, ledger=%)',
      alvo_count, forward_receipt_count, rollback_receipt_count, ledger_count;
  END IF;
END
$assert$;
