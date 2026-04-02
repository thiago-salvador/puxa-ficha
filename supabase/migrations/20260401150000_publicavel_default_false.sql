-- Invert publicavel default to fail-closed: new candidates are NOT published until audit passes
ALTER TABLE public.candidatos ALTER COLUMN publicavel SET DEFAULT false;
