-- Readback somente leitura e fail-closed do dataset v2 20260810090200.
DO $readback$
DECLARE
  v_ledger integer;
  v_esperadas integer;
  v_extras integer;
  v_duplicadas integer;
  v_assinatura_payload text;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810090200';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260810090200: ledger=% (esperado 1)', v_ledger;
  END IF;

  SELECT count(*) INTO v_esperadas
    FROM public.votacoes_chave
   WHERE fonte = 'camara'
     AND votacao_id_api IN (
       '14493-503','2123843-93','340812-195','2270800-135',
       '2515648-44','2351506-122','2383019-54','2473389-58',
       '2494565-52','2430143-140','2409076-34','2324721-94'
     );
  SELECT count(*) INTO v_extras
    FROM public.votacoes_chave
   WHERE fonte = 'camara'
     AND votacao_id_api NOT IN (
       '14493-503','2123843-93','340812-195','2270800-135',
       '2515648-44','2351506-122','2383019-54','2473389-58',
       '2494565-52','2430143-140','2409076-34','2324721-94'
     );
  SELECT count(*) INTO v_duplicadas
    FROM (
      SELECT votacao_id_api FROM public.votacoes_chave
       WHERE fonte = 'camara'
       GROUP BY votacao_id_api HAVING count(*) <> 1
    ) d;
  IF v_esperadas <> 12 OR v_extras <> 0 OR v_duplicadas <> 0 THEN
    RAISE EXCEPTION 'readback 20260810090200: esperadas=% extras=% duplicadas=%', v_esperadas, v_extras, v_duplicadas;
  END IF;
  SELECT md5(string_agg(
           concat_ws(chr(30), coalesce(titulo,'<null>'), coalesce(descricao,'<null>'),
             coalesce(data_votacao::text,'<null>'), coalesce(casa,'<null>'),
             coalesce(fonte,'<null>'), coalesce(votacao_id_api,'<null>'),
             coalesce(proposicao_id,'<null>'), coalesce(tema,'<null>'),
             coalesce(impacto_popular,'<null>')),
           chr(31) ORDER BY votacao_id_api))
    INTO v_assinatura_payload
    FROM public.votacoes_chave
   WHERE fonte = 'camara';
  IF v_assinatura_payload IS DISTINCT FROM 'f8cc5853102457caaa3e3d4b7326ea55' THEN
    RAISE EXCEPTION 'readback 20260810090200: assinatura_payload=%', v_assinatura_payload;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.votacoes_chave
     WHERE fonte = 'camara' AND votacao_id_api = '2143164-138'
  ) THEN
    RAISE EXCEPTION 'readback 20260810090200: item retirado 2143164-138 foi publicado';
  END IF;
END
$readback$;

SELECT votacao_id_api, titulo, data_votacao, proposicao_id
  FROM public.votacoes_chave
 WHERE fonte = 'camara'
 ORDER BY votacao_id_api;
