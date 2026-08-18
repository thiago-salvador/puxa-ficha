BEGIN;

-- Política de retenção de 90 dias para analytics_launch_events.
--
-- Fecha a pendência declarada em 20260803193500_analytics_launch_events_ip_hash:
-- desde que a tabela passou a guardar ip_hash, acumular linha para sempre deixou
-- de ser só higiene de volume e virou higiene de dado pseudônimo. Pela LGPD, dado
-- pseudonimizado coletado para limitar abuso não pode ficar guardado além do
-- necessário para essa finalidade, e 90 dias cobrem com folga a janela de um
-- minuto do limitador mais qualquer investigação de abuso retroativa.
-- O banco também é Free de 500 MB: sink de evento sem expurgo é a forma mais
-- barata de estourar a cota bem no pico de lançamento.
--
-- Onde o expurgo roda: no cron diário que já existe,
-- GET /api/internal/published-consistency (gateado por CRON_SECRET). O projeto
-- não tem pg_cron habilitado (só pg_trgm e unaccent), então pendurar o DELETE no
-- job que já é agendado evita infra nova e uma entrada nova de cron.
--
-- Esta migration é só o lastro de banco desse expurgo: garantir o índice por
-- created_at, para o DELETE por janela ser range scan e não sequential scan na
-- tabela inteira, e registrar a política no comentário da tabela, para quem
-- inspecionar o schema achar a regra sem precisar ler o código da rota.
--
-- Não apaga nada aqui de propósito: o primeiro expurgo é do cron, observável no
-- log da invocação, e não de uma migration que roda sem ninguém olhando.

-- Já criado em 20260515130000_create_analytics_launch_events; repetido aqui como
-- garantia idempotente, porque o DELETE por janela depende dele para não varrer
-- a tabela toda.
CREATE INDEX IF NOT EXISTS idx_analytics_launch_events_created
  ON public.analytics_launch_events (created_at DESC);

COMMENT ON TABLE public.analytics_launch_events IS
  'Audit sink for launch-critical public analytics events. Insert/readback via Next API and service role only. Retenção: 90 dias, expurgo diário no cron /api/internal/published-consistency (o projeto não tem pg_cron habilitado).';

COMMIT;
