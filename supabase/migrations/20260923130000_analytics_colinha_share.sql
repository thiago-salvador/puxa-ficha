-- Acrescenta o evento da colinha preservando todos os eventos existentes.
BEGIN;

ALTER TABLE public.analytics_launch_events
  DROP CONSTRAINT IF EXISTS analytics_launch_events_event_name_check;

ALTER TABLE public.analytics_launch_events
  ADD CONSTRAINT analytics_launch_events_event_name_check CHECK (event_name IN (
    'Candidate Click',
    'Comparison Start',
    'Quiz Complete',
    'External Source Click',
    'Search Zero Results',
    'Colinha Share'
  ));

COMMIT;
