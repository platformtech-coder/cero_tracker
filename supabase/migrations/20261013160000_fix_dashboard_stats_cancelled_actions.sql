-- Migration: 20261013160000_fix_dashboard_stats_cancelled_actions.sql
-- BL-1 Fix: get_dashboard_stats RPC was counting Cancelled actions as pending.
-- The fast-path RPC had: action_status != 'Completed' OR action_status IS NULL
-- which incorrectly included 'Cancelled' rows in pending_actions_count.
-- The JS fallback in dashboard.ts already excluded Cancelled correctly.
-- This migration makes the DB match the intended behaviour.

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
      -- FIX: exclude both 'Completed' AND 'Cancelled' from pending count
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
