BEGIN;

DO $$
DECLARE snapshot_rows integer;
BEGIN
  PERFORM set_config('pf.candidate_roster_integrity_apply','false',true);
  SELECT count(*) INTO snapshot_rows
  FROM public.chapas_2026
  WHERE fonte_sha256='eae2178d1d87c6f66c81ac5c6a56f10118a0bff373068135531315cec6f74a27';
  IF snapshot_rows=0 THEN
    RAISE NOTICE 'replay vazio sem o snapshot oficial anterior; curadoria ignorada';
    RETURN;
  END IF;
  IF snapshot_rows<>220 THEN
    RAISE EXCEPTION 'pre-condição: esperava 220 chapas do snapshot oficial anterior, encontrou %', snapshot_rows;
  END IF;
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN ('cleber-rabelo','well-macedo','rico-pinheiro'))<>3 THEN
    RAISE EXCEPTION 'pre-condição: fichas-alvo divergiram do baseline esperado';
  END IF;
  PERFORM set_config('pf.candidate_roster_integrity_apply','true',true);
END $$;

-- Remove da superfície pública candidaturas que chegaram a situação terminal
-- no DivulgaCand. O registro histórico permanece preservado na tabela-base.
-- @write tabela=candidatos slug=cleber-rabelo campos=status,situacao_candidatura,publicavel,ultima_atualizacao
UPDATE public.candidatos
SET status = 'removido',
    situacao_candidatura = 'renúncia',
    publicavel = false,
    ultima_atualizacao = now()
WHERE slug = 'cleber-rabelo'
  AND current_setting('pf.candidate_roster_integrity_apply',true)='true';

