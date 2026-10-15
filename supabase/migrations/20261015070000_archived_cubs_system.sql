-- Migration: 20261015070000_archived_cubs_system.sql
-- Implements soft-delete / archiving mechanism for cubs removed from Master Google Sheet
-- Excludes archived cubs from main UI and dashboard calculations
-- Provides RPCs to archive missing cubs, unarchive returning cubs, and manage archived cubs

-- 1. Add archiving columns to cubs and master_cubs
ALTER TABLE public.cubs
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

ALTER TABLE public.master_cubs
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_cubs_is_archived ON public.cubs(is_archived);
CREATE INDEX IF NOT EXISTS idx_master_cubs_is_archived ON public.master_cubs(is_archived);
CREATE INDEX IF NOT EXISTS idx_cubs_archived_segment ON public.cubs(segment) WHERE is_archived = true;

-- 2. Update upsert_synced_cubs_directory to automatically unarchive any returning cub
CREATE OR REPLACE FUNCTION public.upsert_synced_cubs_directory(cubs_data jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec jsonb; n integer := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(cubs_data) LOOP
    INSERT INTO public.cubs (
      cub_id, date_onboarded, segment, gender, grade, stream, school_name,
      sub_start_date, sub_end_date, sub_status, no_sub_days, relationship_owner,
      current_streak, longest_streak, cumulative_points, cumulative_weekly_points, no_present,
      is_archived, archived_at, archived_reason
    ) VALUES (
      rec->>'cub_id', NULLIF(rec->>'date_onboarded','')::date,
      rec->>'segment', rec->>'gender', rec->>'grade', rec->>'stream', rec->>'school_name',
      NULLIF(rec->>'sub_start_date','')::date, NULLIF(rec->>'sub_end_date','')::date,
      rec->>'sub_status', NULLIF(rec->>'no_sub_days','')::integer,
      rec->>'relationship_owner', 0, 0, 0, 0, 0,
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

-- 3. RPC to archive missing cubs and unarchive returning cubs in bulk
CREATE OR REPLACE FUNCTION public.archive_missing_cubs(active_cub_ids text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_archived_count integer := 0;
  v_unarchived_count integer := 0;
BEGIN
  -- Unarchive any cubs that are present in the active sheet but previously archived
  WITH unarchived AS (
    UPDATE public.cubs
    SET is_archived = false,
        archived_at = NULL,
        archived_reason = NULL,
        updated_at = NOW()
    WHERE is_archived = true
      AND cub_id = ANY(active_cub_ids)
    RETURNING cub_id
  )
  SELECT count(*) INTO v_unarchived_count FROM unarchived;

  UPDATE public.master_cubs
  SET is_archived = false,
      archived_at = NULL,
      archived_reason = NULL,
      updated_at = NOW()
  WHERE is_archived = true
    AND cub_id = ANY(active_cub_ids);

  -- Archive any cubs in the database that are NOT in the active sheet list
  WITH newly_archived AS (
    UPDATE public.cubs
    SET is_archived = true,
        archived_at = NOW(),
        archived_reason = 'Removed from Master Sheet',
        updated_at = NOW()
    WHERE is_archived = false
      AND NOT (cub_id = ANY(active_cub_ids))
    RETURNING cub_id
  )
  SELECT count(*) INTO v_archived_count FROM newly_archived;

  UPDATE public.master_cubs
  SET is_archived = true,
      archived_at = NOW(),
      archived_reason = 'Removed from Master Sheet',
      updated_at = NOW()
  WHERE is_archived = false
    AND NOT (cub_id = ANY(active_cub_ids));

  RETURN jsonb_build_object(
    'archived_count', v_archived_count,
    'unarchived_count', v_unarchived_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_missing_cubs(text[]) TO service_role;

-- 4. Update get_dashboard_stats to strictly exclude archived cubs from all metrics
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_rep_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_next_week date := CURRENT_DATE + INTERVAL '7 days';
  v_next_month date := CURRENT_DATE + INTERVAL '1 month';
  v_result jsonb;
BEGIN
  WITH filtered_cubs AS (
    SELECT *
    FROM public.cubs
    WHERE (p_rep_name IS NULL OR TRIM(relationship_owner) ILIKE TRIM(p_rep_name))
      AND is_archived = false
  ),
  cubs_metrics AS (
    SELECT
      COUNT(*) AS total_cubs,
      COUNT(*) FILTER (WHERE LOWER(TRIM(sub_status)) IN ('active', 'almost expiring')) AS active_subs,
      COUNT(*) FILTER (WHERE LOWER(TRIM(sub_status)) = 'expired') AS expired_subs,
      COUNT(*) FILTER (
        WHERE LOWER(TRIM(sub_status)) = 'almost expiring'
          AND sub_end_date >= v_today
          AND sub_end_date <= v_next_week
      ) AS almost_expiring_week,
      COUNT(*) FILTER (
        WHERE LOWER(TRIM(sub_status)) = 'almost expiring'
          AND sub_end_date >= v_today
          AND sub_end_date <= v_next_month
      ) AS almost_expiring_month,
      COUNT(*) FILTER (WHERE flag IS NOT NULL AND TRIM(flag) != '') AS flagged_cubs
    FROM filtered_cubs
  ),
  fam_metrics AS (
    SELECT COUNT(*) AS total_parents
    FROM public.families
    WHERE (p_rep_name IS NULL OR TRIM(relationship_owner) ILIKE TRIM(p_rep_name))
  ),
  act_metrics AS (
    SELECT
      COUNT(*) FILTER (WHERE action_status = 'Completed') AS completed_actions_count,
      COUNT(*) FILTER (WHERE action_status NOT IN ('Completed', 'Cancelled')) AS pending_actions_count
    FROM public.actions
    WHERE (p_rep_name IS NULL OR TRIM(handled_by) ILIKE TRIM(p_rep_name))
  ),
  pending_metrics AS (
    SELECT
      COUNT(*) FILTER (WHERE form_source = 'Reading Circle Signup') AS rc_pending_count,
      COUNT(*) FILTER (WHERE form_source = 'Orientation Signup') AS orientation_pending_count
    FROM public.pending_signups
    WHERE status = 'Pending'
  )
  SELECT jsonb_build_object(
    'totalCubs', cm.total_cubs,
    'totalParents', fm.total_parents,
    'activeSubs', cm.active_subs,
    'expiredSubs', cm.expired_subs,
    'almostExpiringWeek', cm.almost_expiring_week,
    'almostExpiringMonth', cm.almost_expiring_month,
    'flaggedCubs', cm.flagged_cubs,
    'pendingActionsCount', am.pending_actions_count,
    'completedActionsCount', am.completed_actions_count,
    'rcPendingCount', pm.rc_pending_count,
    'orientationPendingCount', pm.orientation_pending_count
  )
  INTO v_result
  FROM cubs_metrics cm, fam_metrics fm, act_metrics am, pending_metrics pm;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(text) TO authenticated, service_role, anon;

-- 5. Helper function to restore a single cub from archive
CREATE OR REPLACE FUNCTION public.restore_archived_cub(p_cub_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.cubs
  SET is_archived = false,
      archived_at = NULL,
      archived_reason = NULL,
      updated_at = NOW()
  WHERE cub_id = p_cub_id;

  UPDATE public.master_cubs
  SET is_archived = false,
      archived_at = NULL,
      archived_reason = NULL,
      updated_at = NOW()
  WHERE cub_id = p_cub_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_archived_cub(text) TO authenticated, service_role;
