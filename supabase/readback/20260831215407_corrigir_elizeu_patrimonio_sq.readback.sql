DO $readback$
DECLARE
  ledger_count integer;
  target_count integer;
  receipt_count integer;
  dr_luisinho_absence_count integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260831215407';

  SELECT count(*) INTO target_count
  FROM public.candidatos c
  JOIN public.patrimonio p ON p.candidato_id = c.id AND p.ano_eleicao = 2026
  JOIN public.chapas_2026 ch ON ch.titular_candidato_id = c.id
  WHERE c.id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    AND c.slug = 'elizeu-aguiar'
    AND c.sq_candidato_2026 = '180002549920'
    AND ch.chave = '2026:PI:elizeu-morais-de-aguiar'
    AND ch.identidade_status = 'confirmada'
    AND ch.vinculo_titular_status = 'confirmado'
    AND ch.titular_sq_candidato = '180002549920'
    AND p.valor_total = 1592808.00
    AND jsonb_array_length(p.bens) = 3
    AND p.bens @> '[{"tipo":"Veículo automotor terrestre: caminhão, automóvel, moto, etc.","descricao":"VEÍCULO TOYOTA COROLLA","valor":802808}]'::jsonb
    AND p.fonte LIKE '%21a7f4bf799f7784e63c13a152f39bcc554239fa24c11a043cdaf572a944f65c%';

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE fonte = 'tse-patrimonio'
    AND alvo = 'elizeu-aguiar'
    AND execucao = 'migration:20260831215407';

  SELECT count(*) INTO dr_luisinho_absence_count
  FROM public.patrimonio_ausencia_oficial
  WHERE id = '07f80302-9048-49f7-9b13-5a992f48e6c0'::uuid;

  IF ledger_count <> 1 OR target_count <> 1 OR receipt_count <> 1
     OR dr_luisinho_absence_count <> 0 THEN
    RAISE EXCEPTION
      'readback patrimonio 2026: ledger=%, alvo=%, receipt=%, ausencia_dr_luisinho=%',
      ledger_count, target_count, receipt_count, dr_luisinho_absence_count;
  END IF;
END
$readback$;

SELECT c.slug, c.sq_candidato_2026, p.ano_eleicao, p.valor_total,
       jsonb_array_length(p.bens) AS n_bens, p.fonte
FROM public.candidatos c
JOIN public.patrimonio p ON p.candidato_id = c.id AND p.ano_eleicao = 2026
WHERE c.id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid;