-- Completa, apenas quando vazio, todos os campos oficiais ausentes encontrados
-- na varredura integral das fichas públicas de Presidente e Governador.
WITH profile_data(
  slug,sq_candidato,formacao,profissao,genero,estado_civil,cor_raca,
  naturalidade,biografia,foto_url,redes_sociais
) AS (VALUES
  ('andre-luis','100002544076','Superior incompleto','Empresário','Masculino','Casado(a)','Preta',NULL,NULL,NULL,NULL::jsonb),
  ('carlos-machado','250002550913','Superior completo','Professor de ensino médio','Masculino','Solteiro(a)','Parda',NULL,NULL,NULL,NULL::jsonb),
  ('dario-barbosa','200002542481','Superior completo','Professor de ensino médio','Masculino','Casado(a)','Parda',NULL,NULL,NULL,NULL::jsonb),
  ('elisson-ferreira','70002551298','Superior completo','Jornalista e redator','Masculino','Casado(a)','Parda',NULL,NULL,NULL,NULL::jsonb),
  ('eudo-raffael','10002549500','Superior incompleto','Bancário e economiário','Masculino','Solteiro(a)','Parda',NULL,NULL,NULL,NULL::jsonb),
  ('francisco-jurity','180002548565','Superior completo','Servidor público civil aposentado','Masculino','Casado(a)','Branca',NULL,NULL,NULL,NULL::jsonb),
  ('huggo-leonardo','60002540417','Superior completo','Servidor público estadual','Masculino','Casado(a)','Parda',NULL,NULL,NULL,NULL::jsonb),
  ('kiko-caputo','70002547775','Superior completo','Advogado','Masculino','Casado(a)','Branca',NULL,NULL,NULL,NULL::jsonb),
  ('leonardo-avalanche','280002553883','Superior completo','Servidor público estadual','Masculino','Casado(a)','Branca',NULL,NULL,NULL,NULL::jsonb),
  ('renato-gomes','120002549681','Superior completo','Capitalista de ativos financeiros','Masculino','Casado(a)','Branca',NULL,NULL,NULL,NULL::jsonb),
  ('rico-pinheiro','70002553982','Superior completo','Economista','Masculino','Casado(a)','Branca','Macapá (AP)',
    'Rico Pinheiro é candidato ao Governo do Distrito Federal pelo PRTB nas eleições de 2026. Declarou ao TSE a ocupação de economista e escolaridade superior completa.',
    'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/70002553982/DF',NULL::jsonb),
  ('roberio-paulino','200002546757','Superior completo','Professor de ensino superior','Masculino','Casado(a)','Branca',NULL,NULL,NULL,NULL::jsonb),
  ('well-macedo','140002554108','Superior incompleto','Comunicólogo','Feminino','Solteiro(a)','Preta','Belém (PA)',
    'Well Macedo é candidata ao Governo do Pará pelo PSTU nas eleições de 2026. Declarou ao TSE a ocupação de comunicólogo e escolaridade superior incompleta.',
    'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/140002554108/PA',
    '{"instagram":{"url":"https://www.instagram.com/wellmacedo/","username":"wellmacedo","followers":null}}'::jsonb),
  ('witer-naves','270002539187','Superior completo','Professor de ensino médio','Masculino','Divorciado(a)','Branca',NULL,NULL,NULL,NULL::jsonb),
  ('yuri-ezequiel','150002540204','Superior completo','Advogado','Masculino','Solteiro(a)','Parda',NULL,NULL,NULL,NULL::jsonb)
), verified AS (
  SELECT *, jsonb_build_object(
    'candidate_registration', jsonb_build_object(
      'fonte', 'TSE Dados Abertos 2026 snapshot 27/08/2026',
      'estado', 'publicado',
      'verificado_em', '2026-08-28'
    ),
    'candidate_complement', jsonb_build_object(
      'fonte', 'TSE Dados Abertos 2026 snapshot 27/08/2026',
      'estado', 'publicado',
      'verificado_em', '2026-08-28'
    )
  ) AS official_verification
  FROM profile_data
)
-- @write tabela=candidatos ref=integridade-publicacao-20260829 campos=formacao,profissao_declarada,genero,estado_civil,cor_raca,naturalidade,biografia,foto_url,redes_sociais,fonte_dados,verificacao_campos,ultima_atualizacao
UPDATE public.candidatos c
SET formacao = COALESCE(NULLIF(btrim(c.formacao), ''), d.formacao),
    profissao_declarada = COALESCE(NULLIF(btrim(c.profissao_declarada), ''), d.profissao),
    genero = COALESCE(NULLIF(btrim(c.genero), ''), d.genero),
    estado_civil = COALESCE(NULLIF(btrim(c.estado_civil), ''), d.estado_civil),
    cor_raca = COALESCE(NULLIF(btrim(c.cor_raca), ''), d.cor_raca),
    naturalidade = COALESCE(NULLIF(btrim(c.naturalidade), ''), d.naturalidade),
    biografia = COALESCE(NULLIF(btrim(c.biografia), ''), d.biografia),
    foto_url = COALESCE(NULLIF(btrim(c.foto_url), ''), d.foto_url),
    redes_sociais = CASE
      WHEN d.redes_sociais IS NULL THEN c.redes_sociais
      WHEN c.redes_sociais IS NULL OR c.redes_sociais = '{}'::jsonb THEN d.redes_sociais
      ELSE c.redes_sociais
    END,
    fonte_dados = ARRAY(
      SELECT DISTINCT source
      FROM unnest(
        COALESCE(c.fonte_dados, ARRAY[]::text[]) ||
        ARRAY['TSE consulta_cand e consulta_cand_complementar 2026; snapshot 27/08/2026']
      ) source
    ),
    -- A evidência anterior vence quando a chave já existia.
    verificacao_campos = d.official_verification || COALESCE(c.verificacao_campos, '{}'::jsonb),
    ultima_atualizacao = now()
FROM verified d
WHERE c.slug = d.slug
  AND current_setting('pf.candidate_roster_integrity_apply',true)='true';

