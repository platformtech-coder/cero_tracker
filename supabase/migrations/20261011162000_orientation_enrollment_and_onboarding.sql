-- Migration: 20261011162000_orientation_enrollment_and_onboarding.sql
-- Description:
-- 1. Add date_onboarded to master_cubs to preserve original Column A date.
-- 2. Add performance indexes for cohort queries and date filtering.
-- 3. Create enroll_gen_comm_orientation() for idempotent automatic enrollment.
-- 4. Create get_orientation_scorecard_metrics() for canonical scorecard aggregation.

-- 1. Add date_onboarded to master_cubs
ALTER TABLE public.master_cubs 
  ADD COLUMN IF NOT EXISTS date_onboarded DATE;

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_master_cubs_date_onboarded 
  ON public.master_cubs(date_onboarded);

CREATE INDEX IF NOT EXISTS idx_cubs_date_onboarded_segment 
  ON public.cubs(date_onboarded, segment);

CREATE INDEX IF NOT EXISTS idx_cubs_relationship_owner 
  ON public.cubs(relationship_owner);

CREATE INDEX IF NOT EXISTS idx_orientation_completion_date 
  ON public.orientation(completion_date);

CREATE INDEX IF NOT EXISTS idx_reading_circle_cub_session 
  ON public.reading_circle(cub_id, selected_session);

-- 3. Idempotent General Community Orientation enrollment function
CREATE OR REPLACE FUNCTION public.enroll_gen_comm_orientation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enrolled_count integer := 0;
BEGIN
  WITH newly_enrolled AS (
    INSERT INTO public.orientation (
      cub_id,
      session,
      stage,
      stage_status,
      next_stage,
      invited_status,
      booked_status,
      attended_status,
      version_ts,
      created_at,
      updated_at
    )
    SELECT 
      mc.cub_id,
      'Tuesday' AS session,
      NULL AS stage,
      NULL AS stage_status,
      'Invited' AS next_stage,
      'No' AS invited_status,
      NULL AS booked_status,
      NULL AS attended_status,
      0 AS version_ts,
      NOW() AS created_at,
      NOW() AS updated_at
    FROM public.master_cubs mc
    JOIN public.cubs c ON c.cub_id = mc.cub_id
    WHERE c.segment = 'Gen. Comm'
      AND NOT EXISTS (
        SELECT 1 FROM public.orientation o WHERE o.cub_id = mc.cub_id
      )
    ON CONFLICT (cub_id) DO NOTHING
    RETURNING cub_id
  )
  SELECT count(*) INTO v_enrolled_count FROM newly_enrolled;

  RETURN v_enrolled_count;
END;
$$;

-- 4. Canonical scorecard and cohort calculation function
CREATE OR REPLACE FUNCTION public.get_orientation_scorecard_metrics(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_rep TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_eligible integer := 0;
  v_missing_date_count integer := 0;
  v_window_elapsed integer := 0;
  v_in_window integer := 0;
  v_completed_within_7d integer := 0;
  v_completed_late integer := 0;
  v_missed_target integer := 0;
  v_rate numeric := 0.0;
  
  v_awaiting_invitation integer := 0;
  v_invited_not_booked integer := 0;
  v_booked_confirmed integer := 0;
  v_attended integer := 0;
  v_completed integer := 0;
  v_pending_rc integer := 0;
BEGIN
  -- Aggregate metrics for General Community cohort
  WITH cohort AS (
    SELECT 
      c.cub_id,
      c.date_onboarded,
      c.relationship_owner,
      o.invited_status,
      o.booked_status,
      o.attended_status,
      o.stage AS orientation_stage,
      o.completion_date,
      rc.selected_session,
      CASE 
        WHEN c.date_onboarded IS NULL THEN 'missing_date'
        WHEN (c.date_onboarded + INTERVAL '7 days')::date <= CURRENT_DATE THEN 'window_elapsed'
        ELSE 'in_window'
      END AS window_status,
      CASE
        WHEN o.completion_date IS NOT NULL AND c.date_onboarded IS NOT NULL AND o.completion_date <= (c.date_onboarded + INTERVAL '7 days')::date THEN 'ontime'
        WHEN o.completion_date IS NOT NULL AND c.date_onboarded IS NOT NULL AND o.completion_date > (c.date_onboarded + INTERVAL '7 days')::date THEN 'late'
        ELSE 'uncompleted'
      END AS completion_status,
      CASE
        WHEN rc.selected_session IS NOT NULL AND TRIM(rc.selected_session) != '' THEN true
        ELSE false
      END AS has_rc
    FROM public.cubs c
    LEFT JOIN public.orientation o ON o.cub_id = c.cub_id
    LEFT JOIN public.reading_circle rc ON rc.cub_id = c.cub_id
    WHERE c.segment = 'Gen. Comm'
      AND (p_rep IS NULL OR p_rep = 'All Reps' OR c.relationship_owner = p_rep)
      AND (
        p_start_date IS NULL 
        OR (c.date_onboarded IS NOT NULL AND c.date_onboarded >= p_start_date)
      )
      AND (
        p_end_date IS NULL 
        OR (c.date_onboarded IS NOT NULL AND c.date_onboarded <= p_end_date)
      )
  )
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE window_status = 'missing_date'),
    COUNT(*) FILTER (WHERE window_status = 'window_elapsed'),
    COUNT(*) FILTER (WHERE window_status = 'in_window' AND completion_status = 'uncompleted'),
    COUNT(*) FILTER (WHERE completion_status = 'ontime'),
    COUNT(*) FILTER (WHERE completion_status = 'late'),
    COUNT(*) FILTER (WHERE window_status = 'window_elapsed' AND completion_status != 'ontime'),
    COUNT(*) FILTER (WHERE invited_status = 'No' OR invited_status IS NULL),
    COUNT(*) FILTER (WHERE invited_status = 'Yes' AND (booked_status IS NULL OR booked_status = 'Pending')),
    COUNT(*) FILTER (WHERE booked_status = 'Completed'),
    COUNT(*) FILTER (WHERE attended_status = 'Present'),
    COUNT(*) FILTER (WHERE completion_date IS NOT NULL OR orientation_stage = 'Completed'),
    COUNT(*) FILTER (WHERE NOT has_rc)
  INTO 
    v_total_eligible,
    v_missing_date_count,
    v_window_elapsed,
    v_in_window,
    v_completed_within_7d,
    v_completed_late,
    v_missed_target,
    v_awaiting_invitation,
    v_invited_not_booked,
    v_booked_confirmed,
    v_attended,
    v_completed,
    v_pending_rc
  FROM cohort;

  IF v_window_elapsed > 0 THEN
    v_rate := ROUND((v_completed_within_7d::numeric / v_window_elapsed::numeric) * 100, 1);
  ELSE
    v_rate := 0.0;
  END IF;

  RETURN jsonb_build_object(
    'total_eligible', v_total_eligible,
    'missing_onboarding_date', v_missing_date_count,
    'window_elapsed', v_window_elapsed,
    'in_window', v_in_window,
    'completed_within_7d', v_completed_within_7d,
    'completed_late', v_completed_late,
    'missed_target', v_missed_target,
    'completion_rate', v_rate,
    'awaiting_invitation', v_awaiting_invitation,
    'invited_not_booked', v_invited_not_booked,
    'booked_confirmed', v_booked_confirmed,
    'attended', v_attended,
    'completed', v_completed,
    'pending_rc', v_pending_rc
  );
END;
$$;
