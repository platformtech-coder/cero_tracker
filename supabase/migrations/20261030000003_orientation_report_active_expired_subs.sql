-- ─── Orientation Report: Active & Expired Subs breakdown ─────────
-- Updates get_orientation_report to return total_active, total_expired,
-- completed_active, completed_expired, not_completed_active, not_completed_expired,
-- and includes sub_status in not_completed_detail.

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
      c.sub_status,
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
        ELSE 'Not Completed'
      END AS progress_status,
      (lower(trim(COALESCE(c.sub_status, ''))) IN ('active', 'almost expiring')) AS is_active_sub,
      (lower(trim(COALESCE(c.sub_status, ''))) = 'expired') AS is_expired_sub
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
      COUNT(*)                                                                                     AS total_gen_comm,
      COUNT(*) FILTER (WHERE is_active_sub = true)                                                 AS total_active,
      COUNT(*) FILTER (WHERE is_expired_sub = true)                                                AS total_expired,
      COUNT(*) FILTER (WHERE is_completed = true)                                                  AS completed,
      COUNT(*) FILTER (WHERE is_completed = true AND is_active_sub = true)                          AS completed_active,
      COUNT(*) FILTER (WHERE is_completed = true AND is_expired_sub = true)                         AS completed_expired,
      COUNT(*) FILTER (WHERE is_completed = false)                                                 AS not_completed,
      COUNT(*) FILTER (WHERE is_completed = false AND is_active_sub = true)                         AS not_completed_active,
      COUNT(*) FILTER (WHERE is_completed = false AND is_expired_sub = true)                        AS not_completed_expired,
      COUNT(*) FILTER (WHERE attended_status = 'Present')                                          AS attended_present,
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
          'rep',                   rs.rep,
          'total_gen_comm',        rs.total_gen_comm,
          'total_active',          rs.total_active,
          'total_expired',         rs.total_expired,
          'completed',             rs.completed,
          'completed_active',      rs.completed_active,
          'completed_expired',     rs.completed_expired,
          'not_completed',         rs.not_completed,
          'not_completed_active',  rs.not_completed_active,
          'not_completed_expired', rs.not_completed_expired,
          'attended_present',      rs.attended_present,
          'booked_count',          rs.booked_count,
          'show_rate_pct',         COALESCE(rs.show_rate_pct, 0.0)
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
          'progress_status',    gc.progress_status,
          'sub_status',         gc.sub_status
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
