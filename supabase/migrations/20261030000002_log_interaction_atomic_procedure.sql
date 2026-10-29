-- ============================================================
-- ATOMIC TRANSACTION PROCEDURE FOR INTERACTION LOGGING (B4-02)
-- Wraps interaction insertion, actions creation, cubs updates,
-- and families updates into a single atomic ACID transaction.
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_interaction_atomic(
  p_interaction jsonb,
  p_logged_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_interaction_id uuid;
  v_date timestamptz;
  v_cub_id text;
  v_handled_by text;
  v_purpose text;
  v_action_required text;
  v_action text;
  v_action_deadline date;
  v_action_status text;
  v_parent_phone text;
  v_parent_email text;
  v_inserted_record jsonb;
BEGIN
  -- Extract values from JSON payload
  v_date := COALESCE(NULLIF(p_interaction->>'date', '')::timestamptz, now());
  v_cub_id := p_interaction->>'cub_id';
  v_handled_by := p_interaction->>'handled_by';
  v_purpose := p_interaction->>'purpose';
  v_action_required := COALESCE(p_interaction->>'action_required', 'No');
  v_action := p_interaction->>'action';
  v_action_deadline := NULLIF(p_interaction->>'action_deadline', '')::date;
  v_action_status := COALESCE(NULLIF(p_interaction->>'action_status', ''), 'Pending');

  -- 1. Insert into interactions
  INSERT INTO public.interactions (
    parent_first_name,
    parent_last_name,
    cub_id,
    cub_first_name,
    cub_last_name,
    handled_by,
    type,
    purpose,
    status,
    feedback,
    message_sent,
    action_required,
    action,
    action_deadline,
    action_status,
    logged_by,
    date
  ) VALUES (
    p_interaction->>'parent_first_name',
    p_interaction->>'parent_last_name',
    v_cub_id,
    p_interaction->>'cub_first_name',
    p_interaction->>'cub_last_name',
    v_handled_by,
    p_interaction->>'type',
    v_purpose,
    p_interaction->>'status',
    p_interaction->>'feedback',
    p_interaction->>'message_sent',
    v_action_required,
    v_action,
    v_action_deadline,
    v_action_status,
    p_logged_by,
    v_date
  )
  RETURNING to_jsonb(public.interactions.*) INTO v_inserted_record;

  v_interaction_id := COALESCE(
    (v_inserted_record->>'interaction_id')::uuid,
    (v_inserted_record->>'id')::uuid
  );

  -- 2. Insert into actions queue if action_required is 'Yes'
  IF v_action_required = 'Yes' AND v_action IS NOT NULL AND trim(v_action) <> '' THEN
    INSERT INTO public.actions (
      interaction_id,
      date,
      parent_first_name,
      parent_last_name,
      cub_id,
      cub_first_name,
      cub_last_name,
      handled_by,
      type,
      purpose,
      status,
      feedback,
      action_required,
      action,
      action_deadline,
      action_status,
      logged_by
    ) VALUES (
      v_interaction_id,
      v_date,
      p_interaction->>'parent_first_name',
      p_interaction->>'parent_last_name',
      v_cub_id,
      p_interaction->>'cub_first_name',
      p_interaction->>'cub_last_name',
      v_handled_by,
      p_interaction->>'type',
      v_purpose,
      p_interaction->>'status',
      p_interaction->>'feedback',
      'Yes',
      v_action,
      v_action_deadline,
      v_action_status,
      p_logged_by
    );
  END IF;

  -- 3. Update cubs table
  IF v_cub_id IS NOT NULL THEN
    UPDATE public.cubs
    SET
      last_engagement_activity = v_date,
      handled_by_last = v_handled_by,
      purpose_last = v_purpose
    WHERE cub_id = v_cub_id;

    -- 4. Update families table if parent contact info exists
    SELECT parent_phone, parent_email
    INTO v_parent_phone, v_parent_email
    FROM public.master_cubs
    WHERE cub_id = v_cub_id
    LIMIT 1;

    IF v_parent_phone IS NOT NULL AND trim(v_parent_phone) <> '' THEN
      UPDATE public.families
      SET
        last_engagement_date = v_date,
        last_handled_by = v_handled_by,
        last_purpose = v_purpose,
        updated_at = now()
      WHERE parent_phone = trim(v_parent_phone);
    ELSIF v_parent_email IS NOT NULL AND trim(v_parent_email) <> '' THEN
      UPDATE public.families
      SET
        last_engagement_date = v_date,
        last_handled_by = v_handled_by,
        last_purpose = v_purpose,
        updated_at = now()
      WHERE lower(parent_email) = lower(trim(v_parent_email));
    END IF;
  END IF;

  RETURN v_inserted_record;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_interaction_atomic(jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_interaction_atomic(jsonb, uuid) TO service_role;
