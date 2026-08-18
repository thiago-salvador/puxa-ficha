-- Links curtos para /quiz/resultado (query longa). Escrita apenas via service role (API route).
-- Limite anti-abuso: contagem por ip_hash na ultima hora no aplicativo.

CREATE TABLE quiz_result_short_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE CHECK (char_length(token) >= 8 AND char_length(token) <= 16),
  query_string TEXT NOT NULL CHECK (char_length(query_string) <= 6144),
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quiz_short_links_created ON quiz_result_short_links (created_at DESC);
CREATE INDEX idx_quiz_short_links_ip_created ON quiz_result_short_links (ip_hash, created_at DESC);

COMMENT ON TABLE quiz_result_short_links IS 'Redirect tokens for quiz result URLs; insert via Next API + service role only.';

ALTER TABLE quiz_result_short_links ENABLE ROW LEVEL SECURITY;

-- Sem policies para anon/authenticated: leitura/escrita so com service role.
