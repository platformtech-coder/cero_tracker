-- ============================================================
-- MIGRATION: Performance & Security Hardening
-- Date: 2026-10-21
-- Addresses:
--   PERF-01: get_call_parents_report payload 814KB → ~8KB
--             (strip detail into separate lazy-load RPC)
--   PERF-02: Covering index for interactions (handled_by, date, type, status)
--             used by call-parents and daily-activity RPCs
--   PERF-03: Covering index for daily_flag_snapshots
--             (flag, snapshot_date, relationship_owner, cub_id)
--   PERF-04: Covering index for orientation (booked_date, attended_date)
--   PERF-05: Remove duplicate idx_cubs_owner index (same col as idx_cubs_relationship_owner)
--   SEC-01:  Fix mutable search_path on archive_missing_cubs,
--             restore_archived_cub, upsert_synced_cubs_directory
--   SEC-02:  Revoke anon EXECUTE on archive_missing_cubs,
--             get_dashboard_stats, restore_archived_cub
-- ============================================================

-- ============================================================
-- SECTION 1: Security — Fix mutable search_path
-- ============================================================

ALTER FUNCTION public.archive_missing_cubs(text[])
  SET search_path = public;

ALTER FUNCTION public.restore_archived_cub(text)
  SET search_path = public;

-- upsert_synced_cubs_directory may have multiple overloads; catch both
DO $$
BEGIN
  BEGIN
    ALTER FUNCTION public.upsert_synced_cubs_directory(jsonb)
      SET search_path = public;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END;
$$;


-- ============================================================
-- SECTION 2: Security — Revoke anon EXECUTE on sensitive functions
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.archive_missing_cubs(text[])  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restore_archived_cub(text)    FROM anon, public;

-- get_dashboard_stats was already granted to authenticated; revoke anon
DO $$
BEGIN
  BEGIN
    REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(text) FROM anon, public;
    GRANT  EXECUTE ON FUNCTION public.get_dashboard_stats(text) TO authenticated;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
END;
$$;

