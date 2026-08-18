-- Registros judiciais encerrados sem julgamento de mérito permanecem visíveis
-- como informação histórica, mas não devem alimentar alertas graves.
-- Escopo fechado pela auditoria pública de 194 fichas em 2026-08-07:
-- Lula (anulação por incompetência de foro) e Haddad (absolvição pelo TRE-SP).
BEGIN;

-- @write tabela=pontos_atencao slug=lula campos=gravidade,dados_relacionados
UPDATE public.pontos_atencao p
SET gravidade = 'baixa',
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'neutralizacao_judicial_2026_08_07', jsonb_build_object(
        'motivo', 'registro histórico com resultado anulado ou revertido e sem juízo de mérito ativo',
        'escopo', 'informação histórica visível; fora do contador de alertas graves',
        'reversivel', true
      )
    )
FROM public.candidatos c
WHERE p.id = '09d4c7d5-0ad0-4095-aace-1de0f389366b'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'lula'
  AND p.gravidade IS DISTINCT FROM 'baixa';

-- @write tabela=pontos_atencao slug=haddad-gov-sp campos=gravidade,dados_relacionados
UPDATE public.pontos_atencao p
SET gravidade = 'baixa',
    dados_relacionados = COALESCE(dados_relacionados, '{}'::jsonb) || jsonb_build_object(
      'neutralizacao_judicial_2026_08_07', jsonb_build_object(
        'motivo', 'registro histórico com resultado anulado ou revertido e sem juízo de mérito ativo',
        'escopo', 'informação histórica visível; fora do contador de alertas graves',
        'reversivel', true
      )
    )
FROM public.candidatos c
WHERE p.id = 'b0c7e9ac-0e8a-4a4f-a91b-f43eaad66c42'::uuid
  AND p.candidato_id = c.id
  AND c.slug = 'haddad-gov-sp'
  AND p.gravidade IS DISTINCT FROM 'baixa';

DO $$
DECLARE
  n integer;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.pontos_atencao
  WHERE id IN (
    '09d4c7d5-0ad0-4095-aace-1de0f389366b'::uuid,
    'b0c7e9ac-0e8a-4a4f-a91b-f43eaad66c42'::uuid
  )
    AND gravidade = 'baixa'
    AND visivel = true;

  IF n <> 2 THEN
    RAISE EXCEPTION 'neutralizacao judicial: esperados 2 pontos visiveis com gravidade baixa, encontrados %', n;
  END IF;
END $$;

COMMIT;
