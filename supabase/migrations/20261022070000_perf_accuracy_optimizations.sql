-- ============================================================
-- MIGRATION: Performance & Data Accuracy Optimizations
-- Date: 2026-10-22
-- Implements:
--   1. Trigger for atomic family & cub engagement sync (DA-02)
--   2. Atomic RPC update_cub_journey_atomic (DA-01)
--   3. Atomic RPC change_rc_session_atomic (DA-01)
--   4. Fast RPC get_rep_interactions without client pagination limits (DA-03)
--   5. Fast single-query roster RPCs: get_orientation_master & get_reading_circle_roster (PB-02, PB-03)
--   6. Fast single-query directory RPCs: get_directory_cubs & get_directory_families (PB-02)
--   7. Indexes on system_errors table for faster monitoring (PB-05)
-- ============================================================

-- ─── 1. Automatic Family & Cub Engagement Sync Trigger (DA-02) ─
-- Whenever an interaction is logged anywhere, automatically and atomically
-- updates cubs.last_engagement_activity and families.last_engagement_date
-- with fallback from parent_phone -> parent_email -> parent_first+last_name.
CREATE OR REPLACE FUNCTION public.sync_interaction_engagement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mc RECORD;
  v_phone TEXT;
  v_email TEXT;
  v_fname TEXT;
  v_lname TEXT;
BEGIN
  -- 1. Update cub's last engagement on cubs table
  UPDATE public.cubs
  SET
    last_engagement_activity = CASE 
      WHEN last_engagement_activity IS NULL OR NEW.date > last_engagement_activity THEN NEW.date 
      ELSE last_engagement_activity 
    END,
    handled_by_last = NEW.handled_by,
    purpose_last = NEW.purpose
  WHERE cub_id = NEW.cub_id;

  -- 2. Fetch parent contact information from master_cubs
  SELECT parent_phone, parent_email, parent_first_name, parent_last_name
  INTO v_mc
  FROM public.master_cubs
  WHERE cub_id = NEW.cub_id;

  v_phone := NULLIF(TRIM(COALESCE(v_mc.parent_phone, '')), '');
  v_email := NULLIF(LOWER(TRIM(COALESCE(v_mc.parent_email, ''))), '');
  v_fname := NULLIF(LOWER(TRIM(COALESCE(v_mc.parent_first_name, NEW.parent_first_name, ''))), '');
  v_lname := NULLIF(LOWER(TRIM(COALESCE(v_mc.parent_last_name, NEW.parent_last_name, ''))), '');

  -- 3. Update family record using phone, email, or parent name composite
  IF v_phone IS NOT NULL THEN
    UPDATE public.families
    SET
      last_engagement_date = CASE 
        WHEN last_engagement_date IS NULL OR NEW.date > last_engagement_date THEN NEW.date 
        ELSE last_engagement_date 
      END,
      last_handled_by = NEW.handled_by,
      last_purpose = NEW.purpose,
      updated_at = now()
    WHERE parent_phone = v_phone;
  ELSIF v_email IS NOT NULL THEN
    UPDATE public.families
    SET
      last_engagement_date = CASE 
        WHEN last_engagement_date IS NULL OR NEW.date > last_engagement_date THEN NEW.date 
        ELSE last_engagement_date 
      END,
      last_handled_by = NEW.handled_by,
      last_purpose = NEW.purpose,
      updated_at = now()
    WHERE LOWER(TRIM(parent_email)) = v_email;
  ELSIF v_fname IS NOT NULL AND v_lname IS NOT NULL THEN
    UPDATE public.families
    SET
      last_engagement_date = CASE 
        WHEN last_engagement_date IS NULL OR NEW.date > last_engagement_date THEN NEW.date 
        ELSE last_engagement_date 
      END,
      last_handled_by = NEW.handled_by,
      last_purpose = NEW.purpose,
      updated_at = now()
    WHERE LOWER(TRIM(parent_first_name)) = v_fname
      AND LOWER(TRIM(parent_last_name)) = v_lname;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_interaction_engagement ON public.interactions;
CREATE TRIGGER trg_sync_interaction_engagement
  AFTER INSERT ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_interaction_engagement();


