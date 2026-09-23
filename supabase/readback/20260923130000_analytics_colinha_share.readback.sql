DO $readback$
DECLARE
  definition text;
  expected_event text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO definition
  FROM pg_constraint c
  WHERE c.conrelid = 'public.analytics_launch_events'::regclass
    AND c.conname = 'analytics_launch_events_event_name_check'
    AND c.contype = 'c' AND c.convalidated;
  IF definition IS NULL THEN
    RAISE EXCEPTION 'Colinha Share: CHECK de eventos ausente';
  END IF;
  FOREACH expected_event IN ARRAY ARRAY[
    'Candidate Click', 'Comparison Start', 'Quiz Complete',
    'External Source Click', 'Search Zero Results', 'Colinha Share'
  ] LOOP
    IF position(expected_event IN definition) = 0 THEN
      RAISE EXCEPTION 'Colinha Share: evento % ausente no CHECK', expected_event;
    END IF;
  END LOOP;
END $readback$;
