DO $readback$
DECLARE
  ledger_count integer;
  restauradas integer;
  marcadas integer;
  curadas integer;
BEGIN
  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260901180000';

  SELECT count(*) INTO restauradas
  FROM public.pontos_atencao p
  WHERE (
      p.id = '2fefa3f5-3b42-4a5a-a72b-2b28d09df018'::uuid
      AND p.candidato_id = '76a6620b-1fd4-46df-806f-5101bd660f7f'::uuid
      AND p.visivel = true
      AND p.titulo = 'Contas irregulares no TCU'
      AND p.despublicacao_motivo IS NULL
      AND p.despublicado_em IS NULL
      AND p.fontes = $j$[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/42733993","data":"2026-08-28","titulo":"TCU — processo com contas julgadas irregulares"}]$j$::jsonb
    ) OR (
      p.id = 'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'::uuid
      AND p.candidato_id = '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
      AND p.visivel = true
      AND p.titulo = 'Contas irregulares no TCU'
      AND p.despublicacao_motivo IS NULL
      AND p.despublicado_em IS NULL
      AND p.fontes = $j$[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/70662366","data":"2026-08-28","titulo":"TCU — processo com contas julgadas irregulares"}]$j$::jsonb
    );

  SELECT count(*) INTO marcadas
  FROM public.pontos_atencao p
  WHERE p.id IN (
      '2fefa3f5-3b42-4a5a-a72b-2b28d09df018'::uuid,
      'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'::uuid
    )
    AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_202_tcu_fontes_2026_09_01';

  -- O rollback nao pode ter tocado nas claims curadas da issue #96.
  SELECT count(*) INTO curadas
  FROM public.pontos_atencao p
  WHERE p.id IN (
      '98d9c7c6-263f-45dd-9442-e568106bae7c'::uuid,
      'a6efc579-1e51-4b2a-9f3e-38eb897183a8'::uuid
    )
    AND p.visivel = true
    AND p.gerado_por = 'curadoria'
    AND p.verificado = true
    AND p.fontes::text LIKE '%pesquisa.apps.tcu.gov.br%';

  IF ledger_count <> 0 OR restauradas <> 2 OR marcadas <> 0 OR curadas <> 2 THEN
    RAISE EXCEPTION
      'rollback readback issue #202: ledger=%, restauradas=%, marcadas=%, curadas=%',
      ledger_count, restauradas, marcadas, curadas;
  END IF;
END
$readback$;
