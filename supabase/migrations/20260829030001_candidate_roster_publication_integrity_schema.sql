BEGIN;

ALTER TABLE public.candidatos
  DROP CONSTRAINT IF EXISTS candidatos_publicacao_minima_2026_check;
ALTER TABLE public.candidatos
  ADD CONSTRAINT candidatos_publicacao_minima_2026_check CHECK (
    publicavel IS DISTINCT FROM true
    OR cargo_disputado NOT IN ('Presidente','Governador')
    OR (
      COALESCE(btrim(foto_url),'')<>''
      AND COALESCE(btrim(biografia),'')<>''
      AND COALESCE(btrim(naturalidade),'')<>''
      AND data_nascimento IS NOT NULL
      AND COALESCE(btrim(formacao),'')<>''
      AND COALESCE(btrim(profissao_declarada),'')<>''
      AND COALESCE(btrim(genero),'')<>''
      AND COALESCE(btrim(estado_civil),'')<>''
      AND COALESCE(btrim(cor_raca),'')<>''
      AND COALESCE(verificacao_campos,'{}'::jsonb) ? 'candidate_registration'
      AND COALESCE(verificacao_campos,'{}'::jsonb) ? 'candidate_complement'
    )
  ) NOT VALID;

-- No estado real, as 220 chapas do snapshot anterior provam que a curadoria
-- imediatamente anterior deveria ter rodado, então a validação é obrigatória e
-- aborta se ainda houver lacuna. No replay linear vazio, migrations históricas
-- deixam algumas fichas sem o snapshot de chapas; esse estado sintético mantém
-- a constraint NOT VALID, mas novas escritas continuam sendo verificadas.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.chapas_2026
      WHERE fonte_sha256='eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27')=220
     OR (SELECT count(*) FROM public.candidatos
         WHERE publicavel=true AND cargo_disputado IN ('Presidente','Governador'))=0 THEN
    ALTER TABLE public.candidatos
      VALIDATE CONSTRAINT candidatos_publicacao_minima_2026_check;
  ELSE
    RAISE NOTICE 'replay sem o snapshot oficial; validação da constraint adiada';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.chapas_2026_publico
WITH (security_invoker = true) AS
SELECT ch.chave,ch.eleicao_codigo,ch.eleicao_data,ch.uf,ch.cargo_titular,
       ch.identidade_status,ch.vinculo_titular_status,ch.tse_situacao_codigo,
       ch.titular_candidato_id,titular.slug AS titular_slug,ch.titular_nome_completo,
       ch.titular_nome_urna,ch.titular_partido_sigla,ch.vice_candidato_id,
       vice.slug AS vice_slug,ch.vice_nome_completo,ch.vice_nome_urna,
       ch.vice_partido_sigla,ch.fonte_url,ch.fonte_sha256,ch.snapshot_em
FROM public.chapas_2026 ch
LEFT JOIN public.candidatos_publico titular ON titular.id=ch.titular_candidato_id
LEFT JOIN public.candidatos_publico vice ON vice.id=ch.vice_candidato_id
WHERE ch.identidade_status = 'confirmada';

GRANT SELECT ON public.chapas_2026_publico TO anon, authenticated;
COMMENT ON VIEW public.chapas_2026_publico IS
  'Chapas 2026 com identidade confirmada. Duplicidades oficiais e substituições não resolvidas ficam fail-closed fora da superfície pública.';

DO $$
BEGIN
  IF current_setting('pf.candidate_roster_integrity_apply',true) IS DISTINCT FROM 'true' THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.chapas_2026_publico WHERE identidade_status <> 'confirmada') THEN
    RAISE EXCEPTION 'integridade de publicação: chapa em quarentena vazou para a view pública';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.candidatos'::regclass
      AND conname='candidatos_publicacao_minima_2026_check'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'integridade de publicação: constraint de admissão não foi validada';
  END IF;
  IF (SELECT count(*) FROM public.chapas_2026_publico WHERE titular_slug='well-macedo' AND vice_nome_urna='SEU ALEX') <> 1 THEN
    RAISE EXCEPTION 'integridade de publicação: vice vigente de Well Macedo não foi resolvida';
  END IF;
END $$;

COMMIT;
