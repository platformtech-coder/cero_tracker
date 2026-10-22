-- ============================================================
-- MIGRATION: Reports System — Phase 2 — Report RPCs
-- Date: 2026-10-21
-- Creates Postgres functions (RPCs) for each report module.
-- All functions are SECURITY DEFINER and honour role-based access
-- through their p_rep_name parameter (NULL = all reps, admin only).
-- ============================================================

-- ─── 1. get_daily_activity_report ────────────────────────────
-- Returns a per-rep daily activity summary:
--   calls made, successful (status='Reached'), unsuccessful,
--   messages sent, actions created, handover notes submitted.
CREATE OR REPLACE FUNCTION public.get_daily_activity_report(
  p_rep_name  TEXT    DEFAULT NULL,  -- NULL = all reps (admin)
  p_date      DATE    DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ := p_date::TIMESTAMPTZ;
  v_end   TIMESTAMPTZ := (p_date + INTERVAL '1 day')::TIMESTAMPTZ;
  v_result JSONB;
BEGIN
  WITH filtered_interactions AS (
    SELECT
      i.id,
      i.handled_by,
      i.type,
      i.status,
      i.purpose,
      i.cub_id,
      i.cub_first_name,
      i.cub_last_name,
      i.parent_first_name,
      i.parent_last_name,
      i.action_required,
      i.date,
      i.logged_by
    FROM public.interactions i
    WHERE
      i.date >= v_start
      AND i.date < v_end
      AND (p_rep_name IS NULL OR TRIM(LOWER(i.handled_by)) = TRIM(LOWER(p_rep_name)))
  ),
  interaction_metrics AS (
    SELECT
      handled_by,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone'))         AS calls_made,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')
                            AND LOWER(TRIM(status)) = 'reached')                               AS calls_successful,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')
                            AND LOWER(TRIM(status)) != 'reached')                              AS calls_unsuccessful,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('message', 'whatsapp', 'sms', 'email'))    AS messages_sent,
      COUNT(*) FILTER (WHERE action_required = 'Yes')                                          AS actions_created,
      COUNT(*)                                                                                  AS total_interactions
    FROM filtered_interactions
    GROUP BY handled_by
  ),
  handover_metrics AS (
    SELECT
      p.full_name AS rep_name,
      COUNT(*)    AS handover_notes_submitted
    FROM public.handover_notes h
    JOIN public.profiles p ON p.id = h.logged_by
    WHERE
      h.date >= v_start
      AND h.date < v_end
      AND (p_rep_name IS NULL OR TRIM(LOWER(p.full_name)) = TRIM(LOWER(p_rep_name)))
    GROUP BY p.full_name
  ),
  all_reps AS (
    -- Combine reps who had interactions OR handover notes that day
    SELECT DISTINCT handled_by AS rep FROM interaction_metrics
    UNION
    SELECT DISTINCT rep_name   AS rep FROM handover_metrics
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'rep',                    r.rep,
      'calls_made',             COALESCE(im.calls_made, 0),
      'calls_successful',       COALESCE(im.calls_successful, 0),
      'calls_unsuccessful',     COALESCE(im.calls_unsuccessful, 0),
      'messages_sent',          COALESCE(im.messages_sent, 0),
      'actions_created',        COALESCE(im.actions_created, 0),
      'total_interactions',     COALESCE(im.total_interactions, 0),
      'handover_notes',         COALESCE(hm.handover_notes_submitted, 0)
    )
    ORDER BY r.rep
  )
  INTO v_result
  FROM all_reps r
  LEFT JOIN interaction_metrics im ON TRIM(LOWER(im.handled_by)) = TRIM(LOWER(r.rep))
  LEFT JOIN handover_metrics    hm ON TRIM(LOWER(hm.rep_name))   = TRIM(LOWER(r.rep));

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_activity_report(TEXT, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_daily_activity_report(TEXT, DATE) TO authenticated, service_role;


-- ─── 2. get_daily_activity_interactions ──────────────────────
-- Returns the actual interaction rows for a rep on a given day
-- (used to populate the drill-down drawer).
CREATE OR REPLACE FUNCTION public.get_daily_activity_interactions(
  p_rep_name  TEXT,
  p_date      DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id              UUID,
  date            TIMESTAMPTZ,
  cub_id          TEXT,
  cub_first_name  TEXT,
  cub_last_name   TEXT,
  parent_first_name TEXT,
  parent_last_name  TEXT,
  handled_by      TEXT,
  type            TEXT,
  purpose         TEXT,
  status          TEXT,
  feedback        TEXT,
  action_required TEXT,
  action          TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.date, i.cub_id,
    i.cub_first_name, i.cub_last_name,
    i.parent_first_name, i.parent_last_name,
    i.handled_by, i.type, i.purpose, i.status,
    i.feedback, i.action_required, i.action
  FROM public.interactions i
  WHERE
    i.date >= p_date::TIMESTAMPTZ
    AND i.date < (p_date + INTERVAL '1 day')::TIMESTAMPTZ
    AND TRIM(LOWER(i.handled_by)) = TRIM(LOWER(p_rep_name))
  ORDER BY i.date DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE) TO authenticated, service_role;


-- ─── 3. get_core_parent_accountability ───────────────────────
-- For each day in the range, per rep: how many "Call Parent" flagged
-- cubs were in the snapshot, and how many were actually called
-- (i.e. had an interaction logged that day)?
CREATE OR REPLACE FUNCTION public.get_core_parent_accountability(
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
  WITH snapshots AS (
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
      dfs.sub_status
    FROM public.daily_flag_snapshots dfs
    WHERE
      dfs.snapshot_date BETWEEN p_start AND p_end
      AND (p_rep_name IS NULL OR TRIM(LOWER(dfs.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND LOWER(dfs.flag) LIKE '%call parent%'
  ),
  -- Check which snapshotted cubs had any interaction logged that same day
  interaction_check AS (
    SELECT
      s.snapshot_date,
      s.cub_id,
      BOOL_OR(
        i.date >= s.snapshot_date::TIMESTAMPTZ
        AND i.date < (s.snapshot_date + INTERVAL '1 day')::TIMESTAMPTZ
      ) AS was_called
    FROM snapshots s
    LEFT JOIN public.interactions i
      ON i.cub_id = s.cub_id
      AND i.date >= s.snapshot_date::TIMESTAMPTZ
      AND i.date < (s.snapshot_date + INTERVAL '1 day')::TIMESTAMPTZ
    GROUP BY s.snapshot_date, s.cub_id
  ),
  full_data AS (
    SELECT
      s.*,
      COALESCE(ic.was_called, false) AS was_called
    FROM snapshots s
    LEFT JOIN interaction_check ic
      ON ic.snapshot_date = s.snapshot_date AND ic.cub_id = s.cub_id
  ),
  -- Day-level summary
  daily_summary AS (
    SELECT
      snapshot_date,
      relationship_owner,
      COUNT(*)                                    AS total_due,
      COUNT(*) FILTER (WHERE was_called = true)   AS total_called,
      COUNT(*) FILTER (WHERE was_called = false)  AS total_not_called
    FROM full_data
    GROUP BY snapshot_date, relationship_owner
  )
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date',            ds.snapshot_date,
          'rep',             ds.relationship_owner,
          'total_due',       ds.total_due,
          'total_called',    ds.total_called,
          'total_not_called',ds.total_not_called,
          'call_rate_pct',   ROUND(
            100.0 * ds.total_called / NULLIF(ds.total_due, 0), 1
          )
        )
        ORDER BY ds.snapshot_date DESC, ds.relationship_owner
      )
      FROM daily_summary ds
    ),
    'detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date',             fd.snapshot_date,
          'rep',              fd.relationship_owner,
          'cub_id',           fd.cub_id,
          'cub_first_name',   fd.cub_first_name,
          'cub_last_name',    fd.cub_last_name,
          'parent_first_name',fd.parent_first_name,
          'parent_last_name', fd.parent_last_name,
          'parent_phone',     fd.parent_phone,
          'flag',             fd.flag,
          'sub_status',       fd.sub_status,
          'was_called',       fd.was_called
        )
        ORDER BY fd.snapshot_date DESC, fd.was_called ASC
      )
      FROM full_data fd
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_core_parent_accountability(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_core_parent_accountability(TEXT, DATE, DATE) TO authenticated, service_role;


-- ─── 4. get_actions_report ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_actions_report(
  p_rep_name  TEXT  DEFAULT NULL,
  p_start     DATE  DEFAULT CURRENT_DATE - INTERVAL '30 days',
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
  WITH filtered_actions AS (
    SELECT
      a.id,
      a.date,
      a.handled_by,
      a.cub_id,
      COALESCE(a.cub_first_name, mc.cub_first_name) AS cub_first_name,
      COALESCE(a.cub_last_name, mc.cub_last_name) AS cub_last_name,
      COALESCE(a.parent_first_name, mc.parent_first_name) AS parent_first_name,
      COALESCE(a.parent_last_name, mc.parent_last_name) AS parent_last_name,
      mc.parent_phone,
      a.action,
      a.action_status,
      a.overdue_status,
      a.action_deadline,
      a.type,
      a.purpose,
      a.created_at,
      a.updated_at
    FROM public.actions a
    LEFT JOIN public.master_cubs mc ON mc.cub_id = a.cub_id
    WHERE
      a.date::DATE BETWEEN p_start AND p_end
      AND (p_rep_name IS NULL OR TRIM(LOWER(a.handled_by)) = TRIM(LOWER(p_rep_name)))
  ),
  metrics AS (
    SELECT
      handled_by                                                       AS rep,
      COUNT(*)                                                         AS total_actions,
      COUNT(*) FILTER (WHERE action_status = 'Completed')             AS completed,
      COUNT(*) FILTER (WHERE action_status = 'Cancelled')             AS cancelled,
      COUNT(*) FILTER (WHERE action_status NOT IN ('Completed','Cancelled')) AS open_actions,
      COUNT(*) FILTER (WHERE overdue_status = 'Yes'
                            AND action_status NOT IN ('Completed','Cancelled')) AS overdue,
      ROUND(AVG(
        CASE WHEN action_status = 'Completed'
        THEN EXTRACT(EPOCH FROM (updated_at - created_at))/3600 END
      )::NUMERIC, 1) AS avg_hours_to_complete
    FROM filtered_actions
    GROUP BY handled_by
  )
  SELECT jsonb_build_object(
    'metrics', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'rep',                m.rep,
          'total_actions',      m.total_actions,
          'completed',          m.completed,
          'cancelled',          m.cancelled,
          'open_actions',       m.open_actions,
          'overdue',            m.overdue,
          'avg_hours_to_complete', m.avg_hours_to_complete
        )
        ORDER BY m.rep
      ) FROM metrics m
    ),
    'detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',                 fa.id,
          'date',               fa.date,
          'rep',                fa.handled_by,
          'cub_id',             fa.cub_id,
          'cub_first_name',     fa.cub_first_name,
          'cub_last_name',      fa.cub_last_name,
          'parent_first_name',  fa.parent_first_name,
          'parent_last_name',   fa.parent_last_name,
          'parent_phone',       fa.parent_phone,
          'action',             fa.action,
          'action_status',      fa.action_status,
          'overdue_status',     fa.overdue_status,
          'action_deadline',    fa.action_deadline,
          'type',               fa.type,
          'purpose',            fa.purpose
        )
        ORDER BY fa.date DESC
      ) FROM filtered_actions fa
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_actions_report(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_actions_report(TEXT, DATE, DATE) TO authenticated, service_role;


-- ─── 5. get_handover_report ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_handover_report(
  p_rep_name  TEXT  DEFAULT NULL,
  p_start     DATE  DEFAULT CURRENT_DATE - INTERVAL '30 days',
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
  WITH notes AS (
    SELECT
      h.id,
      h.date,
      h.summary,
      h.pending_issues,
      h.created_at,
      p.full_name AS rep
    FROM public.handover_notes h
    JOIN public.profiles p ON p.id = h.logged_by
    WHERE
      h.date::DATE BETWEEN p_start AND p_end
      AND (p_rep_name IS NULL OR TRIM(LOWER(p.full_name)) = TRIM(LOWER(p_rep_name)))
  ),
  metrics AS (
    SELECT
      rep,
      COUNT(*)                                           AS notes_submitted,
      COUNT(*) FILTER (WHERE pending_issues IS NOT NULL
                            AND TRIM(pending_issues) <> '') AS notes_with_pending_issues,
      MIN(date)                                          AS first_note_date,
      MAX(date)                                          AS last_note_date
    FROM notes
    GROUP BY rep
  )
  SELECT jsonb_build_object(
    'metrics', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'rep',                     m.rep,
          'notes_submitted',         m.notes_submitted,
          'notes_with_pending_issues', m.notes_with_pending_issues,
          'first_note_date',         m.first_note_date,
          'last_note_date',          m.last_note_date
        )
        ORDER BY m.rep
      ) FROM metrics m
    ),
    'detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',             n.id,
          'date',           n.date,
          'rep',            n.rep,
          'summary',        n.summary,
          'pending_issues', n.pending_issues
        )
        ORDER BY n.date DESC
      ) FROM notes n
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_handover_report(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_handover_report(TEXT, DATE, DATE) TO authenticated, service_role;


-- ─── 6. get_rc_attendance_report ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_rc_attendance_report(
  p_rep_name  TEXT  DEFAULT NULL,
  p_start     DATE  DEFAULT CURRENT_DATE - INTERVAL '30 days',
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
      rc.selected_session,
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
  attendance_in_range AS (
    SELECT
      rca.cub_id,
      rca.session,
      rca.attendance_date,
      rca.status
    FROM public.rc_attendance rca
    JOIN enrolled e ON e.cub_id = rca.cub_id
    WHERE rca.attendance_date BETWEEN p_start AND p_end
  ),
  session_summary AS (
    SELECT
      air.session,
      air.attendance_date,
      COUNT(*)                                              AS records_marked,
      COUNT(*) FILTER (WHERE air.status = 'Present')       AS present_count,
      COUNT(*) FILTER (WHERE air.status = 'Absent')        AS absent_count,
      COUNT(*) FILTER (WHERE air.status = 'Rescheduled')   AS rescheduled_count
    FROM attendance_in_range air
    GROUP BY air.session, air.attendance_date
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
          'session',          ss.session,
          'attendance_date',  ss.attendance_date,
          'records_marked',   ss.records_marked,
          'present_count',    ss.present_count,
          'absent_count',     ss.absent_count,
          'rescheduled_count',ss.rescheduled_count,
          'attendance_rate_pct', ROUND(
            100.0 * ss.present_count / NULLIF(ss.records_marked, 0), 1
          )
        )
        ORDER BY ss.attendance_date DESC, ss.session
      ) FROM session_summary ss
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


-- ─── 7. get_orientation_report ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_orientation_report(
  p_rep_name  TEXT  DEFAULT NULL,
  p_start     DATE  DEFAULT CURRENT_DATE - INTERVAL '30 days',
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
  WITH ori AS (
    SELECT
      o.*,
      c.relationship_owner,
      mc.cub_first_name,
      mc.cub_last_name,
      mc.parent_first_name,
      mc.parent_last_name,
      mc.parent_phone
    FROM public.orientation o
    JOIN public.master_cubs mc ON mc.cub_id = o.cub_id
    JOIN public.cubs c         ON c.cub_id  = o.cub_id
    WHERE
      (p_rep_name IS NULL OR TRIM(LOWER(c.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND c.is_archived = false
  ),
  -- Booked in the date range
  booked_in_range AS (
    SELECT * FROM ori
    WHERE booked_date BETWEEN p_start AND p_end
  ),
  -- Attended in the date range
  attended_in_range AS (
    SELECT * FROM ori
    WHERE attended_date BETWEEN p_start AND p_end
  ),
  funnel AS (
    SELECT
      relationship_owner AS rep,
      COUNT(*) FILTER (WHERE invited_status = 'Yes')                   AS invited,
      COUNT(*) FILTER (WHERE booked_date IS NOT NULL)                   AS booked_total,
      COUNT(*) FILTER (WHERE booked_date BETWEEN p_start AND p_end)    AS booked_in_period,
      COUNT(*) FILTER (WHERE attended_status = 'Present'
                            AND attended_date BETWEEN p_start AND p_end) AS attended_present,
      COUNT(*) FILTER (WHERE attended_status = 'Absent'
                            AND attended_date BETWEEN p_start AND p_end) AS attended_absent,
      COUNT(*) FILTER (WHERE attended_status = 'Rescheduled'
                            AND attended_date BETWEEN p_start AND p_end) AS attended_rescheduled,
      COUNT(*) FILTER (WHERE first_win_status = 'Yes')                 AS first_win_sent,
      COUNT(*) FILTER (WHERE rc_selected_status = 'Completed')         AS rc_selected,
      COUNT(*) FILTER (WHERE stage = 'Completed')                      AS fully_completed
    FROM ori
    GROUP BY relationship_owner
  )
  SELECT jsonb_build_object(
    'funnel', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'rep',                 f.rep,
          'invited',             f.invited,
          'booked_in_period',    f.booked_in_period,
          'attended_present',    f.attended_present,
          'attended_absent',     f.attended_absent,
          'attended_rescheduled',f.attended_rescheduled,
          'first_win_sent',      f.first_win_sent,
          'rc_selected',         f.rc_selected,
          'fully_completed',     f.fully_completed,
          'show_rate_pct', ROUND(
            100.0 * f.attended_present / NULLIF(f.booked_in_period, 0), 1
          )
        )
        ORDER BY f.rep
      ) FROM funnel f
    ),
    'booked_detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'cub_id',            b.cub_id,
          'cub_first_name',    b.cub_first_name,
          'cub_last_name',     b.cub_last_name,
          'parent_first_name', b.parent_first_name,
          'parent_last_name',  b.parent_last_name,
          'parent_phone',      b.parent_phone,
          'rep',               b.relationship_owner,
          'session',           b.session,
          'booked_date',       b.booked_date,
          'attended_date',     b.attended_date,
          'attended_status',   b.attended_status,
          'stage',             b.stage,
          'stage_status',      b.stage_status
        )
        ORDER BY b.booked_date DESC
      ) FROM booked_in_range b
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_orientation_report(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_orientation_report(TEXT, DATE, DATE) TO authenticated, service_role;


-- ─── 8. get_expiry_retention_report ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_expiry_retention_report(
  p_rep_name  TEXT  DEFAULT NULL,
  p_start     DATE  DEFAULT CURRENT_DATE - INTERVAL '90 days',
  p_end       DATE  DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_today  DATE := CURRENT_DATE;
BEGIN
  WITH cubs_base AS (
    SELECT
      c.cub_id,
      c.sub_status,
      c.sub_end_date,
      c.relationship_owner,
      c.orientation_stage,
      c.reading_circle_category,
      mc.cub_first_name,
      mc.cub_last_name,
      mc.parent_first_name,
      mc.parent_last_name,
      mc.parent_phone
    FROM public.cubs c
    JOIN public.master_cubs mc ON mc.cub_id = c.cub_id
    WHERE
      (p_rep_name IS NULL OR TRIM(LOWER(c.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND c.is_archived = false
  ),
  expiring_soon AS (
    SELECT * FROM cubs_base
    WHERE sub_status = 'almost expiring'
  ),
  expired_in_range AS (
    SELECT * FROM cubs_base
    WHERE
      sub_status = 'expired'
      AND sub_end_date BETWEEN p_start AND p_end
  ),
  retention_metrics AS (
    SELECT
      relationship_owner AS rep,
      COUNT(*)                                                          AS total_cubs,
      COUNT(*) FILTER (WHERE sub_status IN ('active','almost expiring')) AS active_count,
      COUNT(*) FILTER (WHERE sub_status = 'expired')                    AS expired_count,
      COUNT(*) FILTER (WHERE sub_status = 'almost expiring')            AS almost_expiring_count,
      COUNT(*) FILTER (WHERE sub_status = 'almost expiring'
                            AND sub_end_date <= v_today + 7)            AS expiring_7d,
      COUNT(*) FILTER (WHERE sub_status = 'almost expiring'
                            AND sub_end_date <= v_today + 30)           AS expiring_30d
    FROM cubs_base
    GROUP BY relationship_owner
  ),
  expired_with_journey AS (
    SELECT
      e.*,
      -- Did they attend orientation?
      COALESCE(o.attended_status = 'Present', false)  AS attended_orientation,
      -- Are they enrolled in RC?
      (rc.cub_id IS NOT NULL)                         AS enrolled_rc,
      -- RC attendance count
      COALESCE(rc.no_present, 0)                      AS rc_sessions_attended
    FROM expired_in_range e
    LEFT JOIN public.orientation o ON o.cub_id = e.cub_id
    LEFT JOIN public.reading_circle rc ON rc.cub_id = e.cub_id
  )
  SELECT jsonb_build_object(
    'retention_metrics', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'rep',                   rm.rep,
          'total_cubs',            rm.total_cubs,
          'active_count',          rm.active_count,
          'expired_count',         rm.expired_count,
          'almost_expiring_count', rm.almost_expiring_count,
          'expiring_7d',           rm.expiring_7d,
          'expiring_30d',          rm.expiring_30d,
          'retention_rate_pct', ROUND(
            100.0 * rm.active_count / NULLIF(rm.total_cubs, 0), 1
          )
        )
        ORDER BY rm.rep
      ) FROM retention_metrics rm
    ),
    'expiring_soon_detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'cub_id',            es.cub_id,
          'cub_first_name',    es.cub_first_name,
          'cub_last_name',     es.cub_last_name,
          'parent_first_name', es.parent_first_name,
          'parent_last_name',  es.parent_last_name,
          'parent_phone',      es.parent_phone,
          'rep',               es.relationship_owner,
          'sub_end_date',      es.sub_end_date,
          'sub_status',        es.sub_status,
          'orientation_stage', es.orientation_stage,
          'rc_category',       es.reading_circle_category
        )
        ORDER BY es.sub_end_date ASC
      ) FROM expiring_soon es
    ),
    'expired_detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'cub_id',                 ej.cub_id,
          'cub_first_name',         ej.cub_first_name,
          'cub_last_name',          ej.cub_last_name,
          'parent_first_name',      ej.parent_first_name,
          'parent_last_name',       ej.parent_last_name,
          'parent_phone',           ej.parent_phone,
          'rep',                    ej.relationship_owner,
          'sub_end_date',           ej.sub_end_date,
          'orientation_stage',      ej.orientation_stage,
          'attended_orientation',   ej.attended_orientation,
          'enrolled_rc',            ej.enrolled_rc,
          'rc_sessions_attended',   ej.rc_sessions_attended
        )
        ORDER BY ej.sub_end_date DESC
      ) FROM expired_with_journey ej
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_expiry_retention_report(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_expiry_retention_report(TEXT, DATE, DATE) TO authenticated, service_role;


-- ─── 9. get_flags_report ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_flags_report(
  p_rep_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_today  DATE := CURRENT_DATE;
  v_7d_ago DATE := CURRENT_DATE - 7;
BEGIN
  WITH flagged_cubs AS (
    SELECT
      c.cub_id,
      c.flag,
      c.sub_status,
      c.relationship_owner,
      c.last_engagement_activity,
      mc.cub_first_name,
      mc.cub_last_name,
      mc.parent_first_name,
      mc.parent_last_name,
      mc.parent_phone
    FROM public.cubs c
    JOIN public.master_cubs mc ON mc.cub_id = c.cub_id
    WHERE
      c.flag IS NOT NULL AND TRIM(c.flag) <> ''
      AND (p_rep_name IS NULL OR TRIM(LOWER(c.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND c.is_archived = false
  ),
  flag_summary AS (
    SELECT
      flag,
      relationship_owner AS rep,
      COUNT(*)                                                   AS total,
      COUNT(*) FILTER (WHERE last_engagement_activity >= v_7d_ago::TIMESTAMPTZ) AS engaged_last_7d,
      COUNT(*) FILTER (WHERE last_engagement_activity < v_7d_ago::TIMESTAMPTZ
                            OR last_engagement_activity IS NULL) AS not_engaged_7d
    FROM flagged_cubs
    GROUP BY flag, relationship_owner
  ),
  -- Historical trend: how many cubs per day had this flag in the past 30 days
  historical_trend AS (
    SELECT
      snapshot_date,
      flag,
      relationship_owner AS rep,
      COUNT(*) AS flagged_count
    FROM public.daily_flag_snapshots
    WHERE
      snapshot_date >= v_today - 30
      AND (p_rep_name IS NULL OR TRIM(LOWER(relationship_owner)) = TRIM(LOWER(p_rep_name)))
    GROUP BY snapshot_date, flag, relationship_owner
  )
  SELECT jsonb_build_object(
    'current_summary', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'flag',           fs.flag,
          'rep',            fs.rep,
          'total',          fs.total,
          'engaged_last_7d',fs.engaged_last_7d,
          'not_engaged_7d', fs.not_engaged_7d
        )
        ORDER BY fs.flag, fs.rep
      ) FROM flag_summary fs
    ),
    'current_detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'cub_id',            fc.cub_id,
          'cub_first_name',    fc.cub_first_name,
          'cub_last_name',     fc.cub_last_name,
          'parent_first_name', fc.parent_first_name,
          'parent_last_name',  fc.parent_last_name,
          'parent_phone',      fc.parent_phone,
          'rep',               fc.relationship_owner,
          'flag',              fc.flag,
          'sub_status',        fc.sub_status,
          'last_engagement',   fc.last_engagement_activity
        )
        ORDER BY fc.flag, fc.cub_last_name
      ) FROM flagged_cubs fc
    ),
    'historical_trend', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date',          ht.snapshot_date,
          'flag',          ht.flag,
          'rep',           ht.rep,
          'flagged_count', ht.flagged_count
        )
        ORDER BY ht.snapshot_date DESC, ht.flag
      ) FROM historical_trend ht
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_flags_report(TEXT) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_flags_report(TEXT) TO authenticated, service_role;
