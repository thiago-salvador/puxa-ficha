DO $readback$
DECLARE
  ledger_count integer;
  target_count integer;
  forward_receipt_count integer;
  rollback_receipt_count integer;
  dr_luisinho_absence_count integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260831215407';

  SELECT count(*) INTO target_count
  FROM public.candidatos c
  JOIN public.patrimonio p ON p.candidato_id = c.id AND p.ano_eleicao = 2026
  WHERE c.id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND c.slug = 'elizeu-aguiar'
    AND c.sq_candidato_2026 IS NULL
    AND p.valor_total = 872808.00
    AND jsonb_array_length(p.bens) = 3
    AND p.bens @> '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":82808}]'::jsonb
    AND p.fonte LIKE '%SQ 180002533958%';

  SELECT count(*) INTO forward_receipt_count
  FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio' AND alvo = 'elizeu-aguiar'
    AND execucao = 'migration:20260831215407';

  SELECT count(*) INTO rollback_receipt_count
  FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio' AND alvo = 'elizeu-aguiar'
    AND execucao = 'rollback:20260831215407';

  SELECT count(*) INTO dr_luisinho_absence_count
  FROM public.patrimonio_ausencia_oficial
  WHERE id = '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid
    AND candidato_id = 'c9c117e4-ea81-433d-b8c0-a01c8d831bae'::uuid
    AND ano_eleicao = 2026
    AND sq_candidato = '10002533539';

  IF ledger_count <> 0 OR target_count <> 1
     OR forward_receipt_count <> 1 OR rollback_receipt_count <> 1
     OR dr_luisinho_absence_count <> 1 THEN
    RAISE EXCEPTION
      'rollback readback elizeu patrimonio sq: ledger=%, alvo=%, forward=%, rollback=%, ausencia_dr_luisinho=%',
      ledger_count, target_count, forward_receipt_count, rollback_receipt_count,
      dr_luisinho_absence_count;
  END IF;
END
$readback$;
