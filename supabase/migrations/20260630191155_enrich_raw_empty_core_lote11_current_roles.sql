BEGIN;

CREATE TEMP TABLE raw_core_history_lote11 (
  slug text NOT NULL,
  tipo_evento text,
  cargo text NOT NULL,
  cargo_canonico text NOT NULL,
  estado text,
  periodo_inicio integer NOT NULL,
  periodo_fim integer,
  partido text,
  eleito_por text,
  observacoes text NOT NULL,
  proveniencia text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_core_history_lote11 (
  slug,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
)
VALUES
  (
    'rafaell-milas',
    NULL,
    'Presidente estadual do Partido Missão em Mato Grosso',
    'Presidente estadual do Partido Missão em Mato Grosso',
    'MT',
    2025,
    NULL,
    'Missão',
    NULL,
    'Site oficial de campanha registra Rafaell Milas como presidente estadual do Partido Missão em Mato Grosso após aprovação do partido pelo TSE.',
    'manual'
  ),
  (
    'rafaell-milas',
    'candidatura',
    'Pré-candidatura ao Governo de Mato Grosso',
    'Pré-candidatura ao Governo de Mato Grosso',
    'MT',
    2026,
    NULL,
    'Missão',
    NULL,
    'Site oficial de campanha registra lançamento oficial da pré-candidatura ao Governo de MT em Cuiabá em 3 de abril de 2026.',
    'manual'
  ),
  (
    'breno-barcelar',
    NULL,
    'Presidente estadual do Missão Espírito Santo',
    'Presidente estadual do Missão Espírito Santo',
    'ES',
    2025,
    NULL,
    'Missão',
    NULL,
    'Política Capixaba e Século Diário identificam Breno Barcelos como presidente estadual do Missão no Espírito Santo e liderança local do MBL.',
    'manual'
  ),
  (
    'breno-barcelar',
    'candidatura',
    'Pré-candidatura ao Governo do Espírito Santo',
    'Pré-candidatura ao Governo do Espírito Santo',
    'ES',
    2026,
    NULL,
    'Missão',
    NULL,
    'Política Capixaba registrou a pré-candidatura de Breno Barcelos ao Governo do Espírito Santo anunciada nas redes oficiais do Missão no ES.',
    'manual'
  );

INSERT INTO public.historico_politico (
  candidato_id,
  tipo_evento,
  cargo,
  cargo_canonico,
  estado,
  periodo_inicio,
  periodo_fim,
  partido,
  eleito_por,
  observacoes,
  proveniencia
)
SELECT
  c.id,
  h.tipo_evento,
  h.cargo,
  h.cargo_canonico,
  h.estado,
  h.periodo_inicio,
  h.periodo_fim,
  h.partido,
  h.eleito_por,
  h.observacoes,
  h.proveniencia
FROM raw_core_history_lote11 h
JOIN public.candidatos c ON c.slug = h.slug
ON CONFLICT (candidato_id, cargo_canonico, periodo_inicio)
WHERE periodo_inicio IS NOT NULL AND cargo_canonico IS NOT NULL
DO UPDATE SET
  tipo_evento = EXCLUDED.tipo_evento,
  cargo = EXCLUDED.cargo,
  estado = EXCLUDED.estado,
  periodo_fim = EXCLUDED.periodo_fim,
  partido = EXCLUDED.partido,
  eleito_por = EXCLUDED.eleito_por,
  observacoes = EXCLUDED.observacoes,
  proveniencia = EXCLUDED.proveniencia;

DO $$
DECLARE
  expected_history integer;
  actual_history integer;
  still_raw integer;
BEGIN
  SELECT count(*) INTO expected_history FROM raw_core_history_lote11;

  SELECT count(*) INTO actual_history
  FROM raw_core_history_lote11 h
  JOIN public.candidatos c ON c.slug = h.slug
  JOIN public.historico_politico hp
    ON hp.candidato_id = c.id
   AND hp.cargo_canonico = h.cargo_canonico
   AND hp.periodo_inicio = h.periodo_inicio
   AND hp.observacoes = h.observacoes
   AND hp.proveniencia = h.proveniencia;

  IF actual_history <> expected_history THEN
    RAISE EXCEPTION 'raw core lote11 historico mismatch: expected %, got %', expected_history, actual_history;
  END IF;

  WITH lote_slugs AS (
    SELECT DISTINCT slug FROM raw_core_history_lote11
  ),
  counts AS (
    SELECT
      c.slug,
      count(DISTINCT hp.id) AS historico,
      count(DISTINCT p.id) AS patrimonio,
      count(DISTINCT f.id) AS financiamento
    FROM lote_slugs ls
    JOIN public.candidatos c ON c.slug = ls.slug
    LEFT JOIN public.historico_politico hp ON hp.candidato_id = c.id
    LEFT JOIN public.patrimonio p ON p.candidato_id = c.id
    LEFT JOIN public.financiamento f ON f.candidato_id = c.id
    GROUP BY c.slug
  )
  SELECT count(*) INTO still_raw
  FROM counts
  WHERE historico <= 1
    AND patrimonio = 0
    AND financiamento = 0;

  IF still_raw <> 0 THEN
    RAISE EXCEPTION 'raw core lote11 still raw after apply: %', still_raw;
  END IF;
END $$;

COMMIT;
