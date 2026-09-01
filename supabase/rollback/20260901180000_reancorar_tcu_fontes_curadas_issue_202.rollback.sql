-- Rollback fechado somente da migration 20260901180000.
--
-- Restaura, nas duas linhas automaticas, a fonte do Conecta e a visibilidade
-- que existiam antes, a partir da preimagem guardada em `dados_relacionados`.
-- Nao toca nas claims curadas 98d9c7c6 e a6efc579.

BEGIN;

DO $precondition$
DECLARE
  alvos integer;
  ledger_count integer;
  ledger_top text;
BEGIN
  SELECT count(*) INTO alvos
  FROM public.pontos_atencao p
  WHERE p.id IN (
      '2fefa3f5-3b42-4a5a-a72b-2b28d09df018'::uuid,
      'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'::uuid
    )
    AND p.visivel = false
    AND p.dados_relacionados -> 'issue_202_tcu_fontes_2026_09_01' ->> 'acao'
        = 'fonte reancorada e claim duplicada despublicada'
    AND jsonb_typeof(p.dados_relacionados -> 'issue_202_tcu_fontes_2026_09_01' -> 'fontes_anteriores')
        = 'array';

  SELECT count(*), max(version)
    INTO ledger_count, ledger_top
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260901180000';

  IF alvos <> 2 OR ledger_count <> 1 OR ledger_top <> '20260901180000' THEN
    RAISE EXCEPTION
      'rollback issue #202: precondicao divergiu (alvos=%, ledger_count=%, ledger_top=%)',
      alvos, ledger_count, ledger_top;
  END IF;
END
$precondition$;

-- @write tabela=pontos_atencao ref=issue_202 campos=fontes,visivel,despublicacao_motivo,despublicado_em,dados_relacionados
UPDATE public.pontos_atencao p
SET fontes = p.dados_relacionados -> 'issue_202_tcu_fontes_2026_09_01' -> 'fontes_anteriores',
    visivel = (p.dados_relacionados -> 'issue_202_tcu_fontes_2026_09_01' ->> 'visivel_anterior')::boolean,
    despublicacao_motivo = NULL,
    despublicado_em = NULL,
    dados_relacionados = nullif(
      p.dados_relacionados - 'issue_202_tcu_fontes_2026_09_01',
      '{}'::jsonb
    )
WHERE p.id IN (
    '2fefa3f5-3b42-4a5a-a72b-2b28d09df018'::uuid,
    'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'::uuid
  )
  AND p.visivel = false
  AND p.dados_relacionados -> 'issue_202_tcu_fontes_2026_09_01' ->> 'acao'
      = 'fonte reancorada e claim duplicada despublicada';

DELETE FROM supabase_migrations.schema_migrations
WHERE version = '20260901180000';

DO $postcondition$
DECLARE
  restauradas integer;
  marcadas integer;
  curadas integer;
  ledger_count integer;
BEGIN
  SELECT count(*) INTO restauradas
  FROM public.pontos_atencao p
  WHERE (
      p.id = '2fefa3f5-3b42-4a5a-a72b-2b28d09df018'::uuid
      AND p.visivel = true
      AND p.fontes = $j$[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/42733993","data":"2026-08-28","titulo":"TCU — processo com contas julgadas irregulares"}]$j$::jsonb
    ) OR (
      p.id = 'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'::uuid
      AND p.visivel = true
      AND p.fontes = $j$[{"url":"https://conecta-tcu.apps.tcu.gov.br/tvp/70662366","data":"2026-08-28","titulo":"TCU — processo com contas julgadas irregulares"}]$j$::jsonb
    );

  SELECT count(*) INTO marcadas
  FROM public.pontos_atencao p
  WHERE p.id IN (
      '2fefa3f5-3b42-4a5a-a72b-2b28d09df018'::uuid,
      'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'::uuid
    )
    AND coalesce(p.dados_relacionados, '{}'::jsonb) ? 'issue_202_tcu_fontes_2026_09_01';

  SELECT count(*) INTO curadas
  FROM public.pontos_atencao p
  WHERE p.id IN (
      '98d9c7c6-263f-45dd-9442-e568106bae7c'::uuid,
      'a6efc579-1e51-4b2a-9f3e-38eb897183a8'::uuid
    )
    AND p.visivel = true
    AND p.gerado_por = 'curadoria'
    AND p.verificado = true;

  SELECT count(*) INTO ledger_count
  FROM supabase_migrations.schema_migrations
  WHERE version = '20260901180000';

  IF restauradas <> 2 OR marcadas <> 0 OR curadas <> 2 OR ledger_count <> 0 THEN
    RAISE EXCEPTION
      'rollback issue #202: pos-condicao falhou (restauradas=%, marcadas=%, curadas=%, ledger=%)',
      restauradas, marcadas, curadas, ledger_count;
  END IF;
END
$postcondition$;

COMMIT;
