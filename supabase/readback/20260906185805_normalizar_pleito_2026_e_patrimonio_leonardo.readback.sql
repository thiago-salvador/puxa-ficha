-- Readback da migration remota 20260906185805.
SELECT h.proveniencia,count(*) AS linhas
FROM public.historico_politico h
JOIN public.candidatos_publico p ON p.id=h.candidato_id
JOIN public.candidatos c ON c.id=p.id
WHERE p.status='candidato'
  AND COALESCE(p.cargo_disputado,'Nenhum')<>'Nenhum'
  AND c.sq_candidato_2026 IS NOT NULL
  AND h.periodo_inicio=2026
  AND h.tipo_evento='candidatura'
  AND h.despublicado_em IS NULL
GROUP BY h.proveniencia
ORDER BY h.proveniencia;

SELECT c.slug,p.ano_eleicao,p.valor_total,jsonb_array_length(p.bens) AS bens,p.fonte
FROM public.patrimonio p
JOIN public.candidatos c ON c.id=p.candidato_id
WHERE c.slug='leonardo-avalanche' AND p.ano_eleicao=2026;