-- Ensure archive/restore are available to authenticated + service_role only
GRANT EXECUTE ON FUNCTION public.archive_missing_cubs(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_archived_cub(text)   TO authenticated, service_role;


-- ============================================================
-- SECTION 3: Covering indexes for report RPCs
-- ============================================================

-- PERF-02: Interactions — covering index for call-parents join + daily-activity
-- Replaces non-covering idx_interactions_date (date DESC) and
-- the unused idx_interactions_handled_by with a single covering index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_interactions_date_rep_type_status
  ON public.interactions (date, handled_by, type, status)
  INCLUDE (cub_id, parent_first_name, parent_last_name);

-- PERF-03: daily_flag_snapshots — covering index for call-parents report
-- The RPC filters on: snapshot_date BETWEEN x AND y, flag LIKE '%call parent%', relationship_owner
-- The existing idx_dfs_date only covers snapshot_date DESC; this covering index
-- avoids the table heap fetch for the most common access pattern.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dfs_date_flag_owner
  ON public.daily_flag_snapshots (snapshot_date, relationship_owner)
  INCLUDE (cub_id, flag, cub_first_name, cub_last_name, parent_first_name, parent_last_name, parent_phone, sub_status);

-- PERF-04: Orientation covering index for booked_date / attended_date range scans
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orientation_booked_attended
  ON public.orientation (booked_date, attended_date)
  INCLUDE (cub_id, stage, stage_status, rc_selected_status, invited_status, booked_status, attended_status, first_win_status);

-- PERF-05: rc_attendance — already has idx_rc_attendance_session_date (session, attendance_date)
-- Add partial index on status = 'Present' for the rollup trigger (avoids full scan)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rc_attendance_present
  ON public.rc_attendance (cub_id, attendance_date)
  WHERE status = 'Present';


-- ============================================================
-- SECTION 4: Rewrite get_call_parents_report — summary only (PERF-01)
-- Strips the 800KB+ detail array; detail is fetched lazily via
-- get_call_parents_detail() when the user opens the drawer.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_call_parents_report(
  p_rep_name TEXT DEFAULT NULL,
  p_start    DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
  p_end      DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH snap AS (
    SELECT
      dfs.snapshot_date,
      dfs.cub_id,
      dfs.flag,
      dfs.relationship_owner,
      dfs.cub_first_name,
      dfs.cub_last_name,
      dfs.parent_first_name,
      dfs.parent_last_name,
      dfs.parent_phone,
      dfs.sub_status,
      COALESCE(
        NULLIF(TRIM(dfs.parent_phone), ''),
        LOWER(TRIM(dfs.parent_first_name)) || ' ' || LOWER(TRIM(dfs.parent_last_name))
      ) AS family_key
    FROM public.daily_flag_snapshots dfs
    WHERE
      dfs.snapshot_date BETWEEN p_start AND p_end
      AND (p_rep_name IS NULL OR TRIM(LOWER(dfs.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND LOWER(dfs.flag) LIKE '%call parent%'
  ),
  interaction_calls AS (
    SELECT
      i.date,
      i.handled_by,
      i.cub_id,
      i.status,
      COALESCE(
        NULLIF(TRIM(mc.parent_phone), ''),
        LOWER(TRIM(i.parent_first_name)) || ' ' || LOWER(TRIM(i.parent_last_name))
      ) AS family_key
    FROM public.interactions i
    LEFT JOIN public.master_cubs mc ON mc.cub_id = i.cub_id
    WHERE
      i.date >= p_start::TIMESTAMPTZ
      AND i.date < (p_end + INTERVAL '1 day')::TIMESTAMPTZ
      AND LOWER(TRIM(i.type)) IN ('call', 'phone call', 'telephone')
  ),
  family_interactions AS (
    SELECT
      family_key,
      date::DATE AS interaction_date,
      bool_or(LOWER(TRIM(status)) = 'reached') AS was_reached
    FROM interaction_calls
    GROUP BY family_key, date::DATE
  ),
  family_cubs AS (
    SELECT
      s.snapshot_date,
      s.relationship_owner,
      s.family_key,
      COUNT(DISTINCT s.cub_id)                                                              AS cubs_count,
      (fi.family_key IS NOT NULL)                                                            AS was_called,
      COALESCE(fi.was_reached, false)                                                        AS was_reached,
      CASE
        WHEN fi.was_reached = true THEN 'Reached'
        WHEN fi.family_key IS NOT NULL THEN 'Not Reached'
        ELSE 'Not Called'
      END AS call_status
    FROM snap s
    LEFT JOIN family_interactions fi
      ON fi.family_key = s.family_key
      AND fi.interaction_date = s.snapshot_date
    GROUP BY
      s.snapshot_date, s.relationship_owner, s.family_key,
      fi.family_key, fi.was_reached
  ),
  daily_summary AS (
    SELECT
      snapshot_date,
      relationship_owner,
      COUNT(*)                                                         AS total_families_due,
      SUM(cubs_count)                                                  AS total_cubs_due,
      COUNT(*) FILTER (WHERE was_called = true)                        AS families_called,
      COUNT(*) FILTER (WHERE was_called = false)                       AS families_not_called,
      COUNT(*) FILTER (WHERE was_called = true AND was_reached = true) AS families_reached,
      COUNT(*) FILTER (WHERE was_called = true AND was_reached = false) AS families_not_reached,
      COALESCE(SUM(cubs_count) FILTER (WHERE was_called = true), 0)   AS cubs_covered,
      COALESCE(SUM(cubs_count) FILTER (WHERE was_called = false), 0)  AS cubs_not_covered,
      ROUND(100.0 * COUNT(*) FILTER (WHERE was_called = true) / NULLIF(COUNT(*), 0), 1) AS call_rate_pct,
      COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE was_called = true AND was_reached = true) / NULLIF(COUNT(*) FILTER (WHERE was_called = true), 0), 1), 0.0) AS success_rate_pct
    FROM family_cubs
    GROUP BY snapshot_date, relationship_owner
  )
  -- Return ONLY the summary — detail is fetched lazily via get_call_parents_detail()
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date',                 ds.snapshot_date,
          'rep',                  ds.relationship_owner,
          'total_families_due',   ds.total_families_due,
          'total_cubs_due',       ds.total_cubs_due,
          'families_called',      ds.families_called,
          'families_not_called',  ds.families_not_called,
          'families_reached',     ds.families_reached,
          'families_not_reached', ds.families_not_reached,
          'cubs_covered',         ds.cubs_covered,
          'cubs_not_covered',     ds.cubs_not_covered,
          'call_rate_pct',        COALESCE(ds.call_rate_pct, 0.0),
          'success_rate_pct',     COALESCE(ds.success_rate_pct, 0.0)
        )
        ORDER BY ds.snapshot_date DESC, ds.relationship_owner
      ) FROM daily_summary ds
    ),
    'detail', '[]'::jsonb   -- always empty; use get_call_parents_detail() for rows
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{"summary":[],"detail":[]}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_call_parents_report(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_call_parents_report(TEXT, DATE, DATE) TO authenticated, service_role;


-- ============================================================
-- SECTION 5: New lazy-load RPC — get_call_parents_detail
-- Called only when the user opens the detail drawer for a specific
-- rep/date, keeping the main report payload small.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_call_parents_detail(
  p_rep_name    TEXT  DEFAULT NULL,
  p_target_date DATE  DEFAULT CURRENT_DATE,
  p_status      TEXT  DEFAULT NULL   -- 'Reached' | 'Not Reached' | 'Not Called' | NULL (all)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH snap AS (
    SELECT
      dfs.cub_id,
      dfs.relationship_owner,
      dfs.cub_first_name,
      dfs.cub_last_name,
      dfs.parent_first_name,
      dfs.parent_last_name,
      dfs.parent_phone,
      dfs.sub_status,
      COALESCE(
        NULLIF(TRIM(dfs.parent_phone), ''),
        LOWER(TRIM(dfs.parent_first_name)) || ' ' || LOWER(TRIM(dfs.parent_last_name))
      ) AS family_key
    FROM public.daily_flag_snapshots dfs
    WHERE
      dfs.snapshot_date = p_target_date
      AND (p_rep_name IS NULL OR TRIM(LOWER(dfs.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND LOWER(dfs.flag) LIKE '%call parent%'
  ),
  interaction_calls AS (
    SELECT
      i.id,
      i.date,
      i.handled_by,
      i.cub_id,
      i.status,
      i.feedback,
      COALESCE(
        NULLIF(TRIM(mc.parent_phone), ''),
        LOWER(TRIM(i.parent_first_name)) || ' ' || LOWER(TRIM(i.parent_last_name))
      ) AS family_key
    FROM public.interactions i
    LEFT JOIN public.master_cubs mc ON mc.cub_id = i.cub_id
    WHERE
      i.date >= p_target_date::TIMESTAMPTZ
      AND i.date < (p_target_date + INTERVAL '1 day')::TIMESTAMPTZ
      AND LOWER(TRIM(i.type)) IN ('call', 'phone call', 'telephone')
  ),
  family_interactions AS (
    SELECT
      family_key,
      bool_or(LOWER(TRIM(status)) = 'reached') AS was_reached,
      array_agg(DISTINCT cub_id)               AS called_cub_ids,
      MAX(date)                                 AS last_call_date,
      MAX(handled_by)                           AS last_call_rep,
      MAX(feedback)                             AS last_call_feedback
    FROM interaction_calls
    GROUP BY family_key
  ),
  family_cubs AS (
    SELECT
      s.relationship_owner,
      s.family_key,
      MAX(s.parent_first_name)  AS parent_first_name,
      MAX(s.parent_last_name)   AS parent_last_name,
      MAX(s.parent_phone)       AS parent_phone,
      COUNT(DISTINCT s.cub_id)  AS cubs_count,
      jsonb_agg(
        jsonb_build_object(
          'cub_id',     s.cub_id,
          'cub_name',   TRIM(s.cub_first_name || ' ' || COALESCE(s.cub_last_name, '')),
          'sub_status', s.sub_status,
          'was_called', (fi.called_cub_ids IS NOT NULL AND s.cub_id = ANY(fi.called_cub_ids))
        ) ORDER BY s.cub_first_name
      ) AS cubs,
      (fi.family_key IS NOT NULL)          AS was_called,
      COALESCE(fi.was_reached, false)       AS was_reached,
      CASE
        WHEN fi.was_reached = true THEN 'Reached'
        WHEN fi.family_key IS NOT NULL THEN 'Not Reached'
        ELSE 'Not Called'
      END AS call_status,
      fi.last_call_date,
      fi.last_call_rep,
      fi.last_call_feedback
    FROM snap s
    LEFT JOIN family_interactions fi ON fi.family_key = s.family_key
    GROUP BY
      s.relationship_owner, s.family_key,
      fi.family_key, fi.was_reached,
      fi.last_call_date, fi.last_call_rep, fi.last_call_feedback, fi.called_cub_ids
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'date',               p_target_date,
      'rep',                fc.relationship_owner,
      'family_key',         fc.family_key,
      'parent_name',        TRIM(fc.parent_first_name || ' ' || COALESCE(fc.parent_last_name, '')),
      'parent_phone',       fc.parent_phone,
      'cubs_count',         fc.cubs_count,
      'cubs',               fc.cubs,
      'was_called',         fc.was_called,
      'was_reached',        fc.was_reached,
      'call_status',        fc.call_status,
      'last_call_date',     fc.last_call_date,
      'last_call_rep',      fc.last_call_rep,
      'last_call_feedback', fc.last_call_feedback
    )
    ORDER BY fc.was_called ASC, fc.cubs_count DESC
  )
  INTO v_result
  FROM family_cubs fc
  WHERE (p_status IS NULL OR fc.call_status = p_status);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_call_parents_detail(TEXT, DATE, TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_call_parents_detail(TEXT, DATE, TEXT) TO authenticated, service_role;


-- ============================================================
-- SECTION 6: Rewrite get_rc_attendance_report — strip cub_detail
-- cub_detail (56KB) is removed from the main call; fetched lazily
-- via get_rc_session_roster() when the drawer is opened.
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
    SELECT
      rc.cub_id,
      COALESCE(NULLIF(TRIM(rc.selected_session), ''), 'Unassigned') AS selected_session,
      rc.rc_category,
      rc.no_present,
      rc.last_attendance_date,
      c.relationship_owner
    FROM public.reading_circle rc
    JOIN public.cubs c ON c.cub_id = rc.cub_id
    WHERE
      (p_rep_name IS NULL OR TRIM(LOWER(c.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND c.is_archived = false
  ),
  session_roster AS (
    SELECT
      selected_session AS session,
      COUNT(DISTINCT cub_id) AS expected_cubs
    FROM enrolled
    WHERE selected_session <> 'Unassigned'
    GROUP BY selected_session
  ),
  attendance_in_range AS (
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
            WHEN 'sunday'     THEN 1 WHEN 'sundays'    THEN 1
            WHEN 'monday'     THEN 2 WHEN 'mondays'    THEN 2
            WHEN 'tuesday'    THEN 3 WHEN 'tuesdays'   THEN 3
            WHEN 'wednesday'  THEN 4 WHEN 'wednesdays' THEN 4
            WHEN 'thursday'   THEN 5 WHEN 'thursdays'  THEN 5
            WHEN 'friday'     THEN 6 WHEN 'fridays'    THEN 6
            WHEN 'saturday'   THEN 7 WHEN 'saturdays'  THEN 7
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
    -- cub_detail removed — fetched lazily via get_rc_session_roster()
    'cub_detail', '[]'::jsonb
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_rc_attendance_report(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_rc_attendance_report(TEXT, DATE, DATE) TO authenticated, service_role;


-- ============================================================
-- SECTION 7: New lazy-load RPC — get_rc_session_roster
-- Returns the per-cub detail for a single session, fetched only
-- when the user opens the session drawer.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_rc_session_roster(
  p_rep_name  TEXT  DEFAULT NULL,
  p_session   TEXT  DEFAULT NULL,   -- specific session name, NULL = all sessions
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
      AND (p_session IS NULL OR TRIM(LOWER(rc.selected_session)) = TRIM(LOWER(p_session)))
  ),
  attendance_in_range AS (
    SELECT
      rca.cub_id,
      COUNT(*) FILTER (WHERE rca.status = 'Present') AS present_in_period,
      COUNT(*) FILTER (WHERE rca.status = 'Absent')  AS absent_in_period,
      MAX(rca.attendance_date) FILTER (WHERE rca.status = 'Present') AS last_present_date
    FROM public.rc_attendance rca
    JOIN enrolled e ON e.cub_id = rca.cub_id
    WHERE rca.attendance_date BETWEEN p_start AND p_end
    GROUP BY rca.cub_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'cub_id',             e.cub_id,
      'cub_first_name',     e.cub_first_name,
      'cub_last_name',      e.cub_last_name,
      'parent_first_name',  e.parent_first_name,
      'parent_last_name',   e.parent_last_name,
      'parent_phone',       e.parent_phone,
      'rep',                e.relationship_owner,
      'session',            e.selected_session,
      'rc_category',        e.rc_category,
      'total_present_ever', e.no_present,
      'present_in_period',  COALESCE(air.present_in_period, 0),
      'absent_in_period',   COALESCE(air.absent_in_period, 0),
      'last_attendance',    e.last_attendance_date
    )
    ORDER BY e.cub_last_name, e.cub_first_name
  )
  INTO v_result
  FROM enrolled e
  LEFT JOIN attendance_in_range air ON air.cub_id = e.cub_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_rc_session_roster(TEXT, TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_rc_session_roster(TEXT, TEXT, DATE, DATE) TO authenticated, service_role;


-- ============================================================
-- END OF MIGRATION
-- ============================================================
