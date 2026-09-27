-- Fase eleitoral por candidatura de 2026 e coorte de atualização pós-turno.
--
-- Uma linha por candidatura (candidato_id) que já teve resultado oficial do
-- TSE gravado. Ausência de linha = `em_disputa`: é o estado de todas as fichas
-- até a primeira migration de resultado (gerada por
-- scripts/resultados-tse-fase.ts depois do turno). Por isso esta migration não
-- muda comportamento nenhum: a tabela nasce vazia.
--
-- `atualizacao_encerrada_em` não nulo tira a candidatura da coorte de
-- atualização: as rotinas de coleta deixam de atualizá-la
-- (scripts/lib/coorte-atualizacao.ts) e a ficha pública mostra "Dados
-- atualizados até DD/MM/AAAA". A ficha NÃO é despublicada e nenhum dado é
-- apagado.
--
-- Escrita só por migration de resultado (DML com CAS e recibo em coleta_log),
-- aplicada por apply-fase-eleitoral-production. Leitura pública só pela view
-- `candidaturas_fase_2026_publico`, restrita a fichas no ar.
--
-- NÃO aplicar por `supabase db push` nem por automação: produção só recebe
-- esta migration pelo workflow apply-fase-eleitoral-production (conjunto schema).
BEGIN;

CREATE TABLE IF NOT EXISTS public.candidaturas_fase_2026 (
  candidato_id uuid PRIMARY KEY REFERENCES public.candidatos(id) ON DELETE RESTRICT,
  sq_candidato_2026 text CHECK (sq_candidato_2026 ~ '^[0-9]+$'),
  cargo_disputado text NOT NULL CHECK (cargo_disputado IN ('Presidente', 'Governador', 'Senador')),
  fase_eleitoral text NOT NULL CHECK (fase_eleitoral IN ('em_disputa', 'segundo_turno', 'eleito', 'nao_eleito', 'fora_da_disputa')),
  fase_turno smallint NOT NULL CHECK (fase_turno IN (1, 2)),
  atualizacao_encerrada_em date,
  situacao_tse text CHECK (length(situacao_tse) BETWEEN 1 AND 200),
  fonte_url text CHECK (fonte_url ~ '^https://resultados\.tse\.jus\.br/oficial/'),
  fonte_sha256 text CHECK (fonte_sha256 ~ '^[0-9a-f]{64}$'),
  migration_version text NOT NULL CHECK (migration_version ~ '^[0-9]{14}$'),
  registrado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT candidaturas_fase_2026_em_disputa_sem_encerramento
    CHECK (fase_eleitoral NOT IN ('em_disputa', 'segundo_turno') OR atualizacao_encerrada_em IS NULL),
  CONSTRAINT candidaturas_fase_2026_fora_encerra
    CHECK (fase_eleitoral NOT IN ('nao_eleito', 'fora_da_disputa') OR atualizacao_encerrada_em IS NOT NULL),
  CONSTRAINT candidaturas_fase_2026_eleito_encerra
    CHECK (fase_eleitoral <> 'eleito' OR atualizacao_encerrada_em IS NOT NULL),
  CONSTRAINT candidaturas_fase_2026_segundo_turno_executivo
    CHECK (fase_eleitoral <> 'segundo_turno' OR (fase_turno = 1 AND cargo_disputado IN ('Presidente', 'Governador'))),
  CONSTRAINT candidaturas_fase_2026_senado_primeiro_turno
    CHECK (cargo_disputado <> 'Senador' OR fase_turno = 1),
  CONSTRAINT candidaturas_fase_2026_fonte_ou_senado_sem_resultado
    CHECK (
      (sq_candidato_2026 IS NOT NULL AND situacao_tse IS NOT NULL
       AND fonte_url IS NOT NULL AND fonte_sha256 IS NOT NULL)
      OR (cargo_disputado = 'Senador' AND fase_eleitoral = 'fora_da_disputa'
          AND situacao_tse IS NULL AND fonte_url IS NULL AND fonte_sha256 IS NULL)
    )
);

COMMENT ON TABLE public.candidaturas_fase_2026 IS
  'Fase eleitoral de 2026 por candidatura, do resultado oficial do TSE. Sem linha = em_disputa. atualizacao_encerrada_em não nulo tira a candidatura da coorte de atualização sem despublicar a ficha.';
COMMENT ON COLUMN public.candidaturas_fase_2026.atualizacao_encerrada_em IS
  'Data em que a coleta da ficha foi encerrada (nota pública "Dados atualizados até"). Nulo = segue na coorte de atualização.';

ALTER TABLE public.candidaturas_fase_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidaturas_fase_2026 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.candidaturas_fase_2026 FROM PUBLIC;
REVOKE ALL ON TABLE public.candidaturas_fase_2026 FROM anon, authenticated;
GRANT SELECT (candidato_id, cargo_disputado, fase_eleitoral, fase_turno, atualizacao_encerrada_em)
  ON TABLE public.candidaturas_fase_2026 TO anon, authenticated;
DROP POLICY IF EXISTS candidaturas_fase_2026_public_read ON public.candidaturas_fase_2026;
CREATE POLICY candidaturas_fase_2026_public_read ON public.candidaturas_fase_2026
  FOR SELECT TO anon, authenticated USING (public.is_public_candidate(candidato_id));

-- Só fichas no ar (a junção com candidatos_publico já aplica publicavel e
-- status). É a fonte do predicado para coletores que só têm a chave anon.
CREATE OR REPLACE VIEW public.candidaturas_fase_2026_publico
WITH (security_invoker = true) AS
SELECT f.candidato_id,
       c.slug,
       f.cargo_disputado,
       f.fase_eleitoral,
       f.fase_turno,
       f.atualizacao_encerrada_em
FROM public.candidaturas_fase_2026 f
JOIN public.candidatos_publico c ON c.id = f.candidato_id;

COMMENT ON VIEW public.candidaturas_fase_2026_publico IS
  'Fase eleitoral 2026 das fichas no ar. Fonte única do predicado da coorte de atualização e da nota pública da ficha.';
GRANT SELECT ON public.candidaturas_fase_2026_publico TO anon, authenticated;

COMMIT;
