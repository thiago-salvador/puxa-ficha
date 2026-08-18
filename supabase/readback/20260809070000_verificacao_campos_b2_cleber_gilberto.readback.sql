-- Readback somente leitura e fail-closed da 20260809070000.
DO $readback$
DECLARE
  v_ledger integer;
  v_alvos integer;
BEGIN
  SELECT count(*) INTO v_ledger
    FROM supabase_migrations.schema_migrations
   WHERE version = '20260809070000';
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'readback 20260809070000: ledger=% (esperado 1)', v_ledger;
  END IF;

  SELECT count(*) INTO v_alvos
    FROM public.candidatos
   WHERE (slug, cargo_disputado, estado, partido_sigla) IN (
           ('cleber-rabelo', 'Governador', 'PA', 'PSTU'),
           ('gilberto-vasconcelos', 'Governador', 'AM', 'PSTU')
         )
     AND verificacao_campos ->> 'candidate_registration' = '2026-08-06'
     AND verificacao_campos ->> 'candidate_complement' = '2026-08-06'
     AND verificacao_campos ->> 'social_networks' = '2026-08-06';
  IF v_alvos <> 2 THEN
    RAISE EXCEPTION 'readback 20260809070000: payload valido=% de 2 fichas', v_alvos;
  END IF;
END
$readback$;

SELECT slug, cargo_disputado, estado, partido_sigla, verificacao_campos
  FROM public.candidatos
 WHERE slug IN ('cleber-rabelo', 'gilberto-vasconcelos')
 ORDER BY slug;
