-- Migration: 20261022050000_reports_cleanup_and_gen_comm_focus.sql
-- 1. Add message_sent to interactions
-- 2. Updated get_daily_activity_report: Support date range, message_sent, ensure all reps appear with 0s
-- 3. Updated get_call_parents_report: Ensure today's snapshot exists if querying today, standardized date, called/not called cubs & messages sent breakdown
-- 4. Updated get_orientation_report: Focus exclusively on Gen. Comm cohort, show completed vs left (not completed), in progress vs not started, show rate
-- 5. Updated get_expiry_retention_report: Focus exclusively on Gen. Comm cohort

-- ─── 1. Add message_sent column ───────────────────────────────
ALTER TABLE public.interactions ADD COLUMN IF NOT EXISTS message_sent TEXT DEFAULT NULL;

-- ─── 2. get_daily_activity_report ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_activity_report(
  p_rep_name  TEXT    DEFAULT NULL,
  p_date      DATE    DEFAULT CURRENT_DATE,
  p_end_date  DATE    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start TIMESTAMPTZ := p_date::TIMESTAMPTZ;
  v_end   TIMESTAMPTZ := (COALESCE(p_end_date, p_date) + INTERVAL '1 day')::TIMESTAMPTZ;
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
      i.date,
      i.message_sent
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
      COUNT(*) FILTER (
        WHERE LOWER(TRIM(type)) IN ('message', 'whatsapp', 'sms', 'email')
           OR (message_sent IS NOT NULL AND TRIM(message_sent) <> '')
      ) AS messages_sent,
      COUNT(*)                                                                                  AS total_interactions
    FROM filtered_interactions
    GROUP BY handled_by
  ),
  all_reps AS (
    SELECT DISTINCT relationship_owner AS rep
    FROM public.cubs
    WHERE relationship_owner IS NOT NULL 
      AND TRIM(relationship_owner) <> ''
      AND (p_rep_name IS NULL OR TRIM(LOWER(relationship_owner)) = TRIM(LOWER(p_rep_name)))
    UNION
    SELECT DISTINCT handled_by AS rep
    FROM filtered_interactions
    WHERE handled_by IS NOT NULL AND TRIM(handled_by) <> ''
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'rep',                    r.rep,
      'calls_made',             COALESCE(im.calls_made, 0),
      'calls_successful',       COALESCE(im.calls_successful, 0),
      'calls_unsuccessful',     COALESCE(im.calls_unsuccessful, 0),
      'messages_sent',          COALESCE(im.messages_sent, 0),
      'total_interactions',     COALESCE(im.total_interactions, 0)
    )
    ORDER BY r.rep
  )
  INTO v_result
  FROM all_reps r
  LEFT JOIN interaction_metrics im ON TRIM(LOWER(im.handled_by)) = TRIM(LOWER(r.rep));

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_daily_activity_report(TEXT, DATE, DATE) TO authenticated, service_role;

