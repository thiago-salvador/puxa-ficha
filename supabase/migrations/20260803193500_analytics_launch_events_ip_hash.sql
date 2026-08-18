BEGIN;

-- Limite anti-abuso duravel para /api/analytics/event.
--
-- Ate 2026-08-03 o limite da rota era um contador em memoria por instancia
-- (createFixedWindowIpRateLimiter). Em serverless isso nao e um teto: cada
-- instancia nova nasce com o balde zerado, entao o limite real era
-- "120 por minuto VEZES o numero de instancias vivas" e nao sobrevivia a
-- nenhum reciclo de funcao. Este e o mesmo padrao ja usado em
-- quiz_result_short_links (ip_hash + indice por (ip_hash, created_at)).
--
-- ip_hash NAO e o IP. E SHA-256 salgado com PF_ALERTS_IP_SALT e com o namespace
-- da rota, truncado em 48 caracteres (src/lib/client-ip.ts). O IP em claro nunca
-- e persistido, e o namespace impede correlacionar o mesmo visitante entre
-- superficies diferentes pelo valor gravado.
--
-- Coluna nullable de proposito: linha antiga nao tem valor, e o codigo grava
-- sem ip_hash quando a coluna ainda nao existe, de modo que aplicar esta
-- migration antes ou depois do deploy da o mesmo resultado.
--
-- PENDENCIA CONHECIDA, fora do escopo desta migration: a tabela continua sem
-- politica de retencao, como ja estava antes desta coluna. Com ip_hash gravado,
-- expurgo periodico deixa de ser so higiene de volume e vira higiene de dado
-- pseudonimo. Precisa de decisao sobre a janela (sugestao: 90 dias) e de um
-- lugar para rodar, ja que o projeto nao tem pg_cron habilitado.

ALTER TABLE public.analytics_launch_events
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_analytics_launch_events_ip_created
  ON public.analytics_launch_events (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

COMMENT ON COLUMN public.analytics_launch_events.ip_hash IS
  'SHA-256 salgado (salt + namespace da rota + IP), 48 chars. Existe so para o limite por janela; nao guarda IP em claro nem identifica pessoa.';

COMMIT;
