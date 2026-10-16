-- Migration: fix null date_onboarded in upsert_synced_cubs_directory
--
-- Root cause: cubs.date_onboarded is NOT NULL, but when a sheet row has an
-- empty/missing date the RPC was inserting NULL, violating the constraint.
-- The conflict path was safe (COALESCE), but the INSERT path was not.
--
-- Fix: fall back to CURRENT_DATE when the incoming date_onboarded is NULL or
-- empty, so we never violate the NOT NULL constraint on new-cub inserts.
-- Existing rows are unaffected (the ON CONFLICT SET uses COALESCE to keep the
-- already-stored date whenever it exists).

CREATE OR REPLACE FUNCTION public.upsert_synced_cubs_directory(cubs_data jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  rec   jsonb;
  n     integer := 0;
  v_date_onboarded date;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(cubs_data) LOOP

    -- Parse date_onboarded; fall back to sub_start_date, then CURRENT_DATE
    -- when missing or empty, so we never insert NULL into the NOT NULL column.
    v_date_onboarded := COALESCE(
      NULLIF(rec->>'date_onboarded', '')::date,
      NULLIF(rec->>'sub_start_date', '')::date,
      CURRENT_DATE
    );

    INSERT INTO public.cubs (
      cub_id, date_onboarded, segment, gender, grade, stream, school_name,
      sub_start_date, sub_end_date, sub_status, no_sub_days, relationship_owner,
      current_streak, longest_streak, cumulative_points, cumulative_weekly_points, no_present,
      is_archived, archived_at, archived_reason
    ) VALUES (
      rec->>'cub_id',
      v_date_onboarded,
      rec->>'segment',
      rec->>'gender',
      rec->>'grade',
      rec->>'stream',
      rec->>'school_name',
      NULLIF(rec->>'sub_start_date', '')::date,
      NULLIF(rec->>'sub_end_date',   '')::date,
      rec->>'sub_status',
      NULLIF(rec->>'no_sub_days', '')::integer,
      rec->>'relationship_owner',
      0, 0, 0, 0, 0,
      false, NULL, NULL
    )
    ON CONFLICT (cub_id) DO UPDATE SET
      sub_start_date     = EXCLUDED.sub_start_date,
      sub_end_date       = EXCLUDED.sub_end_date,
      sub_status         = EXCLUDED.sub_status,
      no_sub_days        = EXCLUDED.no_sub_days,
      segment            = EXCLUDED.segment,
      gender             = EXCLUDED.gender,
      grade              = EXCLUDED.grade,
      stream             = EXCLUDED.stream,
      school_name        = EXCLUDED.school_name,
      relationship_owner = EXCLUDED.relationship_owner,
      -- Preserve existing date; only fill in when the row had none previously
      date_onboarded     = COALESCE(public.cubs.date_onboarded, EXCLUDED.date_onboarded),
      is_archived        = false,
      archived_at        = NULL,
      archived_reason    = NULL;

    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_synced_cubs_directory(jsonb) TO service_role;
