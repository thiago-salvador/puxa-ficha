-- Fluxo: Bloco 9 do review 2026-04-24 (mídia/assets, fechamento de residual factual).
-- Fechamento do critério "sem link de foto 403" do Bloco 9.
--
-- Estado pre-migration (verificado por SELECT autorizado em <projeto-supabase> em 2026-04-25):
--   slug = 'valmir-de-francisquinho'
--   foto_url = 'https://eleicoes2024candidatosapi.otempo.com.br/api/photo/2024/FSE260001935426_div.jpg'
--   curl -sS -I retornava HTTP 403 com e sem User-Agent (host bloqueando hotlink/cliente externo).
--
-- Destino estavel:
--   https://upload.wikimedia.org/wikipedia/commons/6/66/2024_VALMIR_DE_FRANCISQUINHO_CANDIDATO_PREFEITO_SE_ITABAIANA_TSE_%28260001935426%29.jpg
--   - Origem: Portal de Dados Abertos do TSE (foto oficial da candidatura 2024 a Prefeito de Itabaiana/SE,
--     SQ_CANDIDATO 260001935426), republicada em Wikimedia Commons sob Creative Commons Attribution 4.0.
--   - HEAD/GET 200, content-type image/jpeg, 161x225, 37011 bytes (probe 2026-04-25).
--   - Hostname upload.wikimedia.org ja esta no allowlist src/lib/remote-image-hosts.ts e em
--     next.config.ts remotePatterns (ja usado por fabio-mitidieri.foto_url em produçao).
--
-- Idempotencia: o predicado da WHERE inclui o valor antigo conhecido. Re-execucoes apos primeiro
-- apply afetam 0 rows. Caso curadoria humana posterior troque o foto_url para outro valor
-- diferente, esta migration nao reverte; respeita o estado curado mais recente.

UPDATE candidatos
SET
  foto_url = 'https://upload.wikimedia.org/wikipedia/commons/6/66/2024_VALMIR_DE_FRANCISQUINHO_CANDIDATO_PREFEITO_SE_ITABAIANA_TSE_%28260001935426%29.jpg'
WHERE slug = 'valmir-de-francisquinho'
  AND foto_url = 'https://eleicoes2024candidatosapi.otempo.com.br/api/photo/2024/FSE260001935426_div.jpg';