-- Fecha as lacunas demográficas de todas as fichas públicas encontradas na
-- mesma varredura. Os grupos abaixo são uma projeção sem PII do CSV oficial,
-- versionada em data/tse-candidate-demographics-remediation-20260829.json.
WITH demographic_groups(slugs,genero,estado_civil,cor_raca) AS (VALUES
  (ARRAY['lucia-santos','natasha-slhessarenko'],'Feminino','Casado(a)','Branca'),
  (ARRAY['ravenna-castro'],'Feminino','Casado(a)','Parda'),
  (ARRAY['lenilda-luna'],'Feminino','Divorciado(a)','Parda'),
  (ARRAY['araceli-lemos'],'Feminino','Divorciado(a)','Preta'),
  (ARRAY['camila-falcao','clariana-barao','juliete-pantoja','lais-chaud','priscila-voigt'],'Feminino','Solteiro(a)','Branca'),
  (ARRAY['lourdes-melo'],'Feminino','Solteiro(a)','Parda'),
  (ARRAY['indira-xavier','rejane-oliveira','well-macedo'],'Feminino','Solteiro(a)','Preta'),
  (ARRAY['alexandre-kalil','aroldo-felix','augusto-cury','dr-furlan','elizeu-aguiar','fabio-mitidieri','francisco-jurity','gelson-merisio','kiko-caputo','luiz-franca','marcelo-brigadeiro','marcus-sodre','mauricio-coelho','orleans-brandao','pedro-abib','rafaell-milas','ralf-zimmer','renato-gomes','ricardo-cappelli','ricardo-marques','rico-pinheiro','roberio-paulino','roberto-cidade','sandro-alex','thor-dantas','william-siri','ze-batista'],'Masculino','Casado(a)','Branca'),
  (ARRAY['isael-munduruku'],'Masculino','Casado(a)','Indígena'),
  (ARRAY['breno-barcelar','dario-barbosa','dr-helton-monteiro','elisson-ferreira','emanuel-cacho','huggo-leonardo','renan-hallais'],'Masculino','Casado(a)','Parda'),
  (ARRAY['andre-luis','ben-mendes','cyro-garcia','gisvaldo-oliveira'],'Masculino','Casado(a)','Preta'),
  (ARRAY['cadu-xavier','jose-roberto-arruda','lucien-rezende','wilson-grassi-junior','witer-naves'],'Masculino','Divorciado(a)','Branca'),
  (ARRAY['ataides-oliveira','samuel-costa'],'Masculino','Divorciado(a)','Parda'),
  (ARRAY['geraldo-carvalho'],'Masculino','Separado(a) judicialmente','Preta'),
  (ARRAY['andre-marinho','coronel-busnello','gabriel-azevedo','gustavo-henrique','henrique-areas','luan-monteiro','luis-cesar-bueno','rafael-duda'],'Masculino','Solteiro(a)','Branca'),
  (ARRAY['carlos-machado','edmilson-costa','eudo-raffael','jeremias-cosmo','laudicerio-aguiar','serley-leal','tulio-lopes','yuri-ezequiel'],'Masculino','Solteiro(a)','Parda'),
  (ARRAY['santiago-belizario'],'Masculino','Solteiro(a)','Preta'),
  (ARRAY['patrus-ananias'],'Masculino','Viúvo(a)','Branca')
), official_demographics AS (
  SELECT unnest(slugs) AS slug,genero,estado_civil,cor_raca
  FROM demographic_groups
)
-- @write tabela=candidatos ref=integridade-demografica-20260829 campos=genero,estado_civil,cor_raca,ultima_atualizacao
UPDATE public.candidatos c
SET genero = COALESCE(NULLIF(btrim(c.genero),''),d.genero),
    estado_civil = COALESCE(NULLIF(btrim(c.estado_civil),''),d.estado_civil),
    cor_raca = COALESCE(NULLIF(btrim(c.cor_raca),''),d.cor_raca),
    ultima_atualizacao = now()
FROM official_demographics d
WHERE c.slug=d.slug
  AND current_setting('pf.candidate_roster_integrity_apply',true)='true';

