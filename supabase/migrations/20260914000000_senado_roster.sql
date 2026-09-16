-- Roster aditivo do Senado 2026. Esta migration é preparada localmente;
-- aplicação remota exige autorização específica.
BEGIN;

CREATE TABLE public.senado_suplencias_2026 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL CHECK (ano = 2026),
  uf text NOT NULL CHECK (uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  chave_chapa text NOT NULL,
  sq_coligacao text NOT NULL,
  titular_candidato_id uuid NOT NULL REFERENCES public.candidatos(id) ON DELETE RESTRICT,
  titular_slug text NOT NULL,
  titular_sq_candidato text NOT NULL,
  ordem smallint NOT NULL CHECK (ordem IN (1,2)),
  suplente_candidato_id uuid REFERENCES public.candidatos(id) ON DELETE RESTRICT,
  suplente_slug text,
  sq_candidato text NOT NULL,
  nome_urna text NOT NULL,
  situacao text,
  fonte_url text NOT NULL CHECK (btrim(fonte_url) <> ''),
  fonte_sha256 text NOT NULL CHECK (fonte_sha256 ~ '^[a-f0-9]{64}$'),
  publicavel boolean NOT NULL DEFAULT false,
  vinculo_verificado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, uf, chave_chapa, ordem),
  UNIQUE (ano, uf, chave_chapa, sq_candidato),
  CHECK (sq_candidato <> titular_sq_candidato),
  CHECK (publicavel = false OR (vinculo_verificado = true AND titular_candidato_id IS NOT NULL))
);

ALTER TABLE public.senado_suplencias_2026 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.senado_suplencias_2026 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.senado_suplencias_2026 FROM PUBLIC, anon, authenticated;

-- A view invoker só consegue executar quando os papéis públicos têm os
-- privilégios das colunas que a view lê. A policy mantém a tabela limitada às
-- mesmas linhas já elegíveis para publicação, sem conceder DML.
GRANT SELECT (
  ano, uf, chave_chapa, titular_slug, titular_sq_candidato, ordem,
  nome_urna, situacao, fonte_url, sq_candidato, publicavel,
  vinculo_verificado, titular_candidato_id
) ON public.senado_suplencias_2026 TO anon, authenticated;
CREATE POLICY senado_suplencias_public_read ON public.senado_suplencias_2026
  FOR SELECT TO anon, authenticated
  USING (
    publicavel = true
    AND vinculo_verificado = true
    AND EXISTS (
      SELECT 1
      FROM public.candidatos c
      JOIN public.candidatos_publico cp ON cp.id = c.id AND cp.slug = c.slug
      WHERE c.id = titular_candidato_id
        AND c.slug = titular_slug
        AND c.sq_candidato_2026 = titular_sq_candidato
        AND c.cargo_disputado = 'Senador'
        AND c.estado = uf
    )
  );

-- A checagem de SQ do titular usa somente as colunas públicas necessárias para
-- manter o vínculo forte também quando houver slugs homônimos.
-- Este GRANT de coluna não abre linhas: public.candidatos tem RLS habilitado e a
-- policy "Leitura pública" (USING publicavel = true AND status <> 'removido')
-- continua filtrando anon/authenticated. Só o SQ TSE de candidaturas já
-- publicadas fica legível. Se essa policy deixar de exigir publicavel = true,
-- o readback 20260914000000 falha e o grant precisa ser revisto.
GRANT SELECT (id, slug, sq_candidato_2026) ON public.candidatos TO anon, authenticated;

CREATE VIEW public.senado_suplencias_publico
WITH (security_invoker = true) AS
SELECT s.ano, s.uf, s.chave_chapa, s.titular_slug, s.ordem,
       s.nome_urna, s.situacao, s.fonte_url, s.sq_candidato,
       (t.id IS NOT NULL) AS titular_publicavel,
       s.vinculo_verificado
FROM public.senado_suplencias_2026 s
JOIN public.candidatos tbase
  ON tbase.id = s.titular_candidato_id
 AND tbase.slug = s.titular_slug
 AND tbase.sq_candidato_2026 = s.titular_sq_candidato
JOIN public.candidatos_publico t
  ON t.id = tbase.id
 AND t.slug = s.titular_slug
WHERE s.publicavel = true
  AND s.vinculo_verificado = true
  AND t.cargo_disputado = 'Senador'
  AND t.estado = s.uf;

GRANT SELECT ON public.senado_suplencias_publico TO anon, authenticated;

-- A regra de admissão pública passa a cobrir Senado sem rebaixar o estado de
-- validação. Em produção a constraint anterior está validada (convalidated=true)
-- e não há Senador publicável: a definição nova é revalidada logo após o ADD e a
-- migration aborta se alguma linha violar. Só o replay linear sintético, em que
-- 20260829030001 adiou a validação, mantém NOT VALID como já estava.
DO $$
BEGIN
  PERFORM set_config(
    'pf.senado_roster_publicacao_previa',
    COALESCE((
      SELECT CASE WHEN convalidated THEN 'validada' ELSE 'not_valid' END
      FROM pg_constraint
      WHERE conrelid='public.candidatos'::regclass
        AND conname='candidatos_publicacao_minima_2026_check'
    ), 'ausente'),
    true
  );
END $$;
ALTER TABLE public.candidatos DROP CONSTRAINT IF EXISTS candidatos_publicacao_minima_2026_check;
ALTER TABLE public.candidatos ADD CONSTRAINT candidatos_publicacao_minima_2026_check CHECK (
  publicavel IS DISTINCT FROM true
  OR cargo_disputado NOT IN ('Presidente','Governador','Senador')
  OR (
    COALESCE(btrim(foto_url),'') <> ''
    AND COALESCE(btrim(partido_sigla),'') <> ''
    AND COALESCE(btrim(situacao_candidatura),'') <> ''
    AND COALESCE(btrim(biografia),'') <> ''
    AND COALESCE(btrim(naturalidade),'') <> ''
    AND data_nascimento IS NOT NULL
    AND COALESCE(btrim(formacao),'') <> ''
    AND COALESCE(btrim(profissao_declarada),'') <> ''
    AND COALESCE(btrim(genero),'') <> ''
    AND COALESCE(btrim(estado_civil),'') <> ''
    AND COALESCE(btrim(cor_raca),'') <> ''
    AND COALESCE(verificacao_campos,'{}'::jsonb) ? 'candidate_registration'
    AND COALESCE(verificacao_campos,'{}'::jsonb) ? 'candidate_complement'
  )
) NOT VALID;
DO $$
BEGIN
  IF current_setting('pf.senado_roster_publicacao_previa', true) = 'not_valid' THEN
    RAISE NOTICE 'senado roster: constraint anterior NOT VALID (replay sintético); validação mantida adiada';
  ELSE
    ALTER TABLE public.candidatos VALIDATE CONSTRAINT candidatos_publicacao_minima_2026_check;
  END IF;
END $$;

COMMIT;
