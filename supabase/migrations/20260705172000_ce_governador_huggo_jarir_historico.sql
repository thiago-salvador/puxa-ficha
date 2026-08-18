BEGIN;

CREATE TEMP TABLE raw_ce_governador_historico (
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

INSERT INTO raw_ce_governador_historico (
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
    'huggo-leonardo',
    'candidatura',
    'Pré-candidatura ao Senado',
    'Pré-candidatura ao Senado',
    'CE',
    2026,
    2026,
    'MISSAO',
    NULL,
    'Lançado inicialmente como pré-candidato ao Senado pelo Partido Missão em maio de 2026. Fonte pública: O POVO Mais, 16/05/2026.',
    'manual'
  ),
  (
    'huggo-leonardo',
    'candidatura',
    'Pré-candidatura a Governador',
    'Pré-candidatura a Governador',
    'CE',
    2026,
    2026,
    'MISSAO',
    NULL,
    'Cotado/convertido em pré-candidato a governador do Ceará pelo Partido Missão em maio de 2026, antes de convenção e registro TSE. Fonte pública: O POVO Mais, 16/05/2026.',
    'manual'
  ),
  (
    'jarir-pereira',
    'mandato',
    'Membro da Executiva Estadual do PSOL Ceará',
    'Membro da Executiva Estadual do PSOL Ceará',
    'CE',
    2025,
    NULL,
    'PSOL',
    NULL,
    'Jarir Pereira é descrito como membro da executiva estadual do PSOL Ceará. Fonte pública: Diário do Nordeste, 20/12/2025.',
    'manual'
  ),
  (
    'jarir-pereira',
    'candidatura',
    'Pré-candidatura a Governador',
    'Pré-candidatura a Governador',
    'CE',
    2026,
    2026,
    'PSOL',
    NULL,
    'Diretório estadual do PSOL Ceará definiu Jarir Pereira como pré-candidato a governador em reunião de 19/12/2025; anúncio publicado em 20/12/2025. Fonte pública: Diário do Nordeste, 20/12/2025.',
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
FROM raw_ce_governador_historico h
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
