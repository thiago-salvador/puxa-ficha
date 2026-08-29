BEGIN;

ALTER TABLE public.candidatos
  DROP CONSTRAINT IF EXISTS candidatos_publicacao_minima_2026_check;

-- Rollback conservador sobre a assinatura exata desta forward migration.
DO $$
DECLARE forward_at timestamptz;
BEGIN
  -- O rollback é raro e deliberado. Bloqueia o pequeno universo eleitoral
  -- inteiro antes do guard para impedir curadoria concorrente entre a leitura
  -- da assinatura e os UPDATEs restauradores abaixo.
  PERFORM 1 FROM public.candidatos FOR UPDATE;
  PERFORM 1 FROM public.chapas_2026 FOR UPDATE;

  SELECT ultima_atualizacao INTO forward_at
  FROM public.candidatos WHERE slug='cleber-rabelo';
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug='cleber-rabelo' AND status='removido' AND publicavel=false
      AND situacao_candidatura='renúncia'
  ) THEN
    RAISE EXCEPTION 'rollback recusado: Cleber Rabelo não está no estado da forward';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.candidatos
    WHERE slug='well-macedo'
      AND foto_url='https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/140002554108/PA'
  ) THEN
    RAISE EXCEPTION 'rollback recusado: ficha de Well Macedo divergiu da forward';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.candidatos c
    WHERE c.id IN (
      SELECT DISTINCT titular_candidato_id FROM public.chapas_2026
      WHERE titular_candidato_id IS NOT NULL
    )
      AND c.publicavel=true
      AND c.status<>'removido'
      AND c.ultima_atualizacao IS DISTINCT FROM forward_at
  ) THEN
    RAISE EXCEPTION 'rollback recusado: existe curadoria posterior à forward';
  END IF;
END $$;

UPDATE public.candidatos
SET status='pre-candidato',
    situacao_candidatura='registrada, aguardando julgamento',
    publicavel=true,
    ultima_atualizacao=now()
WHERE slug='cleber-rabelo';

UPDATE public.candidatos
SET fonte_dados=ARRAY(
      SELECT source FROM unnest(COALESCE(fonte_dados,ARRAY[]::text[])) source
      WHERE source <> 'TSE consulta_cand e consulta_cand_complementar 2026; snapshot 27/08/2026'
    ),
    ultima_atualizacao=now()
WHERE slug IN (
  'andre-luis','carlos-machado','dario-barbosa','elisson-ferreira','eudo-raffael',
  'francisco-jurity','huggo-leonardo','kiko-caputo','leonardo-avalanche','renato-gomes',
  'rico-pinheiro','roberio-paulino','well-macedo','witer-naves','yuri-ezequiel'
);

