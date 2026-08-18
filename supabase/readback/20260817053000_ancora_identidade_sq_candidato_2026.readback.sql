-- Readback de 20260817053000. Rode DEPOIS de aplicar em produção.
-- Espera-se: coluna presente, CHECK presente, índice único presente,
-- zero fora de formato e zero sequencial duplicado.

SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='candidatos'
      AND column_name='sq_candidato_2026')                        AS coluna_existe,
  (SELECT COUNT(*) FROM pg_constraint
    WHERE conrelid='public.candidatos'::regclass
      AND conname='candidatos_sq_candidato_2026_formato')          AS check_existe,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname='public'
      AND indexname='candidatos_sq_candidato_2026_unico')          AS indice_existe,
  (SELECT COUNT(*) FROM public.candidatos
    WHERE sq_candidato_2026 IS NOT NULL
      AND sq_candidato_2026 !~ '^[0-9]{9,15}$')                    AS fora_do_formato,
  (SELECT COUNT(*) FROM (
     SELECT sq_candidato_2026 FROM public.candidatos
      WHERE sq_candidato_2026 IS NOT NULL
      GROUP BY sq_candidato_2026 HAVING COUNT(*) > 1) d)           AS duplicados;

-- Cobertura da âncora entre as fichas no ar. Depois do backfill, espera-se que
-- as 206 do universo oficial estejam preenchidas.
SELECT
  COUNT(*)                                                          AS publicaveis,
  COUNT(sq_candidato_2026)                                          AS com_ancora,
  COUNT(*) - COUNT(sq_candidato_2026)                               AS sem_ancora
FROM public.candidatos
WHERE publicavel = true AND status <> 'removido';
