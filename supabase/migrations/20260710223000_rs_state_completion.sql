-- RS estadual: proveniencia de trajetoria e classificacao executiva de Gabriel Souza.
-- Fontes oficiais: TSE Dados Abertos, ALRS, Camara dos Deputados e Governo do RS.
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.candidatos WHERE estado = 'RS' AND publicavel = true
      AND slug IN ('priscila-voigt','gabriel-souza','rejane-oliveira','juliana-brizola','luciano-zucco','marcelo-maranata','edegar-pretto')) <> 7 THEN
    RAISE EXCEPTION 'RS estadual: coorte publica esperada nao encontrada';
  END IF;
END $$;

UPDATE public.historico_politico hp
SET proveniencia = CASE
  WHEN hp.observacoes ILIKE '%TSE%' OR hp.tipo_evento = 'candidatura' THEN 'tse'
  WHEN c.slug IN ('gabriel-souza','juliana-brizola','edegar-pretto') THEN 'manual'
  WHEN c.slug = 'luciano-zucco' THEN 'manual'
  WHEN c.slug = 'marcelo-maranata' THEN 'manual'
  ELSE 'manual'
END
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('priscila-voigt','gabriel-souza','rejane-oliveira','juliana-brizola','luciano-zucco','marcelo-maranata','edegar-pretto')
  AND hp.proveniencia IS NULL;

UPDATE public.candidatos
SET fonte_dados = ARRAY(
  SELECT DISTINCT source FROM unnest(
    coalesce(fonte_dados, ARRAY[]::text[]) ||
    CASE slug
      WHEN 'gabriel-souza' THEN ARRAY['https://vicegovernador.rs.gov.br/o-vice-governador','https://vicegovernador.rs.gov.br/atribuicoes','https://ww4.al.rs.gov.br']::text[]
      WHEN 'juliana-brizola' THEN ARRAY['https://ww4.al.rs.gov.br','https://dadosabertos.tse.jus.br']::text[]
      WHEN 'luciano-zucco' THEN ARRAY['https://dadosabertos.camara.leg.br','https://dadosabertos.tse.jus.br']::text[]
      WHEN 'marcelo-maranata' THEN ARRAY['https://www.diariomunicipal.com.br/famurs','https://dadosabertos.tse.jus.br']::text[]
      WHEN 'edegar-pretto' THEN ARRAY['https://ww4.al.rs.gov.br','https://dadosabertos.tse.jus.br']::text[]
      ELSE ARRAY['https://dadosabertos.tse.jus.br']::text[]
    END
  ) AS source
), ultima_atualizacao = NOW()
WHERE slug IN ('priscila-voigt','gabriel-souza','rejane-oliveira','juliana-brizola','luciano-zucco','marcelo-maranata','edegar-pretto');

-- Remove pareamento nominal indevido de 2020: o seed oficial de Rejane possui
-- apenas o SQ 210001605930 (2022).
DELETE FROM public.financiamento f USING public.candidatos c
WHERE f.candidato_id = c.id AND c.slug = 'rejane-oliveira' AND f.ano_eleicao = 2020;

-- Backfill reprodutivel dos totais oficiais extraidos pelo ingest TSE. O ingest
-- ao vivo preserva o detalhamento de bens/doadores quando a linha ja existe.
INSERT INTO public.patrimonio (candidato_id, ano_eleicao, valor_total, bens, fonte)
SELECT c.id, v.ano, v.valor, '[]'::jsonb, 'TSE Dados Abertos'
FROM public.candidatos c JOIN (VALUES
  ('priscila-voigt',2016,130000::numeric),('priscila-voigt',2020,160000::numeric),
  ('priscila-voigt',2022,160000::numeric),('priscila-voigt',2024,800::numeric),
  ('rejane-oliveira',2022,520000::numeric)
) v(slug,ano,valor) ON v.slug=c.slug
WHERE NOT EXISTS (SELECT 1 FROM public.patrimonio p WHERE p.candidato_id=c.id AND p.ano_eleicao=v.ano);

INSERT INTO public.financiamento (candidato_id, ano_eleicao, total_arrecadado, total_fundo_partidario, total_fundo_eleitoral, total_pessoa_fisica, total_recursos_proprios, maiores_doadores, fonte)
SELECT c.id, v.ano, v.valor, 0, 0, 0, 0, '[]'::jsonb, 'TSE Dados Abertos'
FROM public.candidatos c JOIN (VALUES
  ('priscila-voigt',2016,1913::numeric),('priscila-voigt',2020,13380::numeric),
  ('priscila-voigt',2022,43284::numeric),('priscila-voigt',2024,51451.45::numeric),
  ('rejane-oliveira',2022,58422.5::numeric)
) v(slug,ano,valor) ON v.slug=c.slug
WHERE NOT EXISTS (SELECT 1 FROM public.financiamento f WHERE f.candidato_id=c.id AND f.ano_eleicao=v.ano);

-- Gabriel e vice-governador desde 2023. O inventario oficial do GVG define atos
-- administrativos/normativos delegados, mas nao um mandato titular autonomo de
-- sancao de leis. O bloco legislacao executiva e, portanto, nao aplicavel no
-- contrato atual; exercicios temporarios do Governo nao sao convertidos em um
-- inventario ficticio de leis sancionadas.
UPDATE public.historico_politico hp
SET observacoes = concat_ws(' ', hp.observacoes,
  'Atribuicoes oficiais do vice-governador: https://vicegovernador.rs.gov.br/atribuicoes. Posse em 01/01/2023: https://vicegovernador.rs.gov.br/gabriel-souza-e-empossado-vice-governador-do-rio-grande-do-sul.')
FROM public.candidatos c
WHERE hp.candidato_id = c.id AND c.slug = 'gabriel-souza'
  AND hp.cargo_canonico = 'Vice-Governador'
  AND hp.observacoes NOT ILIKE '%vicegovernador.rs.gov.br/atribuicoes%';

DO $$
DECLARE null_provenance integer;
BEGIN
  SELECT count(*) INTO null_provenance
  FROM public.historico_politico hp JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug IN ('priscila-voigt','gabriel-souza','rejane-oliveira','juliana-brizola','luciano-zucco','marcelo-maranata','edegar-pretto')
    AND hp.proveniencia IS NULL;
  IF null_provenance <> 0 THEN RAISE EXCEPTION 'RS estadual: % linhas sem proveniencia', null_provenance; END IF;
END $$;

COMMIT;
