-- ============================================================
-- Seed mínimo de candidatos + historico_politico para ciro-gomes
-- Necessário para guards de migrations de legislacao rodarem em
-- ambiente local / CI (fresh Supabase, sem pipeline data).
--
-- O banco remoto já tem esses dados via pipelines.
-- ON CONFLICT DO NOTHING / DO NOTHING é idempotente.
--
-- Dependência: 20260428000000 seed historico_politico (deve rodar
-- ANTES de 20260429223000_seed_legislacao_mandato_executivo_ciro_gomes).
-- ============================================================

-- 1. Seed candidatos row para ciro-gomes
INSERT INTO candidatos (nome_completo, nome_urna, slug, partido_atual, partido_sigla, cargo_disputado, status)
VALUES ('Ciro Ferreira Gomes', 'Ciro', 'ciro-gomes', 'Partido Democrático Trabalhista', 'PDT', 'Presidente', 'pre-candidato')
ON CONFLICT (slug) DO NOTHING;

-- 2. Seed historico_politico mandato Governador/CE 1991-1994 para ciro-gomes
--    UUID fixo = mesmo do banco remoto; ON CONFLICT (id) DO NOTHING é idempotente.
--    Nota: 20260428000000 tentou inserir este row via JOIN em candidatos, mas o JOIN
--    não encontrou ciro-gomes (ausente no seed_data). Este migration corrige isso.
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
  '309e3a6e-a5bd-4669-969f-c285768a0e11'::uuid,
  c.id,
  'mandato',
  'Governador do Ceara',
  'Governador',
  'CE',
  1991,
  1994,
  'manual'
FROM candidatos c
WHERE c.slug = 'ciro-gomes'
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE v_cand INT; v_hist INT;
BEGIN
  SELECT COUNT(*) INTO v_cand FROM candidatos WHERE slug = 'ciro-gomes';
  SELECT COUNT(*) INTO v_hist FROM historico_politico
    WHERE id = '309e3a6e-a5bd-4669-969f-c285768a0e11';
  RAISE NOTICE 'ciro-gomes ci_seed: candidato=% historico_politico=% (ON CONFLICT pode ter saltado existentes)', v_cand, v_hist;
END $$;
