BEGIN;

CREATE OR REPLACE FUNCTION public.is_public_candidate(target_candidate_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.candidatos c
    WHERE c.id = target_candidate_id
      AND c.publicavel = true
      AND c.status <> 'removido'
  );
$$;

REVOKE ALL ON FUNCTION public.is_public_candidate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_public_candidate(uuid) TO anon, authenticated, service_role;

COMMIT;
