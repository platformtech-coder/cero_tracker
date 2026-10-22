-- Migration: Fix date casting in upsert_synced_cubs_scores
--
-- Root cause: cubs.last_reading_activity is of type DATE, but rec->>'last_reading_activity'
-- extracts a text value from JSONB. NULLIF(..., '') yields text without an explicit ::date cast,
-- causing PostgreSQL to throw:
--   "column 'last_reading_activity' is of type date but expression is of type text"
--
-- Fix: Cast NULLIF(rec->>'last_reading_activity', '')::date and COALESCE with existing
-- cubs.last_reading_activity so reading activity dates are correctly typed, stored, and preserved.

CREATE OR REPLACE FUNCTION public.upsert_synced_cubs_scores(cubs_data jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE rec jsonb; n integer := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(cubs_data) LOOP
    UPDATE public.cubs SET
      cumulative_weekly_points = COALESCE(NULLIF(rec->>'cumulative_weekly_points','')::integer, cumulative_weekly_points),
      last_reading_activity    = COALESCE(NULLIF(rec->>'last_reading_activity','')::date, last_reading_activity)
    WHERE cub_id = rec->>'cub_id';
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_synced_cubs_scores(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.upsert_synced_cubs_scores(jsonb) TO service_role;
