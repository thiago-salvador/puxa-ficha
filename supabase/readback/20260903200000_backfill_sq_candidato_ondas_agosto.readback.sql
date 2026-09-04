DO $readback$
DECLARE
  ledger_count integer;
  gravados integer;
  colisao integer;
  receipt_count integer;
  chapa_divergente integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903200000';
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'readback backfill sq ondas agosto: ledger sem a migration (count=%)', ledger_count;
  END IF;

  SELECT count(*) INTO gravados
    FROM public.candidatos
   WHERE (id, slug, sq_candidato_2026) IN (
           ('fc3bec40-5a82-4794-aacf-86fc618751b4'::uuid, 'well-macedo', '140002554108'),
           ('4b8485ab-cbe3-4c58-99be-3dfc05d39c5d'::uuid, 'rico-pinheiro', '70002553982'));
  IF gravados <> 2 THEN
    RAISE EXCEPTION 'readback backfill sq ondas agosto: esperava 2 linhas com o SQ gravado, encontrei %', gravados;
  END IF;

  -- Nenhuma OUTRA ficha pode carregar estes dois SQ. SQ duplicado sequestra a
  -- ficha errada no resolver e bloqueia o CPF, que e o dano que esta migration
  -- existe para nao causar.
  SELECT count(*) INTO colisao
    FROM public.candidatos
   WHERE sq_candidato_2026 IN ('140002554108', '70002553982')
     AND slug NOT IN ('well-macedo', 'rico-pinheiro');
  IF colisao <> 0 THEN
    RAISE EXCEPTION 'readback backfill sq ondas agosto: % ficha(s) alheia(s) com o mesmo SQ', colisao;
  END IF;

  -- `chapas_2026` continua concordando com o numero gravado. Se divergir, a
  -- evidencia deixou de estar fechada e o readback tem de reprovar.
  SELECT count(*) INTO chapa_divergente
    FROM public.candidatos c
    JOIN public.chapas_2026 ch ON ch.titular_candidato_id = c.id
   WHERE c.slug IN ('well-macedo', 'rico-pinheiro')
     AND ch.titular_sq_candidato IS DISTINCT FROM c.sq_candidato_2026;
  IF chapa_divergente <> 0 THEN
    RAISE EXCEPTION 'readback backfill sq ondas agosto: % linha(s) de chapas_2026 divergem do SQ gravado', chapa_divergente;
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903200000' AND detalhe IS NOT NULL;
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'readback backfill sq ondas agosto: recibo de pre-imagem ausente ou duplicado (%)', receipt_count;
  END IF;
END
$readback$;