-- Normaliza a procedência para todo o universo publicado que está ancorado em
-- uma inscrição oficial, sem substituir nenhuma verificação já existente.
WITH linked_candidates AS (
  SELECT DISTINCT titular_candidato_id AS candidato_id
  FROM public.chapas_2026
  WHERE titular_candidato_id IS NOT NULL
), official_verification AS (
  SELECT jsonb_build_object(
    'candidate_registration', jsonb_build_object(
      'fonte', 'TSE Dados Abertos 2026 snapshot 27/08/2026',
      'estado', 'publicado',
      'verificado_em', '2026-08-28'
    ),
    'candidate_complement', jsonb_build_object(
      'fonte', 'TSE Dados Abertos 2026 snapshot 27/08/2026',
      'estado', 'publicado',
      'verificado_em', '2026-08-28'
    )
  ) AS payload
)
-- @write tabela=candidatos ref=integridade-procedencia-20260829 campos=verificacao_campos,ultima_atualizacao
UPDATE public.candidatos c
SET verificacao_campos = official_verification.payload || COALESCE(c.verificacao_campos, '{}'::jsonb),
    ultima_atualizacao = now()
FROM linked_candidates, official_verification
WHERE c.id = linked_candidates.candidato_id
  AND c.publicavel = true
  AND c.status <> 'removido'
  AND current_setting('pf.candidate_roster_integrity_apply',true)='true';

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

DO $$
BEGIN
  IF current_setting('pf.candidate_roster_integrity_apply',true)='true'
     OR (SELECT count(*) FROM public.candidatos
         WHERE publicavel=true AND cargo_disputado IN ('Presidente','Governador'))=0 THEN
    ALTER TABLE public.candidatos
      VALIDATE CONSTRAINT candidatos_publicacao_minima_2026_check;
  END IF;
END $$;

-- Resolve substituições de vice com a situação vigente do DivulgaCand.
-- As duas inscrições ativas de Laudicério continuam em quarentena.
WITH current_vice(titular_sq,vice_sq) AS (VALUES
  ('60002553922','60002553983'),
  ('120002549681','120002554133'),
  ('140002554108','140002554109'),
  ('190002550196','190002554226'),
  ('260002549466','260002554132'),
  ('250002548080','250002554211'),
  ('250002544912','250002552372')
)
-- @write tabela=chapas_2026 ref=divulgacand-vices-20260828 campos=identidade_status
UPDATE public.chapas_2026 ch
SET identidade_status = CASE
  WHEN ch.vice_sq_candidato = current_vice.vice_sq THEN 'confirmada'
  ELSE 'duplicidade_oficial'
END
FROM current_vice
WHERE ch.titular_sq_candidato = current_vice.titular_sq
  AND ch.identidade_status IN ('confirmada','duplicidade_oficial')
  AND current_setting('pf.candidate_roster_integrity_apply',true)='true';

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
  IF (SELECT count(*) FROM public.candidatos WHERE slug IN (
    'andre-luis','carlos-machado','dario-barbosa','elisson-ferreira','eudo-raffael',
    'francisco-jurity','huggo-leonardo','kiko-caputo','leonardo-avalanche','renato-gomes',
    'rico-pinheiro','roberio-paulino','well-macedo','witer-naves','yuri-ezequiel'
  )) <> 15 THEN
    RAISE EXCEPTION 'integridade de publicação: esperava as 15 fichas auditadas';
  END IF;
  IF EXISTS (SELECT 1 FROM public.candidatos_publico WHERE slug='cleber-rabelo') THEN
    RAISE EXCEPTION 'integridade de publicação: Cleber Rabelo ainda está público';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.candidatos_publico
    WHERE cargo_disputado IN ('Presidente','Governador')
      AND (
        COALESCE(btrim(foto_url),'')='' OR COALESCE(btrim(biografia),'')='' OR
        COALESCE(btrim(naturalidade),'')='' OR data_nascimento IS NULL OR
        COALESCE(btrim(formacao),'')='' OR COALESCE(btrim(profissao_declarada),'')='' OR
        COALESCE(btrim(genero),'')='' OR COALESCE(btrim(estado_civil),'')='' OR
        COALESCE(btrim(cor_raca),'')='' OR
        NOT (verificacao_campos ? 'candidate_registration') OR
        NOT (verificacao_campos ? 'candidate_complement')
      )
  ) THEN
    RAISE EXCEPTION 'integridade de publicação: ainda existe ficha pública abaixo do gate mínimo';
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
