-- ============================================================
-- Seed mínimo para guards de migrations parlamentares (legislacao/projetos_lei)
-- em ambiente local / CI (fresh Supabase, sem pipeline data).
--
-- O banco remoto já tem todos esses dados via pipelines.
-- ON CONFLICT DO NOTHING / UPSERT é idempotente em remote.
--
-- Problemas corrigidos por esta migration:
--   1. flavio-bolsonaro: falta historico_politico Senador/RJ
--      (guards em 20260429233000 e 20260501100000)
--   2. aldo-rebelo: ausente em candidatos + falta historico Deputado Federal/SP
--      (guards em 20260430000000, 20260430050000, 20260430071000)
--   3. tarcisio: seed_data.sql usa slug 'tarcisio-de-freitas', mas migrations
--      de legislacao usam slug 'tarcisio' (canônico no remote).
--      Fix: renomear 'tarcisio-de-freitas' -> 'tarcisio' em CI (no-op no remote).
--      + seed historico_politico Governador/SP (guard em 20260430040000)
-- ============================================================

-- 1. Corrige slug tarcisio: 'tarcisio-de-freitas' -> 'tarcisio'
--    Em CI (fresh): seed_data inseriu 'tarcisio-de-freitas'; este UPDATE renomeia.
--    No remote: slug já é 'tarcisio'; WHERE não encontra nada; 0 rows, no-op.
UPDATE candidatos SET slug = 'tarcisio' WHERE slug = 'tarcisio-de-freitas';

-- 2. Seed historico_politico Governador/SP para tarcisio
--    UUID fixo = mesmo do banco remoto; ON CONFLICT (id) DO NOTHING é idempotente.
INSERT INTO historico_politico (
  id, candidato_id, tipo_evento, cargo, cargo_canonico, estado,
  periodo_inicio, periodo_fim, proveniencia
)
SELECT
  '8f400344-39f4-4b26-9a65-482a55729adc'::uuid,
  c.id,
  'mandato',
  'Governador de Sao Paulo',
  'Governador',
  'SP',
  2023,
  NULL::int,
  'manual'
FROM candidatos c
WHERE c.slug = 'tarcisio'
ON CONFLICT (id) DO NOTHING;

-- 3. Seed candidatos row para aldo-rebelo
INSERT INTO candidatos (id, nome_completo, nome_urna, slug, partido_atual, partido_sigla, cargo_disputado, status)
VALUES (
  '16bb5e0e-4315-4dff-b0a9-b0ff54f2f2ae'::uuid,
  'José Aldo Rebelo Figueiredo',
  'Aldo Rebelo',
  'aldo-rebelo',
  'Democracia Cristã',
  'DC',
  'Presidente',
  'pre-candidato'
)
ON CONFLICT (slug) DO NOTHING;

-- 4. Seed historico_politico Deputado Federal/SP para aldo-rebelo
--    UUID fixo = mesmo do banco remoto; ON CONFLICT (id) DO NOTHING é idempotente.
INSERT INTO historico_politico (
  id, candidato_id, tipo_evento, cargo, cargo_canonico, estado,
  periodo_inicio, periodo_fim, proveniencia
)
SELECT
  '7b40cb1c-3d63-427a-9dbf-37b113bde32a'::uuid,
  c.id,
  'mandato',
  'Deputado Federal',
  'Deputado Federal',
  'SP',
  1991,
  1994,
  'manual'
FROM candidatos c
WHERE c.slug = 'aldo-rebelo'
ON CONFLICT (id) DO NOTHING;

-- 5. Seed historico_politico Senador/RJ para flavio-bolsonaro
--    UUID fixo = mesmo do banco remoto; ON CONFLICT (id) DO NOTHING é idempotente.
INSERT INTO historico_politico (
  id, candidato_id, tipo_evento, cargo, cargo_canonico, estado,
  periodo_inicio, periodo_fim, proveniencia
)
SELECT
  'ad046ec0-a829-4b2c-a613-258824033f5c'::uuid,
  c.id,
  'mandato',
  'Senador',
  'Senador',
  'RJ',
  2019,
  NULL::int,
  'manual'
FROM candidatos c
WHERE c.slug = 'flavio-bolsonaro'
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_tarcisio_hp INT;
  v_aldo_cand INT;
  v_aldo_hp INT;
  v_flavio_hp INT;
BEGIN
  SELECT COUNT(*) INTO v_tarcisio_hp
    FROM historico_politico WHERE id = '8f400344-39f4-4b26-9a65-482a55729adc';
  SELECT COUNT(*) INTO v_aldo_cand FROM candidatos WHERE slug = 'aldo-rebelo';
  SELECT COUNT(*) INTO v_aldo_hp
    FROM historico_politico WHERE id = '7b40cb1c-3d63-427a-9dbf-37b113bde32a';
  SELECT COUNT(*) INTO v_flavio_hp
    FROM historico_politico WHERE id = 'ad046ec0-a829-4b2c-a613-258824033f5c';
  RAISE NOTICE 'parlamentares_ci_seed: tarcisio_hp=% aldo_cand=% aldo_hp=% flavio_senador_hp=% (ON CONFLICT pode ter saltado existentes)',
    v_tarcisio_hp, v_aldo_cand, v_aldo_hp, v_flavio_hp;
END $$;
