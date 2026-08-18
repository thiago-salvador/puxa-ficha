-- Veredito final das duas claims que sobraram fora do ar, para deixarem de ser
-- pendencia aberta e passarem a ser decisao registrada.
--
-- As duas foram trabalhadas de novo em 26/07/2026, com busca ativa de fonte.
-- O resultado e o mesmo nas duas: nao ha, hoje, fonte que sustente a claim na
-- ficha em que ela estava. Isso e um veredito, nao um item de lista.
--
-- =====================================================================
-- 1. renan-santos, MBL e Atlas Network
-- =====================================================================
--
-- A reportagem da Agencia Publica (23/06/2015, HTTP 200) documenta bem o
-- vinculo institucional entre o MBL, o Estudantes pela Liberdade e a Atlas
-- Network. O que ela NAO faz e nomear Renan Santos: as pessoas que ela cita
-- na criacao da marca MBL sao Juliano Torres, Fabio Ostermann, Felipe Franca,
-- Kim Kataguiri e um "Renan Haas".
--
-- Alem disso, a unica cifra sobre os Koch na materia e a fala do proprio
-- presidente da Atlas ("A Atlas recebe 0,5% de financiamento dos Koch"), que
-- nao equivale ao titulo publicado "MBL financiado por Atlas Network e Koch
-- Brothers".
--
-- Criterio para reabrir: fonte que nomeie Renan Santos e sustente o vinculo
-- afirmado. Enquanto nao houver, a claim nao volta.
--
-- =====================================================================
-- 2. lula, mensalao (AP 470)
-- =====================================================================
--
-- O PDF da AP 470 no site do STF responde HTTP 403 e nao pode ser lido. Fui
-- atras de substituto no portal de noticias do STF, que responde 200, e ele
-- tem material sobre a AP 470. O material sustenta:
--
--   - que AP 470 e o "mensalao" (o proprio STF faz a equivalencia)
--   - que houve parlamentares e empresarios condenados
--   - que o STF julgou improcedentes as ADIs 4887, 4888 e 4889, decidindo que
--     retirar os votos dos deputados condenados nao anula a EC 41/2003
--
-- O que nenhuma dessas fontes sustenta e justamente o que a claim afirmava:
-- o numero de 25 condenados e a nao denuncia de Lula. E, mais importante,
-- nenhuma delas NOMEIA Lula.
--
-- Este e o mesmo criterio aplicado ao caso do renan-santos acima, e aplica-lo
-- de forma desigual seria o pior dos mundos: publicar sobre uma pessoa o que
-- a fonte nao diz, so porque o caso e conhecido.
--
-- Criterio para reabrir: fonte que nomeie Lula e sustente a afirmacao feita
-- sobre ele, seja a de nao ter sido denunciado, seja outra.
BEGIN;

UPDATE public.pontos_atencao
SET despublicacao_motivo = 'Decidido em 2026-07-26 apos busca ativa de fonte: a materia da Agencia Publica documenta o vinculo MBL/EPL/Atlas mas nao nomeia Renan Santos, e a unica cifra sobre os Koch e sobre o financiamento da Atlas, nao do MBL. Reabre com fonte que o nomeie.',
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'veredito_final_2026_07_26', jsonb_build_object(
        'situacao', 'nao republicavel com as fontes disponiveis',
        'busca_feita', 'fonte anexada relida em 26/07; nenhuma fonte encontrada que nomeie o candidato',
        'criterio_para_reabrir', 'fonte que nomeie Renan Santos e sustente o vinculo afirmado'
      )
    )
WHERE id = 'e7848052-52f1-40bb-a4a1-1b9075f7256f'
  AND visivel IS NOT TRUE;

UPDATE public.pontos_atencao
SET despublicacao_motivo = 'Decidido em 2026-07-26 apos busca ativa de fonte: o PDF da AP 470 no STF responde 403, e as materias do portal de noticias do STF sustentam o caso e as condenacoes de parlamentares e empresarios, mas nao nomeiam Lula nem trazem o numero de 25 condenados. Mesmo criterio aplicado ao caso renan-santos.',
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'veredito_final_2026_07_26', jsonb_build_object(
        'situacao', 'nao republicavel com as fontes disponiveis',
        'busca_feita', 'PDF da AP 470 em 403; portal de noticias do STF varrido por "AP 470" e "mensalao condena"',
        'fontes_avaliadas', jsonb_build_array(
          'https://noticias.stf.jus.br/postsnoticias/plenario-mantem-pena-de-multa-a-condenados-na-ap-470/',
          'https://noticias.stf.jus.br/postsnoticias/stf-decide-que-julgamento-do-mensalao-nao-anula-reforma-da-previdencia-de-2003/'
        ),
        'criterio_para_reabrir', 'fonte que nomeie Lula e sustente a afirmacao feita sobre ele'
      )
    )
WHERE id = 'de6d8db1-d13a-4ce2-bbbe-b9736aa90b17'
  AND visivel IS NOT TRUE;

DO $$
DECLARE
  decididas integer;
BEGIN
  SELECT COUNT(*) INTO decididas
  FROM public.pontos_atencao
  WHERE dados_relacionados ? 'veredito_final_2026_07_26' AND visivel IS NOT TRUE;

  IF decididas <> 2 THEN
    RAISE EXCEPTION 'veredito_final: esperadas 2 claims decididas e fora do ar, encontradas %', decididas;
  END IF;
END $$;

COMMIT;
