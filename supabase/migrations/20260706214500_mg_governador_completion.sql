-- MG Governador: historico minimo fonteado para fechamento real.
-- Fontes: TSE Dados Abertos consulta_cand 2016/2018/2020/2022/2024;
-- Metropoles, Itatiaia e Causa Operaria para pre-candidaturas 2026.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'ben-mendes' AND publicavel = true) THEN
    RAISE EXCEPTION 'ben-mendes nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'henrique-areas' AND publicavel = true) THEN
    RAISE EXCEPTION 'henrique-areas nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'indira-xavier' AND publicavel = true) THEN
    RAISE EXCEPTION 'indira-xavier nao encontrado ou nao publicavel';
  END IF;
END $$;

CREATE TEMP TABLE _mg_historico ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (
      'ben-mendes',
      'candidatura',
      'Pre-candidato a Governador',
      'Governador',
      'MG',
      2026,
      NULL::integer,
      'MISSAO',
      NULL::text,
      'Metropoles listou Ben Mendes como pre-candidato do Partido Missao ao Governo de Minas Gerais em 2026; varredura TSE consulta_cand 2010-2024 por Benoni Benjamin Cardoso Mendes/Ben Mendes retornou 0 SQ seguro.',
      'misto'
    ),
    (
      'henrique-areas',
      'candidatura',
      'Candidato a Prefeito',
      'Prefeito',
      'SP',
      2016,
      2016,
      'PCO',
      'nao eleito',
      'TSE consulta_cand_2016_BRASIL.csv: SQ 250000077188, Henrique Areas de Araujo, Prefeito/SP, PCO.',
      'tse'
    ),
    (
      'henrique-areas',
      'candidatura',
      'Candidato a Deputado Federal',
      'Deputado Federal',
      'SP',
      2018,
      2018,
      'PCO',
      NULL::text,
      'TSE consulta_cand_2018_BRASIL.csv: SQ 250000615443, Henrique Areas de Araujo, Deputado Federal/SP, PCO.',
      'tse'
    ),
    (
      'henrique-areas',
      'candidatura',
      'Candidato a Vice-prefeito',
      'Vice-prefeito',
      'SP',
      2020,
      2020,
      'PCO',
      NULL::text,
      'TSE consulta_cand_2020_BRASIL.csv: SQ 250001172315, Henrique Areas de Araujo, Vice-prefeito/SP, PCO.',
      'tse'
    ),
    (
      'henrique-areas',
      'candidatura',
      'Pre-candidato a Governador',
      'Governador',
      'MG',
      2026,
      NULL::integer,
      'PCO',
      NULL::text,
      'Causa Operaria registrou Henrique Areas como pre-candidato do PCO ao Governo de Minas Gerais em 2026.',
      'manual'
    ),
    (
      'indira-xavier',
      'candidatura',
      'Candidata a Governadora',
      'Governador',
      'MG',
      2022,
      2022,
      'UP',
      NULL::text,
      'TSE consulta_cand_2022_MG/BRASIL.csv: SQ 130001693598, Indira Ivanise Xavier, Governador/MG, UP.',
      'tse'
    ),
    (
      'indira-xavier',
      'candidatura',
      'Candidata a Prefeita',
      'Prefeito',
      'MG',
      2024,
      2024,
      'UP',
      NULL::text,
      'TSE consulta_cand_2024_MG/BRASIL.csv: SQ 130001975891, Indira Ivanise Xavier, Prefeito/MG, UP.',
      'tse'
    ),
    (
      'indira-xavier',
      'candidatura',
      'Pre-candidata a Governadora',
      'Governador',
      'MG',
      2026,
      NULL::integer,
      'UP',
      NULL::text,
      'Itatiaia listou Indira Xavier como pre-candidata da Unidade Popular ao Governo de Minas Gerais em 2026.',
      'manual'
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
FROM _mg_historico h
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
  ben_rows integer;
  henrique_rows integer;
  indira_rows integer;
BEGIN
  SELECT count(*) INTO ben_rows FROM public.historico_politico hp JOIN public.candidatos c ON c.id = hp.candidato_id WHERE c.slug = 'ben-mendes';
  SELECT count(*) INTO henrique_rows FROM public.historico_politico hp JOIN public.candidatos c ON c.id = hp.candidato_id WHERE c.slug = 'henrique-areas';
  SELECT count(*) INTO indira_rows FROM public.historico_politico hp JOIN public.candidatos c ON c.id = hp.candidato_id WHERE c.slug = 'indira-xavier';

  IF ben_rows < 1 THEN
    RAISE EXCEPTION 'ben-mendes historico nao materializado';
  END IF;
  IF henrique_rows < 4 THEN
    RAISE EXCEPTION 'henrique-areas historico incompleto: %', henrique_rows;
  END IF;
  IF indira_rows < 3 THEN
    RAISE EXCEPTION 'indira-xavier historico incompleto: %', indira_rows;
  END IF;
END $$;

COMMIT;
