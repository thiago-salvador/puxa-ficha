-- ============================================================
-- Seed minimo de historico_politico para o mandato Prefeito de
-- Fortaleza/CE 1989-1990 de ciro-gomes, necessario para os guards
-- das migrations de legislacao_mandato_executivo:
--   20260504130000_seed_legislacao_mandato_executivo_ciro_gomes_fortaleza_sapl_pdf_lote_a.sql
--   20260504160000_seed_legislacao_mandato_executivo_ciro_gomes_fortaleza_sapl_ocr_lote_b.sql
--
-- Contexto: introduzido em fac27f8 (Lotes A/B Fortaleza) sem
-- estender o seed de CI; resultado: `supabase db reset` em CI
-- (fresh local Postgres) falhava com:
--   "Pre-condicao falha: esperava exatamente 1 mandato Prefeito de
--    Fortaleza CE 1989-1990 para ciro-gomes, encontrei 0".
--
-- O banco remoto ja tem este row via pipelines (uuid abaixo eh o
-- mesmo do remoto). ON CONFLICT (id) DO NOTHING garante:
--   - remoto: row ja existe → no-op (preserva valores existentes
--     de eleito_por/observacoes/proveniencia que vieram do pipeline).
--   - local CI: row ausente → INSERT satisfaz o guard.
--
-- Dependencias:
--   - 20260428000001_seed_candidatos_ciro_gomes_for_legislacao_guards.sql
--     (cria a row em candidatos com slug='ciro-gomes' antes deste).
--   - precede 20260504130000 (Lote A) por timestamp.
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
  '1db3acdd-96db-426a-8207-73e7793bc0c1'::uuid,
  c.id,
  'mandato',
  'Prefeito de Fortaleza',
  'Prefeito',
  'CE',
  1989,
  1990,
  'manual'
FROM candidatos c
WHERE c.slug = 'ciro-gomes'
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM historico_politico
   WHERE id = '1db3acdd-96db-426a-8207-73e7793bc0c1';
  RAISE NOTICE
    'ciro-gomes prefeito-fortaleza ci_seed: historico_politico=% (ON CONFLICT pode ter saltado existente)',
    v_count;
END $$;
