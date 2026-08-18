BEGIN;

CREATE TEMP TABLE raw_joaquim_barbosa_history (
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

INSERT INTO raw_joaquim_barbosa_history (
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
VALUES (
  'joaquim-barbosa',
  'candidatura',
  'Pré-candidato à Presidência da República',
  'Pré-candidato à Presidência da República',
  NULL,
  2026,
  NULL,
  'DC',
  'pré-candidatura partidária',
  'Democracia Cristã publicou em 20/05/2026 que Joaquim Barbosa foi apresentado como pré-candidato à Presidência da República pela DC (https://www.democraciacrista.org.br/liderancas-do-nordeste-apoiam-joaquim-barbosa-como-pre-candidato-da-dc-a-presidencia-da-republica/) e, em 25/05/2026, registrou apoio de presidentes estaduais à pré-candidatura (https://www.democraciacrista.org.br/presidentes-estaduais-da-democracia-crista-apoiam-a-pre-candidatura-de-joaquim-barbosa/). Situação anterior a convenções e registro oficial no TSE.',
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
FROM raw_joaquim_barbosa_history h
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

COMMIT;