-- ─── 3. get_call_parents_report ───────────────────────────────
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
  IF p_end >= CURRENT_DATE THEN
    PERFORM public.snapshot_daily_flags(CURRENT_DATE);
  END IF;

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
  interaction_activities AS (
    SELECT
      i.date,
      i.handled_by,
      i.cub_id,
      i.status,
      i.type,
      i.message_sent,
      COALESCE(
        NULLIF(TRIM(mc.parent_phone), ''),
        LOWER(TRIM(i.parent_first_name)) || ' ' || LOWER(TRIM(i.parent_last_name))
      ) AS family_key
    FROM public.interactions i
    LEFT JOIN public.master_cubs mc ON mc.cub_id = i.cub_id
    WHERE
      i.date >= p_start::TIMESTAMPTZ
      AND i.date < (p_end + INTERVAL '1 day')::TIMESTAMPTZ
  ),
  family_interactions AS (
    SELECT
      family_key,
      date::DATE AS interaction_date,
      bool_or(LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')) AS was_called,
      bool_or(LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone') AND LOWER(TRIM(status)) = 'reached') AS was_reached,
      bool_or(
        LOWER(TRIM(type)) IN ('message', 'whatsapp', 'sms', 'email')
        OR (message_sent IS NOT NULL AND TRIM(message_sent) <> '')
      ) AS was_messaged
    FROM interaction_activities
    GROUP BY family_key, date::DATE
  ),
  family_cubs AS (
    SELECT
      s.snapshot_date,
      s.relationship_owner,
      s.family_key,
      COUNT(DISTINCT s.cub_id) AS cubs_count,
      COALESCE(fi.was_called, false) AS was_called,
      COALESCE(fi.was_reached, false) AS was_reached,
      COALESCE(fi.was_messaged, false) AS was_messaged,
      CASE
        WHEN fi.was_reached = true THEN 'Reached'
        WHEN fi.was_called = true THEN 'Not Reached'
        ELSE 'Not Called'
      END AS call_status
    FROM snap s
    LEFT JOIN family_interactions fi
      ON fi.family_key = s.family_key
      AND fi.interaction_date = s.snapshot_date
    GROUP BY
      s.snapshot_date, s.relationship_owner, s.family_key,
      fi.was_called, fi.was_reached, fi.was_messaged
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
      COUNT(*) FILTER (WHERE was_called = true AND was_reached = false AND was_messaged = true) AS messages_sent,
      COALESCE(SUM(cubs_count) FILTER (WHERE was_called = true), 0)   AS cubs_covered,
      COALESCE(SUM(cubs_count) FILTER (WHERE was_called = false), 0)  AS cubs_not_called,
      COALESCE(SUM(cubs_count) FILTER (WHERE was_called = true AND was_reached = true), 0) AS cubs_reached,
      COALESCE(SUM(cubs_count) FILTER (WHERE was_called = true AND was_reached = false), 0) AS cubs_not_reached,
      ROUND(100.0 * COUNT(*) FILTER (WHERE was_called = true) / NULLIF(COUNT(*), 0), 1) AS call_rate_pct,
      COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE was_called = true AND was_reached = true) / NULLIF(COUNT(*) FILTER (WHERE was_called = true), 0), 1), 0.0) AS success_rate_pct
    FROM family_cubs
    GROUP BY snapshot_date, relationship_owner
  )
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date',                 to_char(ds.snapshot_date, 'YYYY-MM-DD'),
          'rep',                  ds.relationship_owner,
          'total_families_due',   ds.total_families_due,
          'total_cubs_due',       ds.total_cubs_due,
          'families_called',      ds.families_called,
          'families_not_called',  ds.families_not_called,
          'families_reached',     ds.families_reached,
          'families_not_reached', ds.families_not_reached,
          'messages_sent',        ds.messages_sent,
          'cubs_covered',         ds.cubs_covered,
          'cubs_not_called',      ds.cubs_not_called,
          'cubs_reached',         ds.cubs_reached,
          'cubs_not_reached',     ds.cubs_not_reached,
          'call_rate_pct',        COALESCE(ds.call_rate_pct, 0.0),
          'success_rate_pct',     COALESCE(ds.success_rate_pct, 0.0)
        )
        ORDER BY ds.snapshot_date DESC, ds.relationship_owner
      ) FROM daily_summary ds
    ),
    'detail', '[]'::jsonb
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{"summary":[],"detail":[]}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_call_parents_report(TEXT, DATE, DATE) TO authenticated, service_role;

