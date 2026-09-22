-- Vínculo entre compromisso do programa de governo e evidência já verificada
-- (voto nominal, posição declarada, fala, projeto de lei, contradição curada).
--
-- Contrato de publicação:
-- * A tabela é privada: nenhuma permissão nem policy para anon/authenticated.
--   A leitura pública só será aberta por migration própria, depois que existir
--   linha revisada com verificado = true.
-- * A view pública já nasce com o filtro definitivo: somente linha verificada,
--   de candidato público, com relação 'sustenta' ou 'relacionada'. 'contradiz'
--   fica restrita à revisão e não é exposta nesta versão.
-- * `origem = 'cascata'` marca vínculo verificado pela cascata automática
--   (código, Jev e verificador independente); `revisado_por` nomeia a versão.
-- * A view roda como quem consulta (security_invoker). O filtro está numa
--   função SECURITY DEFINER que avalia uma linha por id, repetido na view
--   porque service_role tem BYPASSRLS.
BEGIN;

CREATE TABLE public.compromisso_evidencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE CASCADE,
  programa_chave text NOT NULL
    CHECK (programa_chave ~ '^2026:(PRESIDENTE:BR|GOVERNADOR:[A-Z]{2}):[0-9]{11,12}$'),
  frase_id text CHECK (frase_id ~ '^[0-9a-f]{16}$'),
  tema_id text CHECK (tema_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  tipo_evidencia text NOT NULL
    CHECK (tipo_evidencia IN ('votacao_chave', 'posicao_declarada', 'fala', 'projeto_lei', 'contradicao')),
  evidencia_ref text NOT NULL CHECK (length(btrim(evidencia_ref)) BETWEEN 1 AND 200),
  relacao text NOT NULL CHECK (relacao IN ('sustenta', 'contradiz', 'relacionada')),
  origem text NOT NULL CHECK (origem IN ('jev_sombra', 'cascata', 'curadoria')),
  probabilidade numeric(5,4) CHECK (probabilidade BETWEEN 0 AND 1),
  verificado boolean NOT NULL DEFAULT false,
  revisado_por text,
  revisado_em timestamptz,
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compromisso_evidencia_alvo_check CHECK (num_nonnulls(frase_id, tema_id) >= 1),
  CONSTRAINT compromisso_evidencia_origem_probabilidade_check
    CHECK (origem NOT IN ('jev_sombra', 'cascata') OR probabilidade IS NOT NULL),
  CONSTRAINT compromisso_evidencia_verificado_revisao_check
    CHECK (NOT verificado OR (
      revisado_por IS NOT NULL AND length(btrim(revisado_por)) > 0
      AND revisado_em IS NOT NULL
      AND motivo IS NOT NULL AND length(btrim(motivo)) >= 12
    )),
  CONSTRAINT compromisso_evidencia_vinculo_unico
    UNIQUE NULLS NOT DISTINCT (programa_chave, frase_id, tema_id, tipo_evidencia, evidencia_ref)
);

CREATE INDEX compromisso_evidencia_candidato_idx ON public.compromisso_evidencia (candidato_id);
CREATE INDEX compromisso_evidencia_verificado_idx ON public.compromisso_evidencia (candidato_id)
  WHERE verificado;

ALTER TABLE public.compromisso_evidencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compromisso_evidencia FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compromisso_evidencia TO service_role;

CREATE FUNCTION public.is_public_compromisso_evidencia(p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.compromisso_evidencia e
    WHERE e.id = p_id
      AND e.verificado
      AND e.relacao IN ('sustenta', 'relacionada')
      AND public.is_public_candidate(e.candidato_id)
  );
$$;
REVOKE ALL ON FUNCTION public.is_public_compromisso_evidencia(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_public_compromisso_evidencia(uuid) TO anon, authenticated, service_role;

CREATE VIEW public.compromisso_evidencia_publica
WITH (security_barrier = true, security_invoker = true) AS
SELECT
  e.id,
  e.candidato_id,
  e.programa_chave,
  e.frase_id,
  e.tema_id,
  e.tipo_evidencia,
  e.evidencia_ref,
  e.relacao,
  e.revisado_em
FROM public.compromisso_evidencia e
WHERE public.is_public_compromisso_evidencia(e.id);

REVOKE ALL ON public.compromisso_evidencia_publica FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.compromisso_evidencia_publica TO anon, authenticated, service_role;

DO $check$
BEGIN
  IF NOT (SELECT reloptions @> ARRAY['security_barrier=true', 'security_invoker=true']
          FROM pg_class WHERE oid = 'public.compromisso_evidencia_publica'::regclass) THEN
    RAISE EXCEPTION 'compromisso_evidencia_publica: view precisa de security_invoker e security_barrier';
  END IF;
  IF has_table_privilege('anon', 'public.compromisso_evidencia', 'SELECT')
     OR has_table_privilege('authenticated', 'public.compromisso_evidencia', 'SELECT')
     OR has_any_column_privilege('anon', 'public.compromisso_evidencia', 'SELECT')
     OR has_any_column_privilege('authenticated', 'public.compromisso_evidencia', 'SELECT') THEN
    RAISE EXCEPTION 'compromisso_evidencia: tabela nao pode ser legivel por anon/authenticated nesta versao';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'compromisso_evidencia') THEN
    RAISE EXCEPTION 'compromisso_evidencia: nenhuma policy publica nesta versao';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.compromisso_evidencia'::regclass) THEN
    RAISE EXCEPTION 'compromisso_evidencia: RLS precisa estar ativa';
  END IF;
END
$check$;

COMMIT;