-- ─── 2. Atomic RPC: update_cub_journey_atomic (DA-01) ───────────
-- CAS update on orientation and atomic propagation to cubs table
CREATE OR REPLACE FUNCTION public.update_cub_journey_atomic(
  p_cub_id TEXT,
  p_version_ts BIGINT,
  p_orientation_updates JSONB,
  p_stage_updates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_version BIGINT;
  v_rows_affected INT;
BEGIN
  -- 1. CAS update on orientation
  UPDATE public.orientation
  SET
    invited_status = COALESCE(p_orientation_updates->>'invited_status', invited_status),
    booked_status = COALESCE(p_orientation_updates->>'booked_status', booked_status),
    booked_date = CASE WHEN p_orientation_updates ? 'booked_date' THEN (p_orientation_updates->>'booked_date')::date ELSE booked_date END,
    attended_status = COALESCE(p_orientation_updates->>'attended_status', attended_status),
    attended_date = CASE WHEN p_orientation_updates ? 'attended_date' THEN (p_orientation_updates->>'attended_date')::date ELSE attended_date END,
    attended_feedback = COALESCE(p_orientation_updates->>'attended_feedback', attended_feedback),
    first_win_status = COALESCE(p_orientation_updates->>'first_win_status', first_win_status),
    first_win_date = CASE WHEN p_orientation_updates ? 'first_win_date' THEN (p_orientation_updates->>'first_win_date')::date ELSE first_win_date END,
    first_win_feedback = COALESCE(p_orientation_updates->>'first_win_feedback', first_win_feedback),
    rc_selected_status = COALESCE(p_orientation_updates->>'rc_selected_status', rc_selected_status),
    rc_selected_date = CASE WHEN p_orientation_updates ? 'rc_selected_date' THEN (p_orientation_updates->>'rc_selected_date')::date ELSE rc_selected_date END,
    rc_selected_feedback = COALESCE(p_orientation_updates->>'rc_selected_feedback', rc_selected_feedback),
    session = CASE WHEN p_orientation_updates ? 'session' THEN NULLIF(p_orientation_updates->>'session', '') ELSE session END,
    stage = p_stage_updates->>'stage',
    stage_status = p_stage_updates->>'stage_status',
    next_stage = p_stage_updates->>'next_stage',
    completion_date = CASE WHEN p_stage_updates ? 'completion_date' THEN (p_stage_updates->>'completion_date')::date ELSE completion_date END,
    updated_at = now()
  WHERE cub_id = p_cub_id
    AND version_ts = p_version_ts
  RETURNING version_ts INTO v_new_version;

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
  IF v_rows_affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'conflict', true, 'error', 'Conflict: this record was modified by another user. Please refresh and try again.');
  END IF;

  -- 2. Atomic propagation to cubs table
  UPDATE public.cubs
  SET
    orientation_stage = p_stage_updates->>'stage',
    orientation_stage_status = p_stage_updates->>'stage_status',
    orientation_next_stage = p_stage_updates->>'next_stage',
    orientation_completion_date = CASE WHEN p_stage_updates ? 'completion_date' THEN (p_stage_updates->>'completion_date')::date ELSE NULL END,
    reading_circle_category = COALESCE(p_stage_updates->>'rc_category', reading_circle_category)
  WHERE cub_id = p_cub_id;

  RETURN jsonb_build_object('success', true, 'version_ts', v_new_version);
END;
$$;


