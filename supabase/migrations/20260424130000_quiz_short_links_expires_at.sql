-- Bloco 3 (review 2026-04-24): short-links do quiz precisam de TTL explícito.
-- Default de 90 dias novos, backfill para linhas existentes usando created_at + 90 dias.
-- A rota /quiz/r/[token] passa a rejeitar tokens com expires_at <= now().

ALTER TABLE quiz_result_short_links
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE quiz_result_short_links
SET expires_at = created_at + interval '90 days'
WHERE expires_at IS NULL;

ALTER TABLE quiz_result_short_links
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE quiz_result_short_links
  ALTER COLUMN expires_at SET DEFAULT (NOW() + interval '90 days');

ALTER TABLE quiz_result_short_links
  ADD CONSTRAINT quiz_result_short_links_expires_after_created
  CHECK (expires_at > created_at);

CREATE INDEX IF NOT EXISTS idx_quiz_short_links_expires_at
  ON quiz_result_short_links (expires_at);

COMMENT ON COLUMN quiz_result_short_links.expires_at IS
  'TTL do short-link. Default 90 dias. resolveToken filtra rows com expires_at <= now().';
