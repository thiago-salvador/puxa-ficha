BEGIN;

-- Teto durável por IP para o envio de e-mail em /api/alerts/subscribe.
--
-- Até 2026-08-04, assinante que já existia só era protegido pelo limitador em
-- memória do processo (createFixedWindowIpRateLimiter) e pelo cooldown de 15 min
-- por assinante. Em serverless o limitador em memória não é teto: cada instância
-- nova nasce com o balde zerado, e o contador durável que existia
-- (MAX_NEW_SUBSCRIBERS_PER_HOUR sobre ip_consentimento_hash) só roda quando o
-- e-mail ainda não está na base. Com uma lista de endereços já inscritos, um
-- atacante conseguia um e-mail de link de gestão por endereço, gastando cota do
-- Resend e queimando a reputação do domínio.
--
-- A coluna guarda o ip_hash de quem PEDIU o último e-mail daquele assinante. A
-- contagem da janela usa (last_email_request_ip_hash,
-- last_verification_email_sent_at), reaproveitando o carimbo que o cooldown já
-- mantinha: nenhuma tabela nova e nenhuma retenção nova, porque o valor morre
-- junto com a linha do assinante quando ele pede exclusão de dados.
--
-- last_email_request_ip_hash NÃO é o IP. É SHA-256 salgado com PF_ALERTS_IP_SALT
-- mais o namespace da rota, truncado em 48 caracteres (src/lib/client-ip.ts).
-- É de propósito um valor diferente do ip_consentimento_hash da mesma linha:
-- aquele é registro de consentimento e não pode trocar de fórmula sem invalidar
-- linha antiga; este é balde de rate limit, e o namespace impede correlacionar o
-- mesmo visitante entre superfícies pelo valor gravado.
--
-- Coluna nullable de propósito: linha antiga não tem valor, e o código degrada
-- aberto quando a coluna ainda não existe (regravando só o carimbo de tempo, que
-- é o que sustenta o cooldown). Aplicar esta migration antes ou depois do deploy
-- dá o mesmo resultado.

ALTER TABLE public.alert_subscribers
  ADD COLUMN IF NOT EXISTS last_email_request_ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_alert_subscribers_email_request_ip_sent_at
  ON public.alert_subscribers (last_email_request_ip_hash, last_verification_email_sent_at DESC)
  WHERE last_email_request_ip_hash IS NOT NULL;

COMMENT ON COLUMN public.alert_subscribers.last_email_request_ip_hash IS
  'SHA-256 salgado (salt + namespace da rota + IP) de quem pediu o último e-mail deste assinante, 48 chars. Existe só para o teto por janela; não guarda IP em claro nem identifica pessoa.';

COMMIT;
