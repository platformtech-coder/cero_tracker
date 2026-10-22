-- ============================================================
-- MIGRATION: Reports System — Reading Circle Weekly Session Accountability
-- Date: 2026-10-21
-- Aggregates Reading Circle attendance by SESSION (not per-date rows)
-- over any selected date range / week (Sunday through Saturday).
-- Eliminates "rescheduled" column and displays:
--   - session: Clean canonical session name (ordered Sun -> Sat)
--   - expected_cubs: Total cubs currently enrolled in this session
--   - records_marked: Attendance records logged in the date range
--   - present_count: Cubs marked Present
--   - absent_count: Cubs marked Absent
--   - attendance_rate_pct: Percentage attended relative to expected cubs
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_rc_attendance_report(
  p_rep_name  TEXT  DEFAULT NULL,
  p_start     DATE  DEFAULT CURRENT_DATE - INTERVAL '7 days',
  p_end       DATE  DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH enrolled AS (
    -- Cubs enrolled in reading circle (base)
    SELECT
      rc.cub_id,
      COALESCE(NULLIF(TRIM(rc.selected_session), ''), 'Unassigned') AS selected_session,
      rc.rc_category,
      rc.no_present,
      rc.last_attendance_date,
      c.relationship_owner,
      mc.cub_first_name,
      mc.cub_last_name,
      mc.parent_first_name,
      mc.parent_last_name,
      mc.parent_phone
    FROM public.reading_circle rc
    JOIN public.cubs c   ON c.cub_id = rc.cub_id
    JOIN public.master_cubs mc ON mc.cub_id = rc.cub_id
    WHERE
      (p_rep_name IS NULL OR TRIM(LOWER(c.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND c.is_archived = false
  ),
  session_roster AS (
    -- Expected cubs per session according to current enrollment
    SELECT
      selected_session AS session,
      COUNT(DISTINCT cub_id) AS expected_cubs
    FROM enrolled
    WHERE selected_session <> 'Unassigned'
    GROUP BY selected_session
  ),
  attendance_in_range AS (
    -- Attendance rows logged within the selected date range
    SELECT
      rca.cub_id,
      COALESCE(NULLIF(TRIM(rca.session), ''), 'Unassigned') AS session,
      rca.attendance_date,
      rca.status
    FROM public.rc_attendance rca
    JOIN enrolled e ON e.cub_id = rca.cub_id
    WHERE rca.attendance_date BETWEEN p_start AND p_end
  ),
  session_attendance AS (
    -- Grouped by session across the entire period (week/range)
    SELECT
      air.session,
      COUNT(*)                                       AS records_marked,
      COUNT(*) FILTER (WHERE air.status = 'Present') AS present_count,
      COUNT(*) FILTER (WHERE air.status = 'Absent')  AS absent_count
    FROM attendance_in_range air
    WHERE air.session <> 'Unassigned'
    GROUP BY air.session
  ),
  session_combined AS (
    -- Combine enrolled roster with attendance
    SELECT
      COALESCE(sr.session, sa.session) AS session,
      COALESCE(sr.expected_cubs, 0)    AS expected_cubs,
      COALESCE(sa.records_marked, 0)   AS records_marked,
      COALESCE(sa.present_count, 0)    AS present_count,
      COALESCE(sa.absent_count, 0)     AS absent_count,
      COALESCE(
        ROUND(
          100.0 * COALESCE(sa.present_count, 0) / NULLIF(COALESCE(sr.expected_cubs, 0), 0), 1
        ),
        0.0
      ) AS attendance_rate_pct
    FROM session_roster sr
    FULL OUTER JOIN session_attendance sa ON sa.session = sr.session
    WHERE COALESCE(sr.session, sa.session) IS NOT NULL
      AND COALESCE(sr.session, sa.session) <> ''
      AND COALESCE(sr.session, sa.session) <> 'Unassigned'
  ),
  overall_metrics AS (
    SELECT
      e.relationship_owner AS rep,
      COUNT(DISTINCT e.cub_id)                                         AS total_enrolled,
      COUNT(DISTINCT e.cub_id) FILTER (WHERE e.no_present = 0)        AS never_attended,
      COUNT(DISTINCT air.cub_id) FILTER (WHERE air.status = 'Present') AS attended_in_period
    FROM enrolled e
    LEFT JOIN attendance_in_range air ON air.cub_id = e.cub_id
    GROUP BY e.relationship_owner
  )
  SELECT jsonb_build_object(
    'session_summary', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'session',             sc.session,
          'expected_cubs',       sc.expected_cubs,
          'records_marked',      sc.records_marked,
          'present_count',       sc.present_count,
          'absent_count',        sc.absent_count,
          'attendance_rate_pct', sc.attendance_rate_pct
        )
        ORDER BY
          CASE LOWER(SPLIT_PART(TRIM(sc.session), ' ', 1))
            WHEN 'sunday'     THEN 1
            WHEN 'sundays'    THEN 1
            WHEN 'monday'     THEN 2
            WHEN 'mondays'    THEN 2
            WHEN 'tuesday'    THEN 3
            WHEN 'tuesdays'   THEN 3
            WHEN 'wednesday'  THEN 4
            WHEN 'wednesdays' THEN 4
            WHEN 'thursday'   THEN 5
            WHEN 'thursdays'  THEN 5
            WHEN 'friday'     THEN 6
            WHEN 'fridays'    THEN 6
            WHEN 'saturday'   THEN 7
            WHEN 'saturdays'  THEN 7
            ELSE 8
          END,
          sc.session
      ) FROM session_combined sc
    ),
    'rep_metrics', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'rep',               om.rep,
          'total_enrolled',    om.total_enrolled,
          'never_attended',    om.never_attended,
          'attended_in_period',om.attended_in_period
        )
        ORDER BY om.rep
      ) FROM overall_metrics om
    ),
    'cub_detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'cub_id',            e.cub_id,
          'cub_first_name',    e.cub_first_name,
          'cub_last_name',     e.cub_last_name,
          'parent_first_name', e.parent_first_name,
          'parent_last_name',  e.parent_last_name,
          'parent_phone',      e.parent_phone,
          'rep',               e.relationship_owner,
          'session',           e.selected_session,
          'rc_category',       e.rc_category,
          'total_present',     e.no_present,
          'last_attendance',   e.last_attendance_date
        )
        ORDER BY e.cub_last_name, e.cub_first_name
      ) FROM enrolled e
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_rc_attendance_report(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_rc_attendance_report(TEXT, DATE, DATE) TO authenticated, service_role;
