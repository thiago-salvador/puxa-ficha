-- MT Governador: fechamento de residuos de historico e timeline partidaria.
-- Fontes: TSE Dados Abertos consulta_cand 2012/2014/2020 e curadoria
-- publica ja materializada no lote de publicacao MT 2026.

BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.candidatos
    WHERE slug IN (
      'alex-pucineli',
      'caiubi-kuhn',
      'jayme-campos',
      'laudicerio-aguiar',
      'marcelo-maluf',
      'mauricio-coelho',
      'mauricio-tonha',
      'natasha-slhessarenko',
      'otaviano-pivetta',
      'rafaell-milas',
      'wellington-fagundes'
    )
      AND publicavel = true
  ) <> 11 THEN
    RAISE EXCEPTION 'MT Governador: cohort publica esperada nao encontrada';
  END IF;
END $$;

CREATE TEMP TABLE _mt_historico ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'alex-pucineli',
      'candidatura',
      'Pre-candidato a Governador',
      'Governador',
      'MT',
      2026,
      NULL::integer,
      'D35',
      NULL::text,
      'Curadoria publica do lote MT registra Alex Pucineli como pre-candidato ao governo de Mato Grosso pelo Democrata 35 em 2026; TSE consulta_cand 2012_MT/BRASIL.csv confirma candidatura anterior a vereador em Cuiaba/MT, SQ 110000010149.',
      'misto'
    ),
    (
      'marcelo-maluf',
      'candidatura',
      '1o suplente',
      'Suplente',
      'MT',
      2014,
      2014,
      'PSDB',
      'inapto',
      'TSE consulta_cand_2014_MT/BRASIL.csv: SQ 110000000004, Marcelo Benedito Maluf, 1o suplente/MT, PSDB, situacao INAPTO.',
      'tse'
    ),
    (
      'marcelo-maluf',
      'candidatura',
      'Pre-candidato a Governador',
      'Governador',
      'MT',
      2026,
      NULL::integer,
      'NOVO',
      NULL::text,
      'Curadoria publica do lote MT registra Marcelo Maluf como pre-candidato ao governo de Mato Grosso pelo Novo em 2026; a ficha publica ja traz o contexto anterior as convencoes.',
      'manual'
    ),
    (
      'mauricio-tonha',
      'candidatura',
      'Pre-candidato a Governador',
      'Governador',
      'MT',
      2026,
      NULL::integer,
      'DC',
      NULL::text,
      'Curadoria publica do lote MT registra Mauricio Tonha como pre-candidato ao governo de Mato Grosso pela Democracia Crista em 2026; TSE consulta_cand_2020_MT/BRASIL.csv confirma candidatura anterior a prefeito de Agua Boa/MT, SQ 110001033922.',
      'misto'
    )
) AS v(
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
FROM _mt_historico h
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

UPDATE public.historico_politico hp
SET
  cargo_canonico = 'Senador',
  tipo_evento = 'mandato',
  partido = 'DEM',
  observacoes = 'Mandato de senador por Mato Grosso de 2007 a 2015; linha normalizada no fechamento MT Governador 2026-07-07 para remover ausencia de proveniencia.',
  proveniencia = 'manual'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'jayme-campos'
  AND hp.periodo_inicio = 2007
  AND hp.periodo_fim = 2015;

UPDATE public.historico_politico hp
SET partido = 'UNIÃO'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'jayme-campos'
  AND hp.periodo_inicio = 2019
  AND hp.periodo_fim = 2027
  AND (hp.partido IS NULL OR hp.partido = '');

UPDATE public.mudancas_partido mp
SET
  partido_novo = 'UNIÃO',
  contexto = contexto || ' [Normalizado em 2026-07-07 para bater com partido_sigla publico UNIÃO.]'
FROM public.candidatos c
WHERE mp.candidato_id = c.id
  AND c.slug = 'jayme-campos'
  AND mp.partido_novo = 'UNIAO';

DO $$
DECLARE
  alex_rows integer;
  marcelo_rows integer;
  tonha_rows integer;
  jayme_timeline integer;
  jayme_nulls integer;
BEGIN
  SELECT count(*) INTO alex_rows
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug = 'alex-pucineli';

  SELECT count(*) INTO marcelo_rows
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug = 'marcelo-maluf';

  SELECT count(*) INTO tonha_rows
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug = 'mauricio-tonha';

  SELECT count(*) INTO jayme_timeline
  FROM public.mudancas_partido mp
  JOIN public.candidatos c ON c.id = mp.candidato_id
  WHERE c.slug = 'jayme-campos'
    AND mp.partido_novo = 'UNIÃO';

  SELECT count(*) INTO jayme_nulls
  FROM public.historico_politico hp
  JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug = 'jayme-campos'
    AND hp.proveniencia IS NULL;

  IF alex_rows < 2 THEN
    RAISE EXCEPTION 'alex-pucineli historico esperado >=2, encontrado %', alex_rows;
  END IF;
  IF marcelo_rows < 2 THEN
    RAISE EXCEPTION 'marcelo-maluf historico esperado >=2, encontrado %', marcelo_rows;
  END IF;
  IF tonha_rows < 2 THEN
    RAISE EXCEPTION 'mauricio-tonha historico esperado >=2, encontrado %', tonha_rows;
  END IF;
  IF jayme_timeline < 1 THEN
    RAISE EXCEPTION 'jayme-campos timeline partidaria nao referencia UNIAO acentuado';
  END IF;
  IF jayme_nulls <> 0 THEN
    RAISE EXCEPTION 'jayme-campos ainda tem historico sem proveniencia';
  END IF;
END $$;

COMMIT;
