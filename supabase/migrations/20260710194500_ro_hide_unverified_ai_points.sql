BEGIN;

UPDATE public.pontos_atencao pa
SET
  visivel = false,
  verificado = false,
  descricao = pa.descricao || ' [Oculto em 2026-07-10: resumo gerado por IA sem verificacao primaria.]'
FROM public.candidatos c
WHERE pa.candidato_id = c.id
  AND c.slug IN (
    'adailton-furia', 'dr-fernando-maximo', 'expedito-netto', 'hildon-chaves',
    'luiz-carlos-teodoro', 'marcos-rogerio', 'pedro-abib', 'ricardo-frota',
    'samuel-costa', 'sergio-goncalves'
  )
  AND pa.gerado_por = 'ia'
  AND pa.verificado = false
  AND pa.visivel = true;

COMMIT;
