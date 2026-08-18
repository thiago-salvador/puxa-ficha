-- GO Governador: saneamento de proveniencia e pontos IA antes do fechamento.
-- Fontes: TSE materializado no historico existente; Senado/Camara/curadoria ja
-- presentes nos registros publicos; pontos IA ocultados por falta de verificacao.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'cintia-dias' AND publicavel = true) THEN
    RAISE EXCEPTION 'cintia-dias nao encontrada ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'daniel-vilela' AND publicavel = true) THEN
    RAISE EXCEPTION 'daniel-vilela nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'marconi-perillo' AND publicavel = true) THEN
    RAISE EXCEPTION 'marconi-perillo nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'telemaco-brandao' AND publicavel = true) THEN
    RAISE EXCEPTION 'telemaco-brandao nao encontrado ou nao publicavel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.candidatos WHERE slug = 'wilder-morais' AND publicavel = true) THEN
    RAISE EXCEPTION 'wilder-morais nao encontrado ou nao publicavel';
  END IF;
END $$;

UPDATE public.historico_politico hp
SET proveniencia = 'tse'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('daniel-vilela', 'marconi-perillo', 'wilder-morais')
  AND hp.proveniencia IS NULL
  AND (
    hp.observacoes ILIKE '%TSE%'
    OR hp.eleito_por = 'voto direto'
  );

UPDATE public.historico_politico hp
SET proveniencia = 'misto'
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'daniel-vilela'
  AND hp.proveniencia IS NULL
  AND hp.observacoes ILIKE '%curadoria%';

DELETE FROM public.historico_politico hp
USING public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug = 'wilder-morais'
  AND hp.id = 'de138b14-c70e-4306-b4a4-f05a0890a814'
  AND EXISTS (
    SELECT 1
    FROM public.historico_politico canonical
    WHERE canonical.candidato_id = c.id
      AND canonical.cargo = 'Senador'
      AND canonical.periodo_inicio = 2023
      AND canonical.periodo_fim = 2031
  );

UPDATE public.pontos_atencao
SET
  visivel = false,
  verificado = false,
  descricao = descricao || ' [Oculto em 2026-07-06: ponto gerado por IA nao verificado no fechamento GO Governador; para Wilder, contradizia mandato de senador ja materializado.]'
WHERE id IN (
  'c1d107df-59e5-4a57-9249-578c18213cac',
  '3715ece3-3124-4940-acf5-6e2d30666d9b',
  '0060d42d-335d-4da2-afe4-18359d3507e1'
);
