-- Auditoria etapa 1C: noticias_candidato (17.498 linhas) e pontos_atencao (238 linhas)
-- Somente SELECT. Nenhuma escrita no banco. Rodado via Supabase MCP execute_sql
-- contra project_id wskpzsobvqwhnbsdsmok em 2026-07-24.
--
-- Helper inline (sem CREATE FUNCTION, para nao tocar o schema): normaliza
-- removendo acentos comuns em pt-BR via translate(), para comparar titulo
-- de noticia com nome de candidato sem falso-negativo por acentuacao.
-- unaccent(x) := translate(lower(x), 'áàãâäéèêëíìîïóòõôöúùûüçñÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑ',
--                                    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')

-- =====================================================================
-- 1. REGRAS DETERMINISTICAS SOBRE AS 17.498 NOTICIAS
-- =====================================================================

-- 1.1 Titulo nao menciona nenhum token >=4 letras do nome_urna do candidato associado
WITH cand AS (
  SELECT id, slug, nome_urna, nome_completo,
    translate(lower(nome_urna), 'áàãâäéèêëíìîïóòõôöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') AS urna_norm
  FROM candidatos
),
noticias_norm AS (
  SELECT n.id, n.candidato_id, n.titulo, n.url, n.data_publicacao,
    translate(lower(n.titulo), 'áàãâäéèêëíìîïóòõôöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn') AS titulo_norm
  FROM noticias_candidato n
),
tokens AS (
  SELECT c.id AS candidato_id, c.slug, c.nome_urna,
    unnest(string_to_array(c.urna_norm, ' ')) AS token
  FROM cand c
),
tokens_filtradas AS (
  SELECT candidato_id, slug, nome_urna, token
  FROM tokens
  WHERE length(token) >= 4
),
match_check AS (
  SELECT nn.id, nn.candidato_id, c.slug, c.nome_urna, nn.titulo, nn.url,
    EXISTS (
      SELECT 1 FROM tokens_filtradas t
      WHERE t.candidato_id = nn.candidato_id
        AND nn.titulo_norm LIKE '%' || t.token || '%'
    ) AS bate_algum_token
  FROM noticias_norm nn
  JOIN cand c ON c.id = nn.candidato_id
)
SELECT count(*) AS total_sem_match_nome_urna
FROM match_check
WHERE NOT bate_algum_token;

-- 1.2 Mesma consulta, detalhando por candidato (para achar concentracao)
-- (rodar apos 1.1; reaproveita a mesma logica)

-- 1.3 Candidatos de nome curto/comum com volume alto de noticias
SELECT c.slug, c.nome_urna, c.cargo_disputado, c.estado, count(n.id) AS total_noticias
FROM candidatos c
JOIN noticias_candidato n ON n.candidato_id = c.id
WHERE length(c.nome_urna) <= 6 OR c.nome_urna ~* '^(lula|boulos|zema|tarcisio|janones|bolsonaro|haddad|freixo|datena)$'
GROUP BY c.id, c.slug, c.nome_urna, c.cargo_disputado, c.estado
ORDER BY total_noticias DESC;

-- 1.4 Mesma URL associada a mais de um candidato
SELECT url, count(DISTINCT candidato_id) AS candidatos_distintos, count(*) AS linhas,
  array_agg(DISTINCT candidato_id) AS candidato_ids
FROM noticias_candidato
GROUP BY url
HAVING count(DISTINCT candidato_id) > 1
ORDER BY candidatos_distintos DESC;

-- 1.5 Duplicatas exatas de titulo+url (mesmo candidato, linha repetida)
SELECT candidato_id, titulo, url, count(*) AS repeticoes
FROM noticias_candidato
GROUP BY candidato_id, titulo, url
HAVING count(*) > 1
ORDER BY repeticoes DESC;

-- 1.6 Datas futuras (> hoje) ou muito antigas (< 2020, fora de qualquer janela eleitoral plausivel)
SELECT
  count(*) FILTER (WHERE data_publicacao > now()) AS data_futura,
  count(*) FILTER (WHERE data_publicacao < '2020-01-01') AS data_muito_antiga,
  min(data_publicacao) AS min_data,
  max(data_publicacao) AS max_data
FROM noticias_candidato;

-- 1.7 Dominios de fonte que se repetem de forma suspeita (dominio extraido da url)
SELECT
  regexp_replace(regexp_replace(url, '^https?://(www\.)?', ''), '/.*$', '') AS dominio,
  count(*) AS total_noticias,
  count(DISTINCT candidato_id) AS candidatos_distintos
FROM noticias_candidato
GROUP BY dominio
ORDER BY total_noticias DESC
LIMIT 30;

-- 1.8 Titulo vazio, nulo ou truncado (muito curto, ou terminando em reticencias/corte)
SELECT
  count(*) FILTER (WHERE titulo IS NULL OR trim(titulo) = '') AS titulo_vazio,
  count(*) FILTER (WHERE length(trim(titulo)) < 15 AND trim(titulo) <> '') AS titulo_muito_curto,
  count(*) FILTER (WHERE titulo LIKE '%...' OR titulo LIKE '%…') AS titulo_com_reticencias
FROM noticias_candidato;

-- =====================================================================
-- 2. AMOSTRA ESTRATIFICADA (60 noticias) - construida e avaliada manualmente
-- =====================================================================
-- 2.1 Amostra de alto risco: candidatos de nome curto/comum (top volume)
-- 2.2 Amostra de alto risco: noticias sem match de token no titulo
-- 2.3 Amostra aleatoria de controle

-- =====================================================================
-- 3. LINKS MORTOS - amostra de URLs para teste HTTP externo
-- =====================================================================
-- amostra aleatoria de 40+ URLs, testada via firecrawl/HTTP HEAD fora do SQL

-- =====================================================================
-- 4. PONTOS DE ATENCAO (238 linhas) - auditoria completa
-- =====================================================================

-- 4.1 Visao geral: verificado, gerado_por, visivel, com/sem fonte
SELECT
  gerado_por,
  verificado,
  visivel,
  count(*) AS total
FROM pontos_atencao
GROUP BY gerado_por, verificado, visivel
ORDER BY gerado_por, verificado, visivel;

-- 4.2 Pontos SEM fontes (array vazio ou null) mas publicados (visivel + passam no gate)
SELECT pa.id, pa.candidato_id, c.slug, pa.categoria, pa.titulo, pa.gravidade, pa.gerado_por, pa.verificado, pa.fontes
FROM pontos_atencao pa
JOIN candidatos c ON c.id = pa.candidato_id
WHERE pa.visivel = true
  AND (pa.gerado_por <> 'ia' OR pa.verificado = true)
  AND (pa.fontes IS NULL OR jsonb_array_length(pa.fontes) = 0)
ORDER BY pa.gravidade DESC;

-- 4.3 Pontos gerados por IA e NAO verificados que ainda assim aparecem como visivel=true
-- (nao deveriam passar no gate publico, mas confirma se visivel sozinho já e usado em algum lugar)
SELECT pa.id, pa.candidato_id, c.slug, pa.titulo, pa.gravidade, pa.gerado_por, pa.verificado, pa.visivel
FROM pontos_atencao pa
JOIN candidatos c ON c.id = pa.candidato_id
WHERE pa.gerado_por = 'ia' AND pa.verificado = false AND pa.visivel = true;

-- 4.4 Contagem de pontos por candidato x gravidade (para ver concentracao/risco)
SELECT c.slug, count(*) AS total, count(*) FILTER (WHERE pa.gravidade='critica') AS criticos
FROM pontos_atencao pa JOIN candidatos c ON c.id = pa.candidato_id
GROUP BY c.slug
ORDER BY criticos DESC, total DESC
LIMIT 20;

-- 4.5 Foco manual: TODAS as linhas critica/alta (56), com fontes completas (jsonb)
-- Esta e a query realmente usada para a leitura manual linha-a-linha (secao 4 do relatorio),
-- em vez de puxar as 238 linhas completas pro contexto (achados 1-4 do noticias.md vieram daqui).
SELECT pa.id, c.slug, pa.categoria, pa.gravidade, pa.gerado_por, pa.verificado, pa.visivel,
  pa.titulo, pa.fontes
FROM pontos_atencao pa
JOIN candidatos c ON c.id = pa.candidato_id
WHERE pa.gravidade IN ('critica','alta')
ORDER BY pa.gravidade, c.slug;

-- 4.6 Fontes que sao so a homepage do dominio (achado 3 do relatorio: citacao nao especifica)
WITH fontes_flat AS (
  SELECT pa.id, pa.gravidade, pa.gerado_por, pa.verificado, pa.visivel, pa.titulo,
    jsonb_array_elements(pa.fontes)->>'url' AS url
  FROM pontos_atencao pa
  WHERE pa.fontes IS NOT NULL AND jsonb_array_length(pa.fontes) > 0
)
SELECT id, gravidade, gerado_por, verificado, visivel, titulo, url
FROM fontes_flat
WHERE url ~ '^https?://[^/]+/?$' AND visivel = true
ORDER BY gravidade;

-- 4.7 URL de fonte com template {ano} nunca resolvido (achado 4 do relatorio)
SELECT c.slug, pa.titulo, pa.fontes
FROM pontos_atencao pa JOIN candidatos c ON c.id = pa.candidato_id
WHERE pa.fontes::text LIKE '%{ano}%';

-- 4.8 Gap do gate: curadoria + verificado=false + visivel=true (nao exigido pelo gate,
-- ja que is_public_attention_point so cobra verificado quando gerado_por='ia')
SELECT pa.id, c.slug, pa.categoria, pa.gravidade, pa.titulo, pa.fontes
FROM pontos_atencao pa JOIN candidatos c ON c.id = pa.candidato_id
WHERE pa.gerado_por = 'curadoria' AND pa.verificado = false AND pa.visivel = true;

-- =====================================================================
-- 5. PROMPT INJECTION (achado: 0 ocorrencias)
-- =====================================================================
SELECT 'noticias' as origem, id::text, titulo as texto
FROM noticias_candidato
WHERE titulo ~* '(ignore|desconsidere|system prompt|prompt do sistema|you are an ai|voce e uma ia|instru[cç][aã]o anterior|as instru[cç][oõ]es acima|forget (all|previous)|disregard|jailbreak|act as|aja como|<\|im_start\|>|\[system\])'
UNION ALL
SELECT 'pontos_atencao', id::text, coalesce(titulo,'') || ' | ' || coalesce(descricao,'')
FROM pontos_atencao
WHERE (titulo || ' ' || coalesce(descricao,'')) ~* '(ignore|desconsidere|system prompt|prompt do sistema|you are an ai|voce e uma ia|instru[cç][aã]o anterior|as instru[cç][oõ]es acima|forget (all|previous)|disregard|jailbreak|act as|aja como|<\|im_start\|>|\[system\])';

-- NOTA: o teste de link morto (secao 3 do relatorio) nao e SQL - foi feito com curl real
-- contra amostras de URLs extraidas por estas queries. Ver noticias.md secao 3 para os
-- comandos e taxas. Amostras de URL usadas ficaram em:
--   scratchpad/audit/urls_noticias_nao_google.txt (12 URLs)
--   scratchpad/audit/urls_google_news.txt (15 URLs, wrappers news.google.com)
--   scratchpad/audit/urls_pontos_atencao.txt (20 URLs aleatorias de pontos_atencao.fontes)
--   scratchpad/audit/urls_g1_folha_full.txt (38 URLs, teste exaustivo g1.globo.com + folha.uol.com.br)
