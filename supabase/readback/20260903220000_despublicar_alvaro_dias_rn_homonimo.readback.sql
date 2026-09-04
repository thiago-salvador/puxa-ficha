DO $readback$
DECLARE
  ledger_count integer;
  hist_fora integer;
  fin_fora integer;
  hist_restante integer;
  receipt_count integer;
  motivo_vazio integer;
  fin_publico numeric;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260903220000';
  IF ledger_count <> 1 THEN
    RAISE EXCEPTION 'readback alvaro-dias-rn homonimo: ledger sem a migration (count=%)', ledger_count;
  END IF;

  SELECT count(*) INTO hist_fora FROM public.historico_politico
   WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NOT NULL;
  IF hist_fora <> 6 THEN
    RAISE EXCEPTION 'readback alvaro-dias-rn homonimo: esperava 6 linhas de historico despublicadas, encontrei %', hist_fora;
  END IF;

  SELECT count(*) INTO fin_fora FROM public.financiamento
   WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NOT NULL;
  IF fin_fora <> 2 THEN
    RAISE EXCEPTION 'readback alvaro-dias-rn homonimo: esperava 2 linhas de financiamento despublicadas, encontrei %', fin_fora;
  END IF;

  -- O erro OPOSTO, e o mais caro: a migration comer mandato verdadeiro do Rio
  -- Grande do Norte. Se este numero cair, a despublicacao passou do alvo.
  SELECT count(*) INTO hist_restante FROM public.historico_politico
   WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NULL;
  IF hist_restante <> 12 THEN
    RAISE EXCEPTION 'readback alvaro-dias-rn homonimo: esperava 12 linhas no ar, encontrei %', hist_restante;
  END IF;

  -- Despublicar sem motivo e apagar sem rastro. Todo registro tirado do ar tem
  -- de dizer por que saiu.
  SELECT count(*) INTO motivo_vazio FROM (
    SELECT despublicacao_motivo FROM public.historico_politico
     WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NOT NULL
    UNION ALL
    SELECT despublicacao_motivo FROM public.financiamento
     WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND despublicado_em IS NOT NULL
  ) t WHERE coalesce(btrim(despublicacao_motivo), '') = '';
  IF motivo_vazio <> 0 THEN
    RAISE EXCEPTION 'readback alvaro-dias-rn homonimo: % linha(s) despublicada(s) sem motivo', motivo_vazio;
  END IF;

  -- O efeito que o leitor ve: a view publica de financiamento nao pode mais
  -- somar o dinheiro do homonimo nesta ficha.
  IF to_regclass('public.financiamento_publico') IS NOT NULL THEN
    EXECUTE $q$SELECT coalesce(sum(total_receitas), 0) FROM public.financiamento_publico WHERE candidato_id = 'c89aaf3b-a9a7-4a95-856a-5b65df38cc80'::uuid AND ano IN (2018, 2022)$q$
      INTO fin_publico;
    IF fin_publico <> 0 THEN
      RAISE EXCEPTION 'readback alvaro-dias-rn homonimo: financiamento_publico ainda soma % em 2018/2022', fin_publico;
    END IF;
  END IF;

  SELECT count(*) INTO receipt_count
  FROM public.coleta_log
  WHERE execucao = 'migration:20260903220000' AND detalhe IS NOT NULL;
  IF receipt_count <> 1 THEN
    RAISE EXCEPTION 'readback alvaro-dias-rn homonimo: recibo de pre-imagem ausente ou duplicado (%)', receipt_count;
  END IF;
END
$readback$;
