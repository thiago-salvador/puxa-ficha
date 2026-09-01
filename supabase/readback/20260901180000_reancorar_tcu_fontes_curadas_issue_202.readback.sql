DO $readback$
DECLARE
  total_count integer;
  reancoradas_count integer;
  despublicadas_count integer;
  curadas_publicadas_count integer;
  conecta_publicado_count integer;
BEGIN
  WITH alvo(id, fonte_url) AS (
    VALUES
      (
        '2fefa3f5-3b42-4a5a-a72b-2b28d09df018'::uuid,
        'https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=NUMACORDAO%3A3121%20ANOACORDAO%3A2015%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0'
      ),
      (
        'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'::uuid,
        'https://pesquisa.apps.tcu.gov.br/rest/publico/base/acordao-completo/documento?termo=*&filtro=NUMACORDAO%3A1488%20ANOACORDAO%3A2025%20COLEGIADO%3A%22Primeira%20C%C3%A2mara%22&ordenacao=DTRELEVANCIA%20desc%2C%20NUMACORDAOINT%20desc&quantidade=1&inicio=0'
      )
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE p.fontes @> jsonb_build_array(jsonb_build_object('url', a.fonte_url))
    ),
    count(*) FILTER (
      WHERE p.visivel = false
        AND p.despublicacao_motivo IS NOT NULL
        AND p.despublicado_em IS NOT NULL
        AND p.dados_relacionados -> 'issue_202_tcu_fontes_2026_09_01' ->> 'acao'
            = 'fonte reancorada e claim duplicada despublicada'
    )
  INTO total_count, reancoradas_count, despublicadas_count
  FROM alvo a
  JOIN public.pontos_atencao p ON p.id = a.id;

  -- A despublicacao das copias so vale se a claim curada continua no ar.
  SELECT count(*) INTO curadas_publicadas_count
  FROM public.pontos_atencao p
  WHERE p.id IN (
      '98d9c7c6-263f-45dd-9442-e568106bae7c'::uuid,
      'a6efc579-1e51-4b2a-9f3e-38eb897183a8'::uuid
    )
    AND p.visivel = true
    AND p.gerado_por = 'curadoria'
    AND p.verificado = true;

  -- Nenhuma claim publicada dos dois candidatos pode restar ancorada no TVP do
  -- Conecta, que e a fonte sem substancia que derrubou o link-check.
  SELECT count(*) INTO conecta_publicado_count
  FROM public.pontos_atencao p
  WHERE p.visivel = true
    AND p.candidato_id IN (
      '76a6620b-1fd4-46df-806f-5101bd660f7f'::uuid,
      '914d9904-1c6a-47f9-a25f-017138dc1cef'::uuid
    )
    AND p.fontes::text LIKE '%conecta-tcu.apps.tcu.gov.br%';

  IF total_count <> 2
     OR reancoradas_count <> 2
     OR despublicadas_count <> 2
     OR curadas_publicadas_count <> 2
     OR conecta_publicado_count <> 0 THEN
    RAISE EXCEPTION
      'issue #202: readback falhou (alvos=%, reancoradas=%, despublicadas=%, curadas=%, conecta_publicado=%)',
      total_count, reancoradas_count, despublicadas_count, curadas_publicadas_count,
      conecta_publicado_count;
  END IF;
END
$readback$;

SELECT p.id, p.titulo, p.visivel, p.fontes
FROM public.pontos_atencao p
WHERE p.id IN (
  '2fefa3f5-3b42-4a5a-a72b-2b28d09df018'::uuid,
  'c50ca7d6-e0e8-4ccb-9c88-3358ebe40dae'::uuid,
  '98d9c7c6-263f-45dd-9442-e568106bae7c'::uuid,
  'a6efc579-1e51-4b2a-9f3e-38eb897183a8'::uuid
)
ORDER BY p.id;