-- Restaura somente os campos que estavam vazios antes da forward. As listas
-- são derivadas do artefato de remediação versionado e preservam dados prévios.
UPDATE public.candidatos SET genero=NULL WHERE slug IN (
  'alexandre-kalil','andre-luis','andre-marinho','araceli-lemos','aroldo-felix',
  'ben-mendes','breno-barcelar','cadu-xavier','camila-falcao','carlos-machado',
  'coronel-busnello','cyro-garcia','dario-barbosa','dr-helton-monteiro','elisson-ferreira',
  'elizeu-aguiar','emanuel-cacho','eudo-raffael','francisco-jurity','gelson-merisio',
  'geraldo-carvalho','gisvaldo-oliveira','gustavo-henrique','henrique-areas','huggo-leonardo',
  'indira-xavier','isael-munduruku','jeremias-cosmo','jose-roberto-arruda','juliete-pantoja',
  'kiko-caputo','lais-chaud','laudicerio-aguiar','lenilda-luna','lourdes-melo',
  'luan-monteiro','lucia-santos','luis-cesar-bueno','luiz-franca','marcus-sodre',
  'mauricio-coelho','orleans-brandao','patrus-ananias','pedro-abib','priscila-voigt',
  'rafael-duda','rafaell-milas','ralf-zimmer','ravenna-castro','rejane-oliveira',
  'renan-hallais','renato-gomes','ricardo-marques','rico-pinheiro','roberio-paulino',
  'roberto-cidade','samuel-costa','sandro-alex','santiago-belizario','serley-leal',
  'thor-dantas','tulio-lopes','well-macedo','william-siri','witer-naves',
  'yuri-ezequiel','ze-batista'
);
UPDATE public.candidatos SET estado_civil=NULL WHERE slug IN (
  'alexandre-kalil','andre-luis','andre-marinho','araceli-lemos','aroldo-felix',
  'ataides-oliveira','ben-mendes','breno-barcelar','cadu-xavier','camila-falcao',
  'carlos-machado','coronel-busnello','cyro-garcia','dario-barbosa','dr-furlan',
  'dr-helton-monteiro','elisson-ferreira','elizeu-aguiar','emanuel-cacho','eudo-raffael',
  'fabio-mitidieri','francisco-jurity','gabriel-azevedo','gelson-merisio','geraldo-carvalho',
  'gisvaldo-oliveira','gustavo-henrique','henrique-areas','huggo-leonardo','indira-xavier',
  'isael-munduruku','jeremias-cosmo','jose-roberto-arruda','juliete-pantoja','kiko-caputo',
  'lais-chaud','laudicerio-aguiar','lenilda-luna','lourdes-melo','luan-monteiro',
  'lucia-santos','lucien-rezende','luis-cesar-bueno','luiz-franca','marcelo-brigadeiro',
  'marcus-sodre','mauricio-coelho','natasha-slhessarenko','orleans-brandao','patrus-ananias',
  'pedro-abib','priscila-voigt','rafael-duda','rafaell-milas','ralf-zimmer',
  'ravenna-castro','rejane-oliveira','renan-hallais','renato-gomes','ricardo-cappelli',
  'ricardo-marques','rico-pinheiro','roberio-paulino','roberto-cidade','samuel-costa',
  'sandro-alex','santiago-belizario','serley-leal','thor-dantas','tulio-lopes',
  'well-macedo','william-siri','witer-naves','yuri-ezequiel','ze-batista'
);
UPDATE public.candidatos SET cor_raca=NULL WHERE slug IN (
  'alexandre-kalil','andre-luis','andre-marinho','araceli-lemos','aroldo-felix',
  'ataides-oliveira','augusto-cury','ben-mendes','breno-barcelar','cadu-xavier',
  'camila-falcao','carlos-machado','clariana-barao','coronel-busnello','cyro-garcia',
  'dario-barbosa','dr-furlan','dr-helton-monteiro','edmilson-costa','elisson-ferreira',
  'elizeu-aguiar','emanuel-cacho','eudo-raffael','fabio-mitidieri','francisco-jurity',
  'gabriel-azevedo','gelson-merisio','geraldo-carvalho','gisvaldo-oliveira','gustavo-henrique',
  'henrique-areas','huggo-leonardo','indira-xavier','isael-munduruku','jeremias-cosmo',
  'jose-roberto-arruda','juliete-pantoja','kiko-caputo','lais-chaud','laudicerio-aguiar',
  'lenilda-luna','lourdes-melo','luan-monteiro','lucia-santos','lucien-rezende',
  'luis-cesar-bueno','luiz-franca','marcelo-brigadeiro','marcus-sodre','mauricio-coelho',
  'natasha-slhessarenko','orleans-brandao','patrus-ananias','pedro-abib','priscila-voigt',
  'rafael-duda','rafaell-milas','ralf-zimmer','ravenna-castro','rejane-oliveira',
  'renan-hallais','renato-gomes','ricardo-cappelli','ricardo-marques','rico-pinheiro',
  'roberio-paulino','roberto-cidade','samuel-costa','sandro-alex','santiago-belizario',
  'serley-leal','thor-dantas','tulio-lopes','well-macedo','william-siri',
  'wilson-grassi-junior','witer-naves','yuri-ezequiel','ze-batista'
);

UPDATE public.candidatos SET formacao=NULL WHERE slug IN (
  'andre-luis','carlos-machado','elisson-ferreira','eudo-raffael','francisco-jurity',
  'leonardo-avalanche','renato-gomes','rico-pinheiro','well-macedo','witer-naves','yuri-ezequiel'
);
UPDATE public.candidatos SET profissao_declarada=NULL WHERE slug IN (
  'andre-luis','carlos-machado','dario-barbosa','elisson-ferreira','huggo-leonardo',
  'kiko-caputo','renato-gomes','rico-pinheiro','roberio-paulino','well-macedo','yuri-ezequiel'
);
UPDATE public.candidatos
SET naturalidade=NULL,biografia=NULL,foto_url=NULL,redes_sociais='{}'::jsonb
WHERE slug IN ('well-macedo','rico-pinheiro');

UPDATE public.candidatos
SET verificacao_campos = verificacao_campos-'candidate_registration',
    ultima_atualizacao = now()
WHERE verificacao_campos->'candidate_registration'->>'fonte' = 'TSE Dados Abertos 2026 snapshot 27/08/2026';
UPDATE public.candidatos
SET verificacao_campos = verificacao_campos-'candidate_complement',
    ultima_atualizacao = now()
WHERE verificacao_campos->'candidate_complement'->>'fonte' = 'TSE Dados Abertos 2026 snapshot 27/08/2026';

WITH current_vice(titular_sq,vice_sq) AS (VALUES
  ('60002553922','60002553983'),('120002549681','120002554133'),
  ('140002554108','140002554109'),('190002550196','190002554226'),
  ('260002549466','260002554132'),('250002548080','250002554211')
)
UPDATE public.chapas_2026 ch
SET identidade_status='duplicidade_oficial'
FROM current_vice
WHERE ch.titular_sq_candidato=current_vice.titular_sq
  AND ch.vice_sq_candidato=current_vice.vice_sq;

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
LEFT JOIN public.candidatos_publico vice ON vice.id=ch.vice_candidato_id;
GRANT SELECT ON public.chapas_2026_publico TO anon, authenticated;

COMMIT;
