-- Migration: 20261012120000_orientation_rc_integrity.sql
-- Description:
-- 1. Fix orientation.stage CHECK — add 'Invited' which was missing
-- 2. Fix orientation.session to be nullable (cubs enrolled before booking shouldn't have 'Tuesday' hardcoded)
-- 3. Fix enroll_gen_comm_orientation() — correct initial stage, invited_status, next_stage, session=NULL
-- 4. Fix confirm_orientation_signup() — use correct upcoming session date for booked_date
-- 5. Upgrade confirm_rc_signup() — atomically sync orientation stage when RC is assigned
-- 6. Add missing performance indexes on orientation.created_at and reading_circle.created_at

-- ─── 1. Fix orientation.stage CHECK constraint (add 'Invited') ──
ALTER TABLE public.orientation DROP CONSTRAINT IF EXISTS orientation_stage_check;
ALTER TABLE public.orientation ADD CONSTRAINT orientation_stage_check
  CHECK (stage IN ('Invited', 'Booked', 'Attended', 'RC Selected', 'First Win Sent', 'Completed'));

-- ─── 2. Make orientation.session nullable ──────────────────────
-- Cubs get enrolled before they book, so session should be NULL until booked
ALTER TABLE public.orientation ALTER COLUMN session DROP NOT NULL;
ALTER TABLE public.orientation ALTER COLUMN session SET DEFAULT NULL;

-- Backfill existing rows where stage = 'Invited' (not yet booked) to NULL session
-- This is safe: if booked_status IS NULL and attended_status IS NULL, no real session was ever selected
UPDATE public.orientation
SET session = NULL
WHERE booked_status IS NULL
  AND attended_status IS NULL
  AND stage IS NULL;

-- ─── 3. Fix enroll_gen_comm_orientation() ─────────────────────
CREATE OR REPLACE FUNCTION public.enroll_gen_comm_orientation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_enrolled_count integer := 0;
BEGIN
  -- Insert one orientation row per Gen. Comm cub not yet enrolled.
  -- Initial state: Invited (baseline), no session until they book.
  WITH newly_enrolled AS (
    INSERT INTO public.orientation (
      cub_id,
      session,         -- NULL: they haven't selected a session yet
      stage,           -- 'Invited': baseline stage for all Gen. Comm cubs
      stage_status,    -- 'Completed': invitation is done
      next_stage,      -- 'Booked': what they must do next
      invited_status,  -- 'Yes': they've been automatically invited
      booked_status,   -- NULL: not booked yet
      attended_status, -- NULL: not attended yet
      version_ts,
      created_at,
      updated_at
    )
    SELECT
      mc.cub_id,
      NULL              AS session,
      'Invited'         AS stage,
      'Completed'       AS stage_status,
      'Booked'          AS next_stage,
      'Yes'             AS invited_status,
      NULL              AS booked_status,
      NULL              AS attended_status,
      0                 AS version_ts,
      NOW()             AS created_at,
      NOW()             AS updated_at
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

  -- Propagate initial stage to cubs table for directory visibility
  UPDATE public.cubs
  SET
    orientation_stage        = 'Invited',
    orientation_stage_status = 'Completed',
    orientation_next_stage   = 'Booked'
  WHERE segment = 'Gen. Comm'
    AND (orientation_stage IS NULL OR orientation_stage = '');

  RETURN v_enrolled_count;
END;
$$;

-- ─── 4. Fix confirm_orientation_signup() — correct booked_date ─
-- Uses next occurrence of the selected session day, not CURRENT_DATE
CREATE OR REPLACE FUNCTION public.confirm_orientation_signup(
  p_pending_id BIGINT,
  p_cub_id TEXT,
  p_session TEXT,
  p_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session_day TEXT;
  v_today DATE;
  v_booked_date DATE;
  v_day_offset INT;
BEGIN
  -- Extract day name from full session string (e.g. "Tuesday 7:00 pm" → "Tuesday")
  v_session_day := split_part(trim(p_session), ' ', 1);
  IF v_session_day = '' THEN
    v_session_day := p_session;
  END IF;
  v_today := CURRENT_DATE;

  -- Compute the nearest upcoming date for the session day
  -- Day of week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  v_day_offset := CASE lower(v_session_day)
    WHEN 'sunday'    THEN 0
    WHEN 'monday'    THEN 1
    WHEN 'tuesday'   THEN 2
    WHEN 'wednesday' THEN 3
    WHEN 'thursday'  THEN 4
    WHEN 'friday'    THEN 5
    WHEN 'saturday'  THEN 6
    ELSE NULL
  END;

  IF v_day_offset IS NOT NULL THEN
    -- Days until next occurrence (0 = today/this week, 1-6 = later this week or next week)
    v_booked_date := v_today + ((v_day_offset - EXTRACT(DOW FROM v_today)::INT + 7) % 7) * INTERVAL '1 day';
  ELSE
    v_booked_date := v_today;
  END IF;

  -- 1. Mark pending signup as confirmed
  UPDATE public.pending_signups
  SET status       = 'Confirmed',
      matched_cub_id = p_cub_id,
      selected_session = p_session,
      confirmed_by = p_user_id,
      confirmed_at = now()
  WHERE id = p_pending_id;

  -- 2. Upsert orientation — only update session/stage if not already further along
  INSERT INTO public.orientation (
    cub_id, session, stage, stage_status, next_stage,
    invited_status, booked_date, booked_status
  ) VALUES (
    p_cub_id, v_session_day, 'Booked', 'Completed', 'Attended',
    'Yes', v_booked_date, 'Completed'
  )
  ON CONFLICT (cub_id) DO UPDATE SET
    session      = EXCLUDED.session,
    stage        = CASE
                     WHEN public.orientation.stage IN ('Attended', 'RC Selected', 'Completed')
                     THEN public.orientation.stage  -- don't downgrade advanced cubs
                     ELSE EXCLUDED.stage
                   END,
    stage_status = CASE
                     WHEN public.orientation.stage IN ('Attended', 'RC Selected', 'Completed')
                     THEN public.orientation.stage_status
                     ELSE EXCLUDED.stage_status
                   END,
    next_stage   = CASE
                     WHEN public.orientation.stage IN ('Attended', 'RC Selected', 'Completed')
                     THEN public.orientation.next_stage
                     ELSE EXCLUDED.next_stage
                   END,
    invited_status = 'Yes',
    booked_date  = COALESCE(public.orientation.booked_date, EXCLUDED.booked_date),
    booked_status = CASE
                      WHEN public.orientation.booked_status = 'Completed'
                      THEN 'Completed'
                      ELSE EXCLUDED.booked_status
                    END;

  -- 3. Propagate to cubs table (only if not already further along)
  UPDATE public.cubs
  SET orientation_stage        = 'Booked',
      orientation_stage_status = 'Completed',
      orientation_next_stage   = 'Attended',
      orientation_completion_date = NULL
  WHERE cub_id = p_cub_id
    AND (orientation_stage IS NULL OR orientation_stage NOT IN ('Attended', 'RC Selected', 'Completed'));

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 5. Upgrade confirm_rc_signup() — sync orientation atomically ─
CREATE OR REPLACE FUNCTION public.confirm_rc_signup(
  p_pending_id BIGINT,
  p_cub_id TEXT,
  p_session TEXT,
  p_category TEXT,
  p_grade TEXT,
  p_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orientation public.orientation%ROWTYPE;
  v_new_stage TEXT;
  v_new_stage_status TEXT;
  v_new_next_stage TEXT;
  v_completion_date DATE;
  v_rc_date DATE;
  v_day_offset INT;
BEGIN
  -- 1. Mark pending signup as confirmed
  UPDATE public.pending_signups
  SET status = 'Confirmed',
      matched_cub_id = p_cub_id,
      selected_session = p_session,
      grade = p_grade,
      confirmed_by = p_user_id,
      confirmed_at = now()
  WHERE id = p_pending_id;

  -- 2. Upsert reading_circle
  INSERT INTO public.reading_circle (cub_id, selected_session, rc_category)
  VALUES (p_cub_id, p_session, p_category)
  ON CONFLICT (cub_id) DO UPDATE SET
    selected_session = EXCLUDED.selected_session,
    rc_category = EXCLUDED.rc_category;

  -- 3. Propagate RC category to cubs
  UPDATE public.cubs
  SET reading_circle_category = p_category
  WHERE cub_id = p_cub_id;

  -- 4. Sync orientation if a row exists — recompute stage with RC = Completed
  SELECT * INTO v_orientation FROM public.orientation WHERE cub_id = p_cub_id;
  IF FOUND THEN
    -- Compute nearest session date for rc_selected_date
    v_day_offset := CASE lower(split_part(trim(p_session), ' ', 1))
      WHEN 'sunday'    THEN 0
      WHEN 'monday'    THEN 1
      WHEN 'tuesday'   THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday'  THEN 4
      WHEN 'friday'    THEN 5
      WHEN 'saturday'  THEN 6
      ELSE NULL
    END;

    IF v_day_offset IS NOT NULL THEN
      v_rc_date := CURRENT_DATE + ((v_day_offset - EXTRACT(DOW FROM CURRENT_DATE)::INT + 7) % 7) * INTERVAL '1 day';
    ELSE
      v_rc_date := CURRENT_DATE;
    END IF;

    -- Recompute stage using same priority logic as recomputeOrientationStage()
    IF v_orientation.first_win_status = 'Yes' THEN
      v_new_stage        := 'Completed';
      v_new_stage_status := 'Completed';
      v_new_next_stage   := NULL;
      v_completion_date  := COALESCE(v_orientation.completion_date, CURRENT_DATE);
    ELSE
      -- RC Selected is now Completed
      v_new_stage        := 'RC Selected';
      v_new_stage_status := 'Completed';
      v_new_next_stage   := 'First Win Sent';
      v_completion_date  := NULL;
    END IF;

    UPDATE public.orientation
    SET rc_selected_status = 'Completed',
        rc_selected_date   = COALESCE(v_orientation.rc_selected_date, v_rc_date),
        stage              = v_new_stage,
        stage_status       = v_new_stage_status,
        next_stage         = v_new_next_stage,
        completion_date    = v_completion_date
    WHERE cub_id = p_cub_id;

    -- Propagate updated stage to cubs table
    UPDATE public.cubs
    SET orientation_stage             = v_new_stage,
        orientation_stage_status      = v_new_stage_status,
        orientation_next_stage        = v_new_next_stage,
        orientation_completion_date   = v_completion_date,
        reading_circle_category       = p_category
    WHERE cub_id = p_cub_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 6. Performance indexes for new ORDER BY created_at queries ─
CREATE INDEX IF NOT EXISTS idx_orientation_created_at
  ON public.orientation(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reading_circle_created_at
  ON public.reading_circle(created_at DESC);

-- Compound index for Gen. Comm pending RC query (segment + sub_status + rep)
CREATE INDEX IF NOT EXISTS idx_cubs_segment_substatus_owner
  ON public.cubs(segment, sub_status, relationship_owner)
  WHERE segment = 'Gen. Comm';
