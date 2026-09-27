-- Falha fechada se a coorte, o estado, a identidade ou a fonte divergir.
DO $readback$
DECLARE
  total_rows bigint;
  distinct_slugs bigint;
  found_rows bigint;
  unresolved_rows bigint;
  empty_rows bigint;
  site_urls bigint;
  payload_hash text;
BEGIN
  SELECT count(*),count(DISTINCT alvo),
         count(*) FILTER (WHERE resultado='encontrado' AND volume>0),
         count(*) FILTER (WHERE resultado='indeterminado' AND volume=0),
         count(*) FILTER (WHERE resultado='vazio_confirmado' AND volume=0),
         coalesce(sum(volume),0),
         md5(coalesce(string_agg(alvo||'|'||(detalhe::jsonb->>'sq_candidato')||'|'||resultado||'|'||volume::text,E'\n' ORDER BY alvo COLLATE "C"),''))
  INTO total_rows,distinct_slugs,found_rows,unresolved_rows,empty_rows,site_urls,payload_hash
  FROM public.coleta_log WHERE execucao='migration:20260924204852';
  IF (SELECT count(*) FROM public.candidatos WHERE publicavel IS TRUE)<>513 OR
     total_rows<>513 OR distinct_slugs<>513 OR found_rows<>476 OR
     unresolved_rows<>19 OR empty_rows<>18 OR site_urls<>3059 OR
     payload_hash<>'5e643a4a10405cf6157f26b10e5d3644' THEN
    RAISE EXCEPTION 'sites_tse_2026: contagem, estado ou payload por SQ divergiu';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.coleta_log l
    LEFT JOIN public.candidatos c ON c.id=l.candidato_id AND c.slug=l.alvo
    WHERE l.execucao='migration:20260924204852' AND (
      c.id IS NULL OR c.publicavel IS DISTINCT FROM TRUE OR
      l.fonte IS DISTINCT FROM 'sites-tse' OR
      l.escopo IS DISTINCT FROM 'candidato' OR
      l.natureza IS DISTINCT FROM 'coleta' OR
      l.executado_em IS DISTINCT FROM '2026-09-24T16:56:50.458Z'::timestamptz OR
      l.url IS DISTINCT FROM 'https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/rede_social_candidato_2026.zip' OR
      l.detalhe::jsonb->>'ano_eleicao' IS DISTINCT FROM '2026' OR
      l.detalhe::jsonb->>'escopo' IS DISTINCT FROM 'recurso integral de redes sociais do TSE, unido por SQ/UF/cargo' OR
      l.detalhe::jsonb->>'resource_sha256' IS DISTINCT FROM '88f3168f4fe8f1758c9153b548c7194dfe37aa76f5e08eb7acd731dbf31ac176' OR
      l.detalhe::jsonb->>'snapshot' IS DISTINCT FROM 'candidate-sites-tse-2026.json' OR
      l.detalhe::jsonb->>'sq_candidato' IS DISTINCT FROM c.sq_candidato_2026
    )
  ) THEN
    RAISE EXCEPTION 'sites_tse_2026: identidade, escopo ou fonte divergiu';
  END IF;
END
$readback$;

SELECT resultado,count(*) AS candidatos,sum(volume) AS sites
FROM public.coleta_log
WHERE execucao='migration:20260924204852'
GROUP BY resultado ORDER BY resultado;
