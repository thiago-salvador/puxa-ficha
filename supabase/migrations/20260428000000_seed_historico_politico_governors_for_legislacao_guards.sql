-- ============================================================
-- Seed mínimo de historico_politico para guards de migrations
-- de legislacao_mandato_executivo rodarem em ambiente local / CI.
-- O banco remoto já tem esses dados via pipelines.
-- IDs são os mesmos do banco remoto; ON CONFLICT DO NOTHING é idempotente.
--
-- Governadores cobertos (e os guards que dependem destes rows):
--   ratinho-junior  PR  2019–present  → guards: periodo <= 2023
--   romeu-zema      MG  2019–present  → guards: periodo <= 2019, <= 2023
--   ronaldo-caiado  GO  2018–2022     → guard: periodo <= 2019
--   ronaldo-caiado  GO  2022–present  → guard: periodo <= 2023
--   ciro-gomes      CE  1991–1994     → guard: periodo <= 1991
--   tarcisio        SP  2023–present  → guard: periodo <= 2023 (promote migration)
-- ============================================================

INSERT INTO historico_politico (
  id,
  candidato_id,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  proveniencia
)
SELECT
  vals.row_id,
  c.id,
  'mandato',
  vals.cargo,
  'Governador',
  vals.estado,
  vals.periodo_inicio,
  vals.periodo_fim,
  'manual'
FROM (VALUES
  ('c5a04ea8-14c9-4b1b-8753-1c7ab220e322'::uuid, 'ratinho-junior',  'Governador do Parana',       'PR', 2019, NULL::int),
  ('f1939509-0d54-40b0-9b8e-09f56ded6cc4'::uuid, 'romeu-zema',      'Governador de Minas Gerais', 'MG', 2019, NULL::int),
  ('7759b635-5e6d-42d2-8a1a-54b222ba99bd'::uuid, 'ronaldo-caiado',  'Governador de Goias',        'GO', 2018, 2022),
  ('773b5bac-d23f-442c-b19b-2ef03c0f16c6'::uuid, 'ronaldo-caiado',  'Governador',                 'GO', 2022, NULL::int),
  ('309e3a6e-a5bd-4669-969f-c285768a0e11'::uuid, 'ciro-gomes',      'Governador do Ceara',        'CE', 1991, 1994),
  ('8f400344-39f4-4b26-9a65-482a55729adc'::uuid, 'tarcisio',        'Governador de Sao Paulo',    'SP', 2023, NULL::int)
) AS vals(row_id, slug, cargo, estado, periodo_inicio, periodo_fim)
JOIN candidatos c ON c.slug = vals.slug
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM historico_politico
  WHERE id IN (
    'c5a04ea8-14c9-4b1b-8753-1c7ab220e322',
    'f1939509-0d54-40b0-9b8e-09f56ded6cc4',
    '7759b635-5e6d-42d2-8a1a-54b222ba99bd',
    '773b5bac-d23f-442c-b19b-2ef03c0f16c6',
    '309e3a6e-a5bd-4669-969f-c285768a0e11',
    '8f400344-39f4-4b26-9a65-482a55729adc'
  );
  RAISE NOTICE 'historico_politico ci_seed: % de 6 rows presentes (ON CONFLICT pode ter saltado existentes)', v_count;
END $$;
