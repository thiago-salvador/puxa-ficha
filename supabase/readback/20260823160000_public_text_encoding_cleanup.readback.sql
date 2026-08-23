-- Readback somente leitura da correcao de encoding no universo publicado.
WITH publicados AS (
  SELECT id, slug FROM public.candidatos_publico
), ocorrencias AS (
  SELECT 'patrimonio'::text AS tabela, p.id, c.slug, p.bens::text AS conteudo
  FROM public.patrimonio p JOIN publicados c ON c.id = p.candidato_id
  UNION ALL
  SELECT 'projetos_lei', p.id, c.slug, p.ementa
  FROM public.projetos_lei p JOIN publicados c ON c.id = p.candidato_id
  UNION ALL
  SELECT 'gastos_parlamentares', g.id, c.slug,
    coalesce(g.detalhamento::text, '') || coalesce(g.gastos_destaque::text, '')
  FROM public.gastos_parlamentares g JOIN publicados c ON c.id = g.candidato_id
  UNION ALL
  SELECT 'legislacao_mandato_executivo', l.id, c.slug,
    coalesce(l.ementa, '') || coalesce(l.metadata->>'source_title', '')
  FROM public.legislacao_mandato_executivo l JOIN publicados c ON c.id = l.candidato_id
  UNION ALL
  SELECT 'noticias_candidato', n.id, c.slug, n.titulo
  FROM public.noticias_candidato n JOIN publicados c ON c.id = n.candidato_id
)
SELECT tabela, id, slug,
  (length(conteudo) - length(replace(conteudo, '¿', ''))) AS u00bf,
  (length(conteudo) - length(replace(conteudo, '�', ''))) AS ufffd,
  (conteudo ~ U&'[\0080-\009F]') AS c1_control
FROM ocorrencias
WHERE conteudo LIKE '%¿%'
   OR conteudo LIKE '%�%'
   OR conteudo ~ U&'[\0080-\009F]'
ORDER BY tabela, slug, id;
