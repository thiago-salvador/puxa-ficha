-- Leitura de prova de 20260929010000_l7_pontos_historico_editorial.sql.
DO $readback$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version='20260929010000') <> 1
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
         WHERE migration_version='l7-editorial-20260929'
           AND tabela='pontos_atencao') <> 8
     OR (SELECT count(*) FROM public.identidade_timeline_quarentena_snapshot
         WHERE migration_version='l7-editorial-20260929'
           AND tabela='historico_politico') <> 1
     OR (SELECT count(*) FROM public.coleta_log
         WHERE execucao='migration:20260929010000' AND resultado='encontrado'
           AND volume=9 AND natureza='escrita') <> 1
  THEN RAISE EXCEPTION 'l7-editorial: ledger, snapshots ou recibo divergiram'; END IF;

  IF (SELECT count(*) FROM public.pontos_atencao p
      JOIN public.identidade_timeline_quarentena_snapshot s ON s.row_id=p.id
      WHERE s.migration_version='l7-editorial-20260929'
        AND s.tabela='pontos_atencao' AND to_jsonb(p)=s.postimage
        AND p.visivel AND p.verificado AND p.gerado_por='curadoria'
        AND p.despublicado_em IS NULL AND p.despublicacao_motivo IS NULL
        AND jsonb_typeof(p.fontes)='array' AND jsonb_array_length(p.fontes)>0
        AND public.ponto_atencao_fonte_conforme(p.gravidade,p.fontes)) <> 8
     OR (SELECT count(*) FROM public.historico_politico h
      JOIN public.identidade_timeline_quarentena_snapshot s ON s.row_id=h.id
      WHERE s.migration_version='l7-editorial-20260929'
        AND s.tabela='historico_politico' AND to_jsonb(h)=s.postimage
        AND h.id='95897450-57c5-466c-a6cb-7eeff98b0631'
        AND h.despublicado_em IS NULL AND h.despublicacao_motivo IS NULL
        AND h.proveniencia='tse') <> 1
  THEN RAISE EXCEPTION 'l7-editorial: postimage divergiu'; END IF;
END
$readback$;

SELECT p.id,c.slug,p.visivel,p.verificado,p.gravidade,
       jsonb_array_length(p.fontes) AS numero_fontes
FROM public.pontos_atencao p
JOIN public.candidatos c ON c.id=p.candidato_id
WHERE p.id IN (
 '6382cd2d-a9a8-4616-893a-08396f1ea70d',
 'c059feb7-19e2-4a87-b65e-da9f0519cf97',
 'c42f394c-49ea-4e93-b21d-dbf0186512f1',
 'c75c15d0-9ed6-4504-babd-9c6d5453575e',
 '6b344c5b-1568-4c37-b76b-b036bc0d7cb7',
 '264c8585-9ba0-4cc9-81c1-83551cdcd04d',
 'de6d8db1-d13a-4ce2-bbbe-b9736aa90b17',
 '88373c8d-43c9-400d-a896-5f11e3fd3ed7')
ORDER BY c.slug,p.id;

SELECT h.id,c.slug,h.tipo_evento,h.proveniencia,h.despublicado_em,
       h.despublicacao_motivo
FROM public.historico_politico h
JOIN public.candidatos c ON c.id=h.candidato_id
WHERE h.id='95897450-57c5-466c-a6cb-7eeff98b0631';
