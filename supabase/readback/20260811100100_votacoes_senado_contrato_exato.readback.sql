-- Readback somente leitura e fail-closed do contrato 20260811100100.
DO $readback$
DECLARE
  v_ledger integer;
  v_constraint integer;
  v_invalidas integer;
  v_assinatura_constraint text;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260811100100';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260811100100: ledger=% (esperado 1)', v_ledger;
  END IF;

  SELECT count(*) INTO v_constraint
    FROM pg_constraint
   WHERE conrelid = 'public.votacoes_chave'::regclass
     AND conname = 'votacoes_chave_senado_exige_evento_exato_check'
     AND convalidated
     AND pg_get_constraintdef(oid) ~ 'casa IS DISTINCT FROM.*Senado'
     AND pg_get_constraintdef(oid) ~ 'fonte =.*senado'
     AND pg_get_constraintdef(oid) ~ 'votacao_id_api IS NOT NULL';
  SELECT md5(regexp_replace(pg_get_constraintdef(oid), '[[:space:]]+', '', 'g'))
    INTO v_assinatura_constraint
    FROM pg_constraint
   WHERE conrelid='public.votacoes_chave'::regclass
     AND conname='votacoes_chave_senado_exige_evento_exato_check';
  SELECT count(*) INTO v_invalidas
    FROM public.votacoes_chave
   WHERE casa = 'Senado'
     AND (fonte IS DISTINCT FROM 'senado' OR votacao_id_api IS NULL OR btrim(votacao_id_api) = '');
  IF v_constraint <> 1 OR v_invalidas <> 0
     OR v_assinatura_constraint IS DISTINCT FROM 'ca437759d753dde40d2f9888bfa6bcf0' THEN
    RAISE EXCEPTION 'readback 20260811100100: constraint=% linhas_invalidas=% assinatura_constraint=%',
      v_constraint, v_invalidas, v_assinatura_constraint;
  END IF;
END
$readback$;

SELECT votacao_id_api, titulo, data_votacao
  FROM public.votacoes_chave
 WHERE casa = 'Senado'
 ORDER BY votacao_id_api;
