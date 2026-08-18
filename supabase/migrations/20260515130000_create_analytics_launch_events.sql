BEGIN;

CREATE TABLE IF NOT EXISTS public.analytics_launch_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name TEXT NOT NULL CHECK (event_name IN (
    'Candidate Click',
    'Comparison Start',
    'Quiz Complete',
    'External Source Click',
    'Search Zero Results'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  proof_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_launch_events_created
  ON public.analytics_launch_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_launch_events_name_created
  ON public.analytics_launch_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_launch_events_proof_id
  ON public.analytics_launch_events (proof_id, event_name, created_at DESC)
  WHERE proof_id IS NOT NULL;

COMMENT ON TABLE public.analytics_launch_events IS
  'Audit sink for launch-critical public analytics events. Insert/readback via Next API and service role only.';

ALTER TABLE public.analytics_launch_events ENABLE ROW LEVEL SECURITY;

COMMIT;
