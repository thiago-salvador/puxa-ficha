-- Materializa histórico mínimo verificável de Renan Santos.
-- Fontes:
-- - TSE partidos registrados: Partido Missão, presidente nacional Renan Antonio Ferreira dos Santos.
-- - Cobertura pública 2026: pré-candidatura presidencial pelo Missão, ainda sem registro TSE.

CREATE TEMP TABLE raw_renan_santos_history (
  slug text NOT NULL,
  tipo_evento text,
  cargo text NOT NULL,
  cargo_canonico text NOT NULL,
  estado text,
  periodo_inicio integer NOT NULL,
  periodo_fim integer,
  partido text,
  eleito_por text,
  observacoes text,
  proveniencia text NOT NULL
) ON COMMIT DROP;

INSERT INTO raw_renan_santos_history (
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
    'renan-santos',
    'mandato',
    'Presidente Nacional do Partido Missão',
    'Presidente Nacional do Partido Missão',
    'BR',
    2025,
    NULL,
    'MISSAO',
    NULL,
    'TSE lista o Partido Missão, número 14, e Renan Antonio Ferreira dos Santos como presidente nacional; partido registrado em 04/11/2025. Fonte: https://www.tse.jus.br/partidos/partidos-registrados-no-tse/partido-missao',
    'tse'
  ),
  (
    'renan-santos',
    'candidatura',
    'Presidente',
    'Presidente',
    'BR',
    2026,
    NULL,
    'MISSAO',
    NULL,
    'Pré-candidatura à Presidência da República pelo Partido Missão em 2026, ainda dependente de convenção/registro eleitoral. Fontes públicas: Folha de S.Paulo, 02/07/2026, e JOTA, jun/2026.',
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
FROM raw_renan_santos_history h
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

INSERT INTO public.mudancas_partido (
  candidato_id,
  partido_anterior,
  partido_novo,
  ano,
  data_mudanca,
  contexto
)
SELECT
  c.id,
  'Histórico anterior não determinado',
  'MISSAO',
  2025,
  DATE '2025-11-04',
  'TSE lista Renan Antonio Ferreira dos Santos como presidente nacional do Partido Missão, número 14, registrado em 04/11/2025. Fonte: https://www.tse.jus.br/partidos/partidos-registrados-no-tse/partido-missao'
FROM public.candidatos c
WHERE c.slug = 'renan-santos'
ON CONFLICT ON CONSTRAINT uq_mudancas_partido_candidato_ano_partido
DO UPDATE SET
  partido_anterior = EXCLUDED.partido_anterior,
  data_mudanca = EXCLUDED.data_mudanca,
  contexto = EXCLUDED.contexto;
