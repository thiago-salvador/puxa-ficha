-- Correcao de efeito colateral da reescrita de claims (20260726150000).
--
-- O QUE ACONTECEU
--
-- A claim de lula "Bolsa Familia: tirou 20 milhoes da pobreza extrema" foi
-- reescrita para caber na fonte viva anexada (Radio Senado, 16/09/2014). Mas
-- a substancia dessa fonte e a saida do Brasil do Mapa da Fome, e ja existia
-- na mesma ficha uma claim publicada sobre exatamente esse fato:
-- "Brasil saiu do Mapa da Fome da ONU em 2014" (5405e80e), com fonte primaria
-- da propria FAO, verificada e respondendo HTTP 200 em 26/07/2026.
--
-- Resultado: duas entradas dizendo a mesma coisa na ficha, o que soa como
-- enchimento e nao ajuda quem le.
--
-- POR QUE A REESCRITA NAO SOBREVIVE
--
-- O que distinguia a claim original eram justamente os numeros sem fonte
-- ("20 milhoes tirados da pobreza extrema", "14 milhoes de familias"). Sem
-- eles, ela nao tem conteudo proprio: colapsa na claim que ja existia. A
-- conclusao honesta e que ela nao volta ao ar, e nao que se force uma
-- diferenca de redacao para justificar duas entradas.
--
-- O QUE NAO SE PERDE
--
-- Os numeros que a fonte do Radio Senado de fato sustenta (75% de queda na
-- extrema pobreza entre 2001 e 2012, 82% de queda em subalimentados entre 2002
-- e 2013, cerca de R$ 35 bilhoes investidos) sao informacao real e nao estavam
-- na claim que fica. Eles entram nela, com a fonte anexada ao lado da fonte
-- primaria da FAO que ja estava la.
--
-- A primeira frase da claim que fica NAO foi alterada: ela e anterior a este
-- trabalho, tem fonte propria da FAO e nao passou pela conferencia desta
-- sessao. So foi acrescentado o que eu li e verifiquei.
BEGIN;

-- 1. A reescrita sai do ar como redundante.
UPDATE public.pontos_atencao
SET visivel = false,
    verificado = false,
    despublicacao_motivo = 'Redundante com a claim 5405e80e ("Brasil saiu do Mapa da Fome da ONU em 2014"), que cobre o mesmo fato com fonte primaria da FAO. O que distinguia esta claim eram numeros sem fonte, removidos na reescrita de 26/07; sem eles ela nao tem conteudo proprio.',
    despublicado_em = timestamptz '2026-07-26 14:00:00-03',
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'consolidacao_2026_07_26', jsonb_build_object(
        'veredito', 'redundante',
        'consolidada_em', '5405e80e-e8dc-4567-a5c3-bc2c166626b4',
        'motivo', 'a reescrita ancorada na fonte colapsou numa claim ja publicada sobre o mesmo fato',
        'reversivel', true
      )
    )
WHERE id = '3e3b5349-3a95-4786-af75-9c354c18ab07';

-- 2. A claim que fica recebe os numeros verificados e a fonte correspondente.
--
-- A fonte diz, literal:
--   "o numero de cidadaos em tais condicoes foi reduzido em 75% entre 2001 e
--    2012 (...) o numero de brasileiros subalimentados caiu 82% entre 2002 e
--    2013. O relatorio aponta que o pais investiu cerca de 35 bilhoes de reais
--    no combate a fome e atribui o sucesso aos Programas Fome Zero e Bolsa
--    Familia."
-- Fonte: https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu
UPDATE public.pontos_atencao
SET descricao = 'Políticas de segurança alimentar (Fome Zero, Bolsa Família, PRONAF) levaram o Brasil a sair do Mapa da Fome da FAO pela primeira vez na história, em 2014. O mesmo relatório aponta queda de 75% na extrema pobreza entre 2001 e 2012 e redução de 82% no número de brasileiros subalimentados entre 2002 e 2013, com investimento de cerca de R$ 35 bilhões no combate à fome. O período medido atravessa os governos Lula e Dilma.',
    fontes = fontes || jsonb_build_array(
      jsonb_build_object(
        'url', 'https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu',
        'data', '2014-09-16',
        'titulo', 'Rádio Senado: Brasil saiu do Mapa da Fome produzido pela ONU'
      )
    ),
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'consolidacao_2026_07_26', jsonb_build_object(
        'motivo', 'recebeu os numeros medidos e a fonte do Radio Senado, vindos da claim 3e3b5349, que saiu do ar por redundancia',
        'fonte_adicionada', 'https://www12.senado.leg.br/radio/1/noticia/2014/09/16/brasil-saiu-do-mapa-da-fome-produzido-pela-onu',
        'http_status_conferido', '200 em 2026-07-26',
        'primeira_frase_preservada', 'texto anterior a esta sessao, com fonte propria da FAO, nao conferido aqui'
      )
    )
WHERE id = '5405e80e-e8dc-4567-a5c3-bc2c166626b4'
  AND descricao NOT LIKE '%75%';

-- ---------------------------------------------------------------------------
DO $$
DECLARE
  duplicadas integer;
  consolidada_ok integer;
BEGIN
  SELECT COUNT(*) INTO duplicadas
  FROM public.pontos_atencao pa
  JOIN public.candidatos c ON c.id = pa.candidato_id
  WHERE c.slug = 'lula' AND pa.visivel AND pa.titulo ILIKE '%Mapa da Fome%';

  IF duplicadas <> 1 THEN
    RAISE EXCEPTION 'consolidar_mapa_da_fome: esperado 1 claim visivel sobre o Mapa da Fome, encontrado %', duplicadas;
  END IF;

  SELECT COUNT(*) INTO consolidada_ok
  FROM public.pontos_atencao
  WHERE id = '5405e80e-e8dc-4567-a5c3-bc2c166626b4'
    AND visivel
    AND descricao LIKE '%75%'
    AND jsonb_array_length(fontes) = 2;

  IF consolidada_ok <> 1 THEN
    RAISE EXCEPTION 'consolidar_mapa_da_fome: a claim que fica precisa dos numeros e das duas fontes';
  END IF;
END $$;

COMMIT;

-- Verificacao pos-aplicacao (rodar manualmente):
--
--   select pa.titulo, pa.visivel, jsonb_array_length(pa.fontes) as fontes
--     from public.pontos_atencao pa
--     join public.candidatos c on c.id = pa.candidato_id
--    where c.slug = 'lula' and pa.titulo ilike '%fome%';
--   -- esperado: 1 linha visivel, com 2 fontes.
