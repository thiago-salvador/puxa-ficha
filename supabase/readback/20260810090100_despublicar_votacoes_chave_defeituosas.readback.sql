-- Readback somente leitura e fail-closed da despublicacao 20260810090100.
DO $readback$
DECLARE
  v_ledger integer;
  v_votacoes integer;
  v_pares integer;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260810090100';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260810090100: ledger=% (esperado 1)', v_ledger;
  END IF;

  SELECT count(*) INTO v_votacoes
    FROM public.votacoes_chave
   WHERE id IN (
     'a7c70604-5116-4545-a2a4-a00a7761af43',
     '9c1f05a7-fe8d-4c45-8827-ca23d029b1a0',
     'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0',
     'a539c15d-20a0-4e55-876b-a7bbba7ef0d2',
     'd652e083-aa23-4df9-a66f-433816d330cc',
     '86e0edac-52a5-44fe-b699-1c09aaf42a32'
   );
  SELECT count(*) INTO v_pares
    FROM public.votos_candidato
   WHERE votacao_id IN (
     'a7c70604-5116-4545-a2a4-a00a7761af43',
     '9c1f05a7-fe8d-4c45-8827-ca23d029b1a0',
     'b2aa93fb-faa1-423c-bae7-70ea6ff35fe0',
     'a539c15d-20a0-4e55-876b-a7bbba7ef0d2',
     'd652e083-aa23-4df9-a66f-433816d330cc',
     '86e0edac-52a5-44fe-b699-1c09aaf42a32'
   );
  IF v_votacoes <> 0 OR v_pares <> 0 THEN
    RAISE EXCEPTION 'readback 20260810090100: votacoes_residuais=% pares_residuais=%', v_votacoes, v_pares;
  END IF;
END
$readback$;

SELECT '20260810090100' AS versao, 0 AS votacoes_residuais, 0 AS pares_residuais;