-- ─── 4. get_orientation_report ────────────────────────────────
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
  WITH gen_comm_cubs AS (
    SELECT
      c.cub_id,
      c.relationship_owner AS rep,
      c.date_onboarded,
      c.orientation_stage,
      o.invited_status,
      o.booked_status,
      o.booked_date,
      o.session,
      o.attended_status,
      o.attended_date,
      o.first_win_status,
      o.rc_selected_status,
      o.completion_date,
      o.stage AS o_stage,
      mc.cub_first_name,
      mc.cub_last_name,
      mc.parent_first_name,
      mc.parent_last_name,
      mc.parent_phone,
      (o.completion_date IS NOT NULL OR o.stage = 'Completed' OR c.orientation_stage = 'Completed') AS is_completed,
      CASE
        WHEN (o.completion_date IS NOT NULL OR o.stage = 'Completed' OR c.orientation_stage = 'Completed') THEN 'Completed'
        WHEN (
          o.invited_status = 'Yes' 
          OR o.booked_status IS NOT NULL 
          OR o.attended_status IS NOT NULL 
          OR COALESCE(o.stage, c.orientation_stage, 'New') NOT IN ('New', 'Awaiting Invitation', '')
        ) THEN 'In Progress'
        ELSE 'Not Started'
      END AS progress_status
    FROM public.cubs c
    JOIN public.master_cubs mc ON mc.cub_id = c.cub_id
    LEFT JOIN public.orientation o ON o.cub_id = c.cub_id
    WHERE
      c.segment = 'Gen. Comm'
      AND c.is_archived = false
      AND (p_rep_name IS NULL OR TRIM(LOWER(c.relationship_owner)) = TRIM(LOWER(p_rep_name)))
  ),
  rep_summary AS (
    SELECT
      rep,
      COUNT(*)                                                               AS total_gen_comm,
      COUNT(*) FILTER (WHERE is_completed = true)                           AS completed,
      COUNT(*) FILTER (WHERE is_completed = false)                          AS not_completed,
      COUNT(*) FILTER (WHERE progress_status = 'In Progress')                AS in_progress,
      COUNT(*) FILTER (WHERE progress_status = 'Not Started')                AS not_started,
      COUNT(*) FILTER (WHERE attended_status = 'Present')                   AS attended_present,
      COUNT(*) FILTER (WHERE booked_status = 'Completed' OR booked_date IS NOT NULL OR attended_status IS NOT NULL) AS booked_count,
      ROUND(
        100.0 * COUNT(*) FILTER (WHERE attended_status = 'Present') / 
        NULLIF(COUNT(*) FILTER (WHERE booked_status = 'Completed' OR booked_date IS NOT NULL OR attended_status IS NOT NULL), 0),
        1
      ) AS show_rate_pct
    FROM gen_comm_cubs
    GROUP BY rep
  )
  SELECT jsonb_build_object(
    'funnel', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'rep',               rs.rep,
          'total_gen_comm',    rs.total_gen_comm,
          'completed',         rs.completed,
          'not_completed',     rs.not_completed,
          'in_progress',       rs.in_progress,
          'not_started',       rs.not_started,
          'attended_present',  rs.attended_present,
          'booked_count',      rs.booked_count,
          'show_rate_pct',     COALESCE(rs.show_rate_pct, 0.0)
        )
        ORDER BY rs.rep
      ) FROM rep_summary rs
    ),
    'not_completed_detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'cub_id',             gc.cub_id,
          'cub_first_name',     gc.cub_first_name,
          'cub_last_name',      gc.cub_last_name,
          'parent_first_name',  gc.parent_first_name,
          'parent_last_name',   gc.parent_last_name,
          'parent_phone',       gc.parent_phone,
          'rep',                gc.rep,
          'stage',              COALESCE(gc.o_stage, gc.orientation_stage, 'New'),
          'session',            gc.session,
          'booked_date',        to_char(gc.booked_date, 'YYYY-MM-DD'),
          'date_onboarded',     to_char(gc.date_onboarded, 'YYYY-MM-DD'),
          'attended_status',    gc.attended_status,
          'progress_status',    gc.progress_status
        )
        ORDER BY gc.date_onboarded DESC NULLS LAST, gc.cub_first_name
      ) FROM gen_comm_cubs gc
      WHERE gc.is_completed = false
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{"funnel":[],"not_completed_detail":[]}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orientation_report(TEXT, DATE, DATE) TO authenticated, service_role;

-- ─── 5. get_expiry_retention_report ───────────────────────────
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
      c.segment = 'Gen. Comm'
      AND (p_rep_name IS NULL OR TRIM(LOWER(c.relationship_owner)) = TRIM(LOWER(p_rep_name)))
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
      COALESCE(o.attended_status = 'Present', false)  AS attended_orientation,
      (rc.cub_id IS NOT NULL)                         AS enrolled_rc,
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
          'cub_id',               es.cub_id,
          'cub_first_name',       es.cub_first_name,
          'cub_last_name',        es.cub_last_name,
          'parent_first_name',    es.parent_first_name,
          'parent_last_name',     es.parent_last_name,
          'parent_phone',         es.parent_phone,
          'rep',                  es.relationship_owner,
          'sub_end_date',         to_char(es.sub_end_date, 'YYYY-MM-DD'),
          'orientation_stage',    es.orientation_stage,
          'attended_orientation', false,
          'enrolled_rc',          false,
          'rc_sessions_attended', 0
        )
        ORDER BY es.sub_end_date ASC NULLS LAST
      ) FROM expiring_soon es
    ),
    'expired_detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'cub_id',               ew.cub_id,
          'cub_first_name',       ew.cub_first_name,
          'cub_last_name',        ew.cub_last_name,
          'parent_first_name',    ew.parent_first_name,
          'parent_last_name',     ew.parent_last_name,
          'parent_phone',         ew.parent_phone,
          'rep',                  ew.relationship_owner,
          'sub_end_date',         to_char(ew.sub_end_date, 'YYYY-MM-DD'),
          'orientation_stage',    ew.orientation_stage,
          'attended_orientation', ew.attended_orientation,
          'enrolled_rc',          ew.enrolled_rc,
          'rc_sessions_attended', ew.rc_sessions_attended
        )
        ORDER BY ew.sub_end_date DESC NULLS LAST
      ) FROM expired_with_journey ew
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{"retention_metrics":[],"expiring_soon_detail":[],"expired_detail":[]}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_expiry_retention_report(TEXT, DATE, DATE) TO authenticated, service_role;
