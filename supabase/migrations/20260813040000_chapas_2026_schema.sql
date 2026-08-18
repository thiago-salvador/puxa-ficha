-- Snapshot oficial TSE de 12/08/2026: 134 chapas lógicas.
-- Fonte SHA-256: 686fe1717dd0b860d714f878bf3d75a388478ebab2a56a2f963e6bba50ff0ce7.
-- O código #NE NÃO significa deferimento nem julgamento pendente.

CREATE TABLE public.chapas_2026 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  eleicao_codigo text NOT NULL,
  eleicao_data date NOT NULL,
  uf text,
  cargo_titular text NOT NULL CHECK (cargo_titular IN ('Presidente', 'Governador')),
  sq_coligacao text,
  identidade_status text NOT NULL CHECK (identidade_status IN ('confirmada', 'duplicidade_oficial')),
  vinculo_titular_status text NOT NULL CHECK (vinculo_titular_status IN ('confirmado', 'revisao_identidade', 'duplicidade_oficial', 'novo_perfil_oficial')),
  tse_situacao_codigo text NOT NULL,
  tse_situacao_titular_codigo text NOT NULL,
  tse_situacao_vice_codigo text NOT NULL,
  tipo_agremiacao text NOT NULL,
  composicao text NOT NULL,
  titular_candidato_id uuid REFERENCES public.candidatos(id) ON DELETE RESTRICT,
  vice_candidato_id uuid REFERENCES public.candidatos(id) ON DELETE RESTRICT,
  titular_sq_candidato text,
  vice_sq_candidato text,
  titular_nome_completo text NOT NULL,
  titular_nome_urna text NOT NULL,
  titular_partido_sigla text NOT NULL,
  vice_nome_completo text NOT NULL,
  vice_nome_urna text NOT NULL,
  vice_partido_sigla text NOT NULL,
  alternativas_oficiais jsonb NOT NULL DEFAULT '[]'::jsonb,
  fonte_url text NOT NULL,
  fonte_sha256 text NOT NULL,
  snapshot_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((cargo_titular = 'Presidente' AND uf IS NULL) OR (cargo_titular = 'Governador' AND uf ~ '^[A-Z]{2}$')),
  CHECK ((identidade_status = 'confirmada' AND sq_coligacao IS NOT NULL) OR (identidade_status = 'duplicidade_oficial' AND sq_coligacao IS NULL)),
  CHECK (identidade_status <> 'duplicidade_oficial' OR (titular_sq_candidato IS NULL AND vice_sq_candidato IS NULL AND jsonb_array_length(alternativas_oficiais) = 2)),
  CHECK (vinculo_titular_status IN ('confirmado', 'novo_perfil_oficial') OR (titular_candidato_id IS NULL AND titular_sq_candidato IS NULL))
);

ALTER TABLE public.chapas_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapas_2026 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chapas_2026 FROM PUBLIC;
REVOKE ALL ON TABLE public.chapas_2026 FROM anon, authenticated;
GRANT SELECT (
  chave,eleicao_codigo,eleicao_data,uf,cargo_titular,identidade_status,
  vinculo_titular_status,tse_situacao_codigo,titular_candidato_id,
  titular_nome_completo,titular_nome_urna,titular_partido_sigla,
  vice_candidato_id,vice_nome_completo,vice_nome_urna,vice_partido_sigla,
  fonte_url,fonte_sha256,snapshot_em
) ON public.chapas_2026 TO anon, authenticated;
CREATE POLICY chapas_2026_public_read ON public.chapas_2026
  FOR SELECT TO anon, authenticated USING (true);

CREATE VIEW public.chapas_2026_publico
WITH (security_invoker = true) AS
SELECT ch.chave,ch.eleicao_codigo,ch.eleicao_data,ch.uf,ch.cargo_titular,
       ch.identidade_status,ch.vinculo_titular_status,ch.tse_situacao_codigo,
       ch.titular_candidato_id,titular.slug AS titular_slug,ch.titular_nome_completo,
       ch.titular_nome_urna,ch.titular_partido_sigla,ch.vice_candidato_id,
       vice.slug AS vice_slug,ch.vice_nome_completo,ch.vice_nome_urna,
       ch.vice_partido_sigla,ch.fonte_url,ch.fonte_sha256,ch.snapshot_em
FROM public.chapas_2026 ch
LEFT JOIN public.candidatos_publico titular ON titular.id=ch.titular_candidato_id
LEFT JOIN public.candidatos_publico vice ON vice.id=ch.vice_candidato_id;
GRANT SELECT ON public.chapas_2026_publico TO anon, authenticated;
