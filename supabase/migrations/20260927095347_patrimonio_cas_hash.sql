BEGIN;

-- A server-computed equality token keeps the full asset list out of PostgREST URLs.
-- No direct public-table grant is added; audited service-role writers read it.
ALTER TABLE public.patrimonio
  ADD COLUMN IF NOT EXISTS bens_hash text
  GENERATED ALWAYS AS (md5(COALESCE(bens::text, 'null'))) STORED;

COMMIT;
