-- Migration: 20261011124500_fix_rls_and_integrity.sql
-- Description:
-- 1. DB-4: Enable SELECT on app_config for authenticated users, Admin full access
-- 2. N-6: Restrict pending_signups INSERT to admin / service_role
-- 3. N-5: Drop duplicate RLS policy on rc_attendance
-- 4. REL-1: Add idempotency_key column and index on pending_signups
-- 5. DB constraint: Support standard statuses and 'ok'/'error' in audit_log
-- 6. P-4: Atomic trigger for rc_attendance rollup to reading_circle and cubs
-- 7. N-2: Transactional RPC functions for confirming orientation and reading circle signups
-- 8. Code parity: upsert_families function and index

-- ─── 1. app_config RLS Policies ────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read app_config" ON public.app_config;
CREATE POLICY "Authenticated users can read app_config"
  ON public.app_config FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin manage app_config" ON public.app_config;
CREATE POLICY "Admin manage app_config"
  ON public.app_config FOR ALL
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ─── 2. pending_signups RLS Hardening ─────────────────────────
-- Drop the overly permissive insert policy allowing any authenticated user to insert arbitrary pending signups
DROP POLICY IF EXISTS "All authenticated insert pending" ON public.pending_signups;

-- ─── 3. Clean up Duplicate Policy on rc_attendance ────────────
DROP POLICY IF EXISTS "Admin full access" ON public.rc_attendance;

-- ─── 4. pending_signups Idempotency Key ────────────────────────
ALTER TABLE public.pending_signups ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_signups_idempotency 
  ON public.pending_signups(form_source, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

-- ─── 5. audit_log Status Constraint ───────────────────────────
ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_status_check;
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_status_check
  CHECK (status = ANY (ARRAY['SUCCESS'::text, 'ERROR'::text, 'WARNING'::text, 'INFO'::text, 'ok'::text, 'error'::text]));

-- ─── 6. rc_attendance Rollup Trigger (P-4) ────────────────────
CREATE OR REPLACE FUNCTION public.handle_rc_attendance_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cub_id TEXT;
  v_no_present INT;
  v_last_date DATE;
BEGIN
  v_cub_id := COALESCE(NEW.cub_id, OLD.cub_id);

  SELECT 
    COUNT(*)::INT,
    MAX(attendance_date)
  INTO 
    v_no_present,
    v_last_date
  FROM public.rc_attendance
  WHERE cub_id = v_cub_id AND status = 'Present';

  UPDATE public.reading_circle
  SET no_present = v_no_present,
      last_attendance_date = v_last_date
  WHERE cub_id = v_cub_id;

  UPDATE public.cubs
  SET no_present = v_no_present,
      last_attendance_date = v_last_date
  WHERE cub_id = v_cub_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rc_attendance_rollup ON public.rc_attendance;
CREATE TRIGGER trg_rc_attendance_rollup
AFTER INSERT OR UPDATE OR DELETE ON public.rc_attendance
FOR EACH ROW EXECUTE FUNCTION public.handle_rc_attendance_rollup();

-- ─── 7. Atomic Signup Confirm Functions (N-2) ─────────────────
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
BEGIN
  v_session_day := split_part(trim(p_session), ' ', 1);
  IF v_session_day = '' THEN
    v_session_day := p_session;
  END IF;
  v_today := CURRENT_DATE;

  -- 1. Update pending_signups
  UPDATE public.pending_signups
  SET status = 'Confirmed',
      matched_cub_id = p_cub_id,
      selected_session = p_session,
      confirmed_by = p_user_id,
      confirmed_at = now()
  WHERE id = p_pending_id;

  -- 2. Upsert into orientation
  INSERT INTO public.orientation (
    cub_id, session, stage, stage_status, next_stage,
    invited_status, booked_date, booked_status
  ) VALUES (
    p_cub_id, v_session_day, 'Booked', 'Completed', 'Attended',
    'Yes', v_today, 'Completed'
  )
  ON CONFLICT (cub_id) DO UPDATE SET
    session = EXCLUDED.session,
    stage = EXCLUDED.stage,
    stage_status = EXCLUDED.stage_status,
    next_stage = EXCLUDED.next_stage,
    invited_status = EXCLUDED.invited_status,
    booked_date = EXCLUDED.booked_date,
    booked_status = EXCLUDED.booked_status;

  -- 3. Propagate to cubs
  UPDATE public.cubs
  SET orientation_stage = 'Booked',
      orientation_stage_status = 'Completed',
      orientation_next_stage = 'Attended',
      orientation_completion_date = NULL
  WHERE cub_id = p_cub_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

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
BEGIN
  -- 1. Update pending_signups
  UPDATE public.pending_signups
  SET status = 'Confirmed',
      matched_cub_id = p_cub_id,
      selected_session = p_session,
      grade = p_grade,
      confirmed_by = p_user_id,
      confirmed_at = now()
  WHERE id = p_pending_id;

  -- 2. Upsert reading_circle
  INSERT INTO public.reading_circle (
    cub_id, selected_session, rc_category
  ) VALUES (
    p_cub_id, p_session, p_category
  )
  ON CONFLICT (cub_id) DO UPDATE SET
    selected_session = EXCLUDED.selected_session,
    rc_category = EXCLUDED.rc_category;

  -- 3. Propagate to cubs
  UPDATE public.cubs
  SET reading_circle_category = p_category
  WHERE cub_id = p_cub_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─── 8. Code Parity: upsert_families and Index ────────────────
CREATE UNIQUE INDEX IF NOT EXISTS families_unique_parent_idx 
  ON public.families USING btree (COALESCE(parent_phone, ''::text), COALESCE(parent_email, ''::text));

CREATE OR REPLACE FUNCTION public.upsert_families(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    INSERT INTO families (
      parent_first_name, parent_last_name, parent_phone, parent_email,
      parent_whatsapp, relationship_owner, no_cubs, updated_at
    ) VALUES (
      r->>'parent_first_name', r->>'parent_last_name',
      r->>'parent_phone', r->>'parent_email',
      r->>'parent_whatsapp', r->>'relationship_owner',
      (r->>'no_cubs')::int, now()
    )
    ON CONFLICT (COALESCE(parent_phone, ''), COALESCE(parent_email, ''))
    DO UPDATE SET
      parent_first_name = EXCLUDED.parent_first_name,
      parent_last_name = EXCLUDED.parent_last_name,
      parent_whatsapp = COALESCE(EXCLUDED.parent_whatsapp, families.parent_whatsapp),
      parent_email = COALESCE(EXCLUDED.parent_email, families.parent_email),
      relationship_owner = EXCLUDED.relationship_owner,
      no_cubs = EXCLUDED.no_cubs,
      updated_at = now();
  END LOOP;
END;
$function$;
