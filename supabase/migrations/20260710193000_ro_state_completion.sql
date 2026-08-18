-- RO estadual: perfis, trajetoria e proveniencia rastreavel.
-- Fontes: TSE Dados Abertos, Portal da Transparencia RO, Camara dos Deputados e FCR.

BEGIN;

DO $$
BEGIN
  IF (
    SELECT count(*) FROM public.candidatos
    WHERE slug IN (
      'adailton-furia', 'dr-fernando-maximo', 'expedito-netto', 'hildon-chaves',
      'luiz-carlos-teodoro', 'marcos-rogerio', 'pedro-abib', 'ricardo-frota',
      'samuel-costa', 'sergio-goncalves'
    ) AND publicavel = true AND estado = 'RO'
  ) <> 10 THEN
    RAISE EXCEPTION 'RO estadual: coorte publica esperada nao encontrada';
  END IF;
END $$;

UPDATE public.historico_politico hp
SET proveniencia = CASE WHEN hp.observacoes ILIKE '%TSE%' THEN 'tse' ELSE 'manual' END
FROM public.candidatos c
WHERE hp.candidato_id = c.id
  AND c.slug IN ('adailton-furia', 'dr-fernando-maximo', 'expedito-netto', 'hildon-chaves', 'marcos-rogerio')
  AND hp.proveniencia IS NULL;

UPDATE public.candidatos
SET
  data_nascimento = CASE WHEN slug = 'ricardo-frota' THEN DATE '1979-10-01' ELSE data_nascimento END,
  naturalidade = CASE WHEN slug = 'ricardo-frota' THEN 'Porto Velho/RO' ELSE naturalidade END,
  profissao_declarada = CASE
    WHEN slug = 'ricardo-frota' THEN 'Advogado'
    WHEN slug = 'sergio-goncalves' THEN 'Empresario'
    WHEN slug = 'pedro-abib' THEN 'Advogado e professor universitario'
    ELSE profissao_declarada
  END,
  fonte_dados = ARRAY(
    SELECT DISTINCT source FROM unnest(
      coalesce(fonte_dados, ARRAY[]::text[]) ||
      CASE slug
        WHEN 'ricardo-frota' THEN ARRAY['TSE Dados Abertos consulta_cand 2012 e 2024']::text[]
        WHEN 'sergio-goncalves' THEN ARRAY['Portal da Transparencia do Governo de Rondonia']::text[]
        WHEN 'pedro-abib' THEN ARRAY['Faculdade Catolica de Rondonia - perfil institucional']::text[]
        ELSE ARRAY[]::text[]
      END
    ) AS source
  ),
  ultima_atualizacao = NOW()
WHERE slug IN ('ricardo-frota', 'sergio-goncalves', 'pedro-abib');

INSERT INTO public.historico_politico (
  candidato_id, tipo_evento, cargo, cargo_canonico, estado,
  periodo_inicio, periodo_fim, partido, eleito_por, observacoes, proveniencia
)
SELECT c.id, 'candidatura', 'Candidatura a Prefeito', 'Candidatura a Prefeito', 'RO',
  2024, 2024, 'NOVO', 'nao eleito',
  'Consulta_cand TSE 2024: Ricardo Furtado da Frota, prefeito de Porto Velho/RO, SQ 220002116683, resultado NAO ELEITO.', 'tse'
FROM public.candidatos c WHERE c.slug = 'ricardo-frota'
AND NOT EXISTS (SELECT 1 FROM public.historico_politico hp WHERE hp.candidato_id = c.id AND hp.periodo_inicio = 2024 AND hp.cargo_canonico = 'Candidatura a Prefeito');

INSERT INTO public.historico_politico (
  candidato_id, tipo_evento, cargo, cargo_canonico, estado,
  periodo_inicio, periodo_fim, partido, eleito_por, observacoes, proveniencia
)
SELECT c.id, 'mandato', 'Vice-Governador de Rondonia', 'Vice-Governador', 'RO',
  2023, NULL, 'UNIAO', 'eleito',
  'Vice-governador em exercicio, conforme Portal da Transparencia do Governo de Rondonia.', 'manual'
FROM public.candidatos c WHERE c.slug = 'sergio-goncalves'
AND NOT EXISTS (SELECT 1 FROM public.historico_politico hp WHERE hp.candidato_id = c.id AND hp.cargo_canonico = 'Vice-Governador' AND hp.periodo_inicio = 2023);

INSERT INTO public.historico_politico (
  candidato_id, tipo_evento, cargo, cargo_canonico, estado,
  periodo_inicio, periodo_fim, partido, eleito_por, observacoes, proveniencia
)
SELECT c.id, 'candidatura', 'Pre-candidatura ao Governo de Rondonia', 'Pre-candidatura a Governador', 'RO',
  2026, 2026, 'MDB', NULL,
  'Primeira disputa eleitoral informada no perfil publico; formacao e atividade profissional verificadas no perfil institucional da Faculdade Catolica de Rondonia.', 'manual'
FROM public.candidatos c WHERE c.slug = 'pedro-abib'
AND NOT EXISTS (SELECT 1 FROM public.historico_politico hp WHERE hp.candidato_id = c.id AND hp.periodo_inicio = 2026 AND hp.cargo_canonico = 'Pre-candidatura a Governador');

DO $$
DECLARE empty_history integer; null_provenance integer;
BEGIN
  SELECT count(*) INTO empty_history FROM public.candidatos c
  WHERE c.slug IN ('adailton-furia','dr-fernando-maximo','expedito-netto','hildon-chaves','luiz-carlos-teodoro','marcos-rogerio','pedro-abib','ricardo-frota','samuel-costa','sergio-goncalves')
  AND NOT EXISTS (SELECT 1 FROM public.historico_politico hp WHERE hp.candidato_id = c.id);
  SELECT count(*) INTO null_provenance FROM public.historico_politico hp JOIN public.candidatos c ON c.id = hp.candidato_id
  WHERE c.slug IN ('adailton-furia','dr-fernando-maximo','expedito-netto','hildon-chaves','luiz-carlos-teodoro','marcos-rogerio','pedro-abib','ricardo-frota','samuel-costa','sergio-goncalves') AND hp.proveniencia IS NULL;
  IF empty_history <> 0 OR null_provenance <> 0 THEN RAISE EXCEPTION 'RO estadual: residual historico (empty %, null provenance %)', empty_history, null_provenance; END IF;
END $$;

COMMIT;