-- ─── 3. Atomic RPC: change_rc_session_atomic (DA-01) ───────────
-- Atomically updates reading_circle, orientation, and cubs
CREATE OR REPLACE FUNCTION public.change_rc_session_atomic(
  p_cub_id TEXT,
  p_new_session TEXT,
  p_new_category TEXT,
  p_rc_date DATE,
  p_stage TEXT DEFAULT NULL,
  p_stage_status TEXT DEFAULT NULL,
  p_next_stage TEXT DEFAULT NULL,
  p_completion_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Upsert reading_circle
  INSERT INTO public.reading_circle (cub_id, selected_session, rc_category, updated_at)
  VALUES (p_cub_id, p_new_session, p_new_category, now())
  ON CONFLICT (cub_id) DO UPDATE SET
    selected_session = EXCLUDED.selected_session,
    rc_category = EXCLUDED.rc_category,
    updated_at = now();

  -- 2. Update orientation if exists
  IF EXISTS (SELECT 1 FROM public.orientation WHERE cub_id = p_cub_id) THEN
    UPDATE public.orientation
    SET
      rc_selected_status = 'Completed',
      rc_selected_date = COALESCE(rc_selected_date, p_rc_date),
      stage = COALESCE(p_stage, stage),
      stage_status = COALESCE(p_stage_status, stage_status),
      next_stage = p_next_stage,
      completion_date = p_completion_date,
      updated_at = now()
    WHERE cub_id = p_cub_id;

    -- 3. Update cubs table
    UPDATE public.cubs
    SET
      orientation_stage = COALESCE(p_stage, orientation_stage),
      orientation_stage_status = COALESCE(p_stage_status, orientation_stage_status),
      orientation_next_stage = p_next_stage,
      orientation_completion_date = p_completion_date,
      reading_circle_category = p_new_category
    WHERE cub_id = p_cub_id;
  ELSE
    -- No orientation row, update cubs category
    UPDATE public.cubs
    SET reading_circle_category = p_new_category
    WHERE cub_id = p_cub_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ─── 4. RPC: get_rep_interactions (DA-03) ──────────────────────
-- Server-side filtering avoids PostgREST 414 URI Too Long and JS filter loops
CREATE OR REPLACE FUNCTION public.get_rep_interactions(
  p_rep_name TEXT DEFAULT NULL,
  p_limit INT DEFAULT 2000
)
RETURNS SETOF public.interactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.*
  FROM public.interactions i
  WHERE (
    p_rep_name IS NULL
    OR i.handled_by = p_rep_name
    OR EXISTS (
      SELECT 1 FROM public.cubs c
      WHERE c.cub_id = i.cub_id AND c.relationship_owner = p_rep_name
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = i.logged_by AND (p.full_name = p_rep_name OR p.sheet_rep_name = p_rep_name)
    )
  )
  ORDER BY i.date DESC
  LIMIT p_limit;
$$;


-- ─── 5. High-Volume Roster RPCs (PB-02, PB-03) ───────────────────
-- get_orientation_master: Returns full orientation roster with cubs and master info in 1 query
CREATE OR REPLACE FUNCTION public.get_orientation_master(
  p_rep TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id', o.id,
        'cub_id', o.cub_id,
        'session', o.session,
        'invited_status', o.invited_status,
        'booked_status', o.booked_status,
        'booked_date', o.booked_date,
        'attended_status', o.attended_status,
        'attended_date', o.attended_date,
        'attended_feedback', o.attended_feedback,
        'first_win_status', o.first_win_status,
        'first_win_date', o.first_win_date,
        'first_win_feedback', o.first_win_feedback,
        'rc_selected_status', o.rc_selected_status,
        'rc_selected_date', o.rc_selected_date,
        'rc_selected_feedback', o.rc_selected_feedback,
        'stage', o.stage,
        'stage_status', o.stage_status,
        'next_stage', o.next_stage,
        'completion_date', o.completion_date,
        'version_ts', o.version_ts,
        'created_at', o.created_at,
        'updated_at', o.updated_at,
        'cubs', json_build_object(
          'relationship_owner', c.relationship_owner,
          'segment', c.segment,
          'sub_status', c.sub_status,
          'date_onboarded', COALESCE(c.date_onboarded, mc.date_onboarded),
          'cumulative_points', c.cumulative_points,
          'last_reading_activity', c.last_reading_activity,
          'reading_circle_category', c.reading_circle_category,
          'cub_first_name', mc.cub_first_name,
          'cub_last_name', mc.cub_last_name,
          'parent_first_name', mc.parent_first_name,
          'parent_last_name', mc.parent_last_name,
          'parent_phone', mc.parent_phone,
          'parent_email', mc.parent_email
        )
      )
      ORDER BY o.created_at DESC
    ),
    '[]'::json
  )::jsonb
  FROM public.orientation o
  JOIN public.master_cubs mc ON mc.cub_id = o.cub_id
  JOIN public.cubs c ON c.cub_id = o.cub_id
  WHERE c.is_archived = false
    AND (p_rep IS NULL OR c.relationship_owner = p_rep);
$$;

