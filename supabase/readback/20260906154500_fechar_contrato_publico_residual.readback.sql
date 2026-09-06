SELECT c.slug,c.status,c.sq_candidato_2026,
       p.ano_eleicao AS patrimonio_ano,
       p.sq_candidato AS patrimonio_sq,
       ch.chave AS chapa,ch.vice_sq_candidato
FROM public.candidatos c
LEFT JOIN public.patrimonio_ausencia_oficial p
  ON p.candidato_id=c.id AND p.ano_eleicao=2026
LEFT JOIN public.chapas_2026 ch ON ch.vice_candidato_id=c.id
WHERE c.slug IN ('laudicerio-aguiar','leonardo-avalanche')
ORDER BY c.slug;

SELECT count(*) AS pendencias
FROM public.candidatos_publico
WHERE coalesce(cargo_disputado,'Nenhum')<>'Nenhum'
  AND status IS DISTINCT FROM 'candidato';
