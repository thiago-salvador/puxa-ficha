BEGIN;

DO $rollback$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.analytics_launch_events WHERE event_name = 'Colinha Share' LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Colinha Share: rollback requer ausencia de eventos gravados';
  END IF;
END $rollback$;

ALTER TABLE public.analytics_launch_events
  DROP CONSTRAINT analytics_launch_events_event_name_check;
ALTER TABLE public.analytics_launch_events
  ADD CONSTRAINT analytics_launch_events_event_name_check CHECK (event_name IN (
    'Candidate Click', 'Comparison Start', 'Quiz Complete',
    'External Source Click', 'Search Zero Results'
  ));

COMMIT;
