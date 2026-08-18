-- Fechamento BA Governador: curadoria de resíduos materiais do status real.
-- Escopo: acm-neto, jeronimo, ronaldo-mansur.
-- Não cria inventário novo; remove dados contraditórios e registra proveniência em linhas já materializadas.

BEGIN;

DO $$
DECLARE
  v_acm uuid;
  v_jeronimo uuid;
  v_ronaldo uuid;
BEGIN
  SELECT id INTO v_acm FROM public.candidatos_publico WHERE slug = 'acm-neto';
  SELECT id INTO v_jeronimo FROM public.candidatos_publico WHERE slug = 'jeronimo';
  SELECT id INTO v_ronaldo FROM public.candidatos_publico WHERE slug = 'ronaldo-mansur';

  IF v_acm IS NULL OR v_jeronimo IS NULL OR v_ronaldo IS NULL THEN
    RAISE EXCEPTION 'BA Governador: candidato esperado ausente no Supabase';
  END IF;

  -- ACM Neto: remover agregados sobrepostos; manter mandatos/candidaturas granulares.
  DELETE FROM public.historico_politico
  WHERE candidato_id = v_acm
    AND id IN (
      'b5df5b3c-22d7-4edd-a4a7-841a3f9b1e19',
      'c61718b4-d0ef-4cdc-b963-90c0fa8d5265'
    );

  UPDATE public.historico_politico
  SET proveniencia = 'tse'
  WHERE candidato_id = v_acm
    AND proveniencia IS NULL;

  -- Jerônimo: linhas Câmara eram de identidade não comprovada; seed não tem id Câmara e API oficial não encontra deputado.
  DELETE FROM public.projetos_lei
  WHERE candidato_id = v_jeronimo
    AND fonte = 'Camara'
    AND coverage_id IS NULL;

  DELETE FROM public.votos_candidato
  WHERE candidato_id = v_jeronimo;

  DELETE FROM public.gastos_parlamentares
  WHERE candidato_id = v_jeronimo
    AND fonte = 'Camara';

  -- Jerônimo: manter linha manual de mandato 2023+ e remover duplicatas de governador sem janela.
  DELETE FROM public.historico_politico
  WHERE candidato_id = v_jeronimo
    AND id IN (
      '4ae70ec3-e53a-4824-9f09-f8fe5030e7b7',
      '865b20f3-43f4-40d5-820d-4dff08a5f560'
    );

  UPDATE public.historico_politico
  SET proveniencia = 'tse'
  WHERE candidato_id = v_jeronimo
    AND proveniencia IS NULL;

  -- Ronaldo Mansur: candidaturas TSE e troca PSOL->PSOL não é mudança partidária.
  UPDATE public.historico_politico
  SET proveniencia = 'tse'
  WHERE candidato_id = v_ronaldo
    AND proveniencia IS NULL;

  DELETE FROM public.mudancas_partido
  WHERE candidato_id = v_ronaldo
    AND partido_anterior = partido_novo;

  -- Pontos IA sem fonte/verificação não devem sustentar completude pública.
  UPDATE public.pontos_atencao
  SET
    visivel = false,
    verificado = false,
    descricao = descricao || ' [Oculto em 2026-07-05: ponto gerado por IA sem fonte primária/verificação suficiente no fechamento BA Governador.]'
  WHERE candidato_id IN (v_acm, v_jeronimo, v_ronaldo)
    AND gerado_por = 'ia'
    AND verificado = false
    AND visivel = true;
END $$;

COMMIT;