-- get_reading_circle_roster: Returns RC roster with cub & master info in 1 query
CREATE OR REPLACE FUNCTION public.get_reading_circle_roster(
  p_rep TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id', rc.id,
        'cub_id', rc.cub_id,
        'selected_session', rc.selected_session,
        'rc_category', rc.rc_category,
        'weeks_active', rc.weeks_active,
        'no_present', rc.no_present,
        'last_attendance_date', rc.last_attendance_date,
        'created_at', rc.created_at,
        'updated_at', rc.updated_at,
        'cubs', json_build_object(
          'relationship_owner', c.relationship_owner,
          'segment', c.segment,
          'sub_status', c.sub_status,
          'cub_first_name', mc.cub_first_name,
          'cub_last_name', mc.cub_last_name,
          'parent_first_name', mc.parent_first_name,
          'parent_last_name', mc.parent_last_name,
          'parent_phone', mc.parent_phone,
          'parent_email', mc.parent_email
        )
      )
      ORDER BY rc.created_at DESC
    ),
    '[]'::json
  )::jsonb
  FROM public.reading_circle rc
  JOIN public.master_cubs mc ON mc.cub_id = rc.cub_id
  JOIN public.cubs c ON c.cub_id = rc.cub_id
  WHERE c.is_archived = false
    AND (p_rep IS NULL OR c.relationship_owner = p_rep);
$$;

-- get_directory_cubs: Returns directory cubs with master info in 1 query
CREATE OR REPLACE FUNCTION public.get_directory_cubs(
  p_rep TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id', c.id,
        'cub_id', c.cub_id,
        'date_onboarded', c.date_onboarded,
        'segment', c.segment,
        'gender', c.gender,
        'grade', c.grade,
        'stream', c.stream,
        'school_name', c.school_name,
        'sub_start_date', c.sub_start_date,
        'sub_end_date', c.sub_end_date,
        'no_sub_days', c.no_sub_days,
        'sub_status', c.sub_status,
        'current_streak', c.current_streak,
        'longest_streak', c.longest_streak,
        'streak_label', c.streak_label,
        'current_league', c.current_league,
        'medallion_status', c.medallion_status,
        'flag', c.flag,
        'cumulative_points', c.cumulative_points,
        'cumulative_weekly_points', c.cumulative_weekly_points,
        'last_reading_activity', c.last_reading_activity,
        'reading_circle_category', c.reading_circle_category,
        'no_present', c.no_present,
        'last_attendance_date', c.last_attendance_date,
        'orientation_stage', c.orientation_stage,
        'orientation_stage_status', c.orientation_stage_status,
        'orientation_next_stage', c.orientation_next_stage,
        'orientation_completion_date', c.orientation_completion_date,
        'last_engagement_activity', c.last_engagement_activity,
        'handled_by_last', c.handled_by_last,
        'purpose_last', c.purpose_last,
        'relationship_owner', c.relationship_owner,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'cub_first_name', COALESCE(mc.cub_first_name, ''),
        'cub_last_name', COALESCE(mc.cub_last_name, ''),
        'parent_first_name', COALESCE(mc.parent_first_name, ''),
        'parent_last_name', COALESCE(mc.parent_last_name, ''),
        'parent_phone', COALESCE(mc.parent_phone, ''),
        'parent_email', COALESCE(mc.parent_email, ''),
        'parent_whatsapp', COALESCE(mc.parent_whatsapp, '')
      )
      ORDER BY c.date_onboarded DESC NULLS LAST
    ),
    '[]'::json
  )::jsonb
  FROM public.cubs c
  JOIN public.master_cubs mc ON mc.cub_id = c.cub_id
  WHERE c.is_archived = false
    AND (p_rep IS NULL OR c.relationship_owner = p_rep);
$$;

-- get_directory_families: Returns all directory families in 1 query
CREATE OR REPLACE FUNCTION public.get_directory_families(
  p_rep TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    json_agg(
      row_to_json(f)
      ORDER BY f.parent_last_name ASC
    ),
    '[]'::json
  )::jsonb
  FROM public.families f
  WHERE (p_rep IS NULL OR f.relationship_owner = p_rep);
$$;


-- ─── 6. Performance Indexes (PB-05) ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_system_errors_level_status 
  ON public.system_errors(level, status);

CREATE INDEX IF NOT EXISTS idx_system_errors_status_created 
  ON public.system_errors(status, created_at DESC);


-- ─── 7. Grants & Security ───────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.update_cub_journey_atomic FROM anon, public;
GRANT EXECUTE ON FUNCTION public.update_cub_journey_atomic TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.change_rc_session_atomic FROM anon, public;
GRANT EXECUTE ON FUNCTION public.change_rc_session_atomic TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_rep_interactions FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_rep_interactions TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_orientation_master FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_orientation_master TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_reading_circle_roster FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_reading_circle_roster TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_directory_cubs FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_directory_cubs TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_directory_families FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_directory_families TO authenticated, service_role;
