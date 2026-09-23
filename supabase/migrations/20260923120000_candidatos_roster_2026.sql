-- Roster eleitoral leve para os seis cargos da colinha 2026.
-- A tabela é separada de candidatos: não promove uma candidatura a ficha pública.
BEGIN;

CREATE TABLE IF NOT EXISTS public.candidatos_roster_2026 (
  ano integer NOT NULL CHECK (ano = 2026),
  sq_candidato text NOT NULL CHECK (length(btrim(sq_candidato)) > 0),
  uf text NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  cargo text NOT NULL CHECK (cargo IN ('deputado_federal', 'deputado_estadual', 'deputado_distrital', 'presidente', 'governador', 'senador')),
  nome_urna text NOT NULL CHECK (length(btrim(nome_urna)) > 0),
  nome_completo text NOT NULL CHECK (length(btrim(nome_completo)) > 0),
  numero_urna text NOT NULL CHECK (length(btrim(numero_urna)) > 0),
  partido_sigla text NOT NULL CHECK (length(btrim(partido_sigla)) > 0),
  situacao_registro text NOT NULL CHECK (length(btrim(situacao_registro)) > 0),
  fonte_url text NOT NULL CHECK (fonte_url ~ '^https://'),
  sha256_pacote text NOT NULL CHECK (sha256_pacote ~ '^[a-f0-9]{64}$'),
  coletado_em timestamptz NOT NULL,
  snapshot_em timestamptz NULL,
  foto_path text NULL,
  PRIMARY KEY (ano, sq_candidato, uf, cargo)
);

COMMENT ON TABLE public.candidatos_roster_2026 IS 'Snapshot oficial TSE 2026 de candidaturas nos seis cargos da colinha; sem dados de ficha.';
COMMENT ON COLUMN public.candidatos_roster_2026.sq_candidato IS 'SQ_CANDIDATO do pacote oficial do TSE.';
COMMENT ON COLUMN public.candidatos_roster_2026.foto_path IS 'Reservado para miniatura oficial; nullable na fase de roster.';

CREATE INDEX IF NOT EXISTS candidatos_roster_2026_busca_idx
  ON public.candidatos_roster_2026 (ano, uf, cargo, nome_urna, numero_urna, partido_sigla);

ALTER TABLE public.candidatos_roster_2026 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS candidatos_roster_2026_leitura_publica ON public.candidatos_roster_2026;
CREATE POLICY candidatos_roster_2026_leitura_publica
  ON public.candidatos_roster_2026 FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON TABLE public.candidatos_roster_2026 FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  ano, sq_candidato, uf, cargo, nome_urna, nome_completo, numero_urna,
  partido_sigla, situacao_registro, fonte_url, sha256_pacote, coletado_em, snapshot_em, foto_path
) ON public.candidatos_roster_2026 TO anon, authenticated;

CREATE OR REPLACE VIEW public.candidatos_roster_2026_publico
WITH (security_invoker = true)
AS
SELECT ano, sq_candidato, uf, cargo, nome_urna, nome_completo, numero_urna,
       partido_sigla, situacao_registro, fonte_url, sha256_pacote, coletado_em, snapshot_em,
       foto_path
FROM public.candidatos_roster_2026;

REVOKE ALL ON TABLE public.candidatos_roster_2026_publico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.candidatos_roster_2026_publico TO anon, authenticated;

COMMIT;
