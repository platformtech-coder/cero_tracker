-- Migration: Fix sync write isolation and add performance indexes
-- Replaces full-row upserts in edge function with targeted column updates
-- to prevent coordinator-managed fields being overwritten during sheet sync.

CREATE OR REPLACE FUNCTION public.upsert_synced_cubs_directory(cubs_data jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec jsonb; n integer := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(cubs_data) LOOP
    INSERT INTO public.cubs (
      cub_id, date_onboarded, segment, gender, grade, stream, school_name,
      sub_start_date, sub_end_date, sub_status, no_sub_days, relationship_owner,
      current_streak, longest_streak, cumulative_points, cumulative_weekly_points, no_present
    ) VALUES (
      rec->>'cub_id', NULLIF(rec->>'date_onboarded','')::date,
      rec->>'segment', rec->>'gender', rec->>'grade', rec->>'stream', rec->>'school_name',
      NULLIF(rec->>'sub_start_date','')::date, NULLIF(rec->>'sub_end_date','')::date,
      rec->>'sub_status', NULLIF(rec->>'no_sub_days','')::integer,
      rec->>'relationship_owner', 0, 0, 0, 0, 0
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
      date_onboarded     = COALESCE(public.cubs.date_onboarded, EXCLUDED.date_onboarded);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_synced_cubs_reading(cubs_data jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec jsonb; n integer := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(cubs_data) LOOP
    UPDATE public.cubs SET
      current_streak    = COALESCE(NULLIF(rec->>'current_streak','')::integer, current_streak),
      longest_streak    = COALESCE(NULLIF(rec->>'longest_streak','')::integer, longest_streak),
      streak_label      = NULLIF(rec->>'streak_label',''),
      current_league    = NULLIF(rec->>'current_league',''),
      medallion_status  = NULLIF(rec->>'medallion_status',''),
      flag              = NULLIF(rec->>'flag',''),
      cumulative_points = COALESCE(NULLIF(rec->>'cumulative_points','')::integer, cumulative_points)
    WHERE cub_id = rec->>'cub_id';
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_synced_cubs_scores(cubs_data jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec jsonb; n integer := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(cubs_data) LOOP
    UPDATE public.cubs SET
      cumulative_weekly_points = COALESCE(NULLIF(rec->>'cumulative_weekly_points','')::integer, cumulative_weekly_points),
      last_reading_activity    = NULLIF(rec->>'last_reading_activity','')
    WHERE cub_id = rec->>'cub_id';
    IF FOUND THEN n := n + 1; END IF;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_synced_cubs_directory(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_synced_cubs_reading(jsonb)    TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_synced_cubs_scores(jsonb)     TO service_role;

CREATE INDEX IF NOT EXISTS idx_cubs_owner_substatus     ON public.cubs(relationship_owner, sub_status);
CREATE INDEX IF NOT EXISTS idx_cubs_segment_substatus   ON public.cubs(segment, sub_status);
CREATE INDEX IF NOT EXISTS idx_actions_handled_by_status ON public.actions(handled_by, action_status);
CREATE INDEX IF NOT EXISTS idx_pending_signups_source_status ON public.pending_signups(form_source, status);
