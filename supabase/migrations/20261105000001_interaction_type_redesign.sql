-- Step 1: Update config_dropdowns
DELETE FROM public.config_dropdowns WHERE category = 'type' AND value IN ('WhatsApp', 'Email', 'SMS');

INSERT INTO public.config_dropdowns (category, value, sort_order, is_active)
VALUES 
  ('type', 'Message', 2, true);

-- Step 2: Backfill interactions table
UPDATE public.interactions
SET
  message_sent = type,
  type = 'Message',
  status = NULL
WHERE type IN ('WhatsApp', 'Email', 'SMS');

-- Step 3: Backfill actions table
UPDATE public.actions
SET
  type = 'Message',
  status = NULL
WHERE type IN ('WhatsApp', 'Email', 'SMS');

-- Step 4a: Update get_daily_activity_report (4-param version)
CREATE OR REPLACE FUNCTION public.get_daily_activity_report(
  p_rep_name text,
  p_date date,
  p_end_date date,
  p_purposes text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      AND (p_rep_name IS NULL OR p_rep_name = 'All Reps' OR TRIM(LOWER(i.handled_by)) = TRIM(LOWER(p_rep_name)))
      AND (p_purposes IS NULL OR array_length(p_purposes, 1) IS NULL OR i.purpose = ANY(p_purposes))
  ),
  interaction_metrics AS (
    SELECT
      handled_by,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone'))          AS calls_made,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')
                            AND LOWER(TRIM(status)) = 'reached')                                AS calls_successful,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')
                            AND LOWER(TRIM(status)) != 'reached')                               AS calls_unsuccessful,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')
                            AND LOWER(TRIM(status)) != 'reached'
                            AND message_sent IS NOT NULL AND TRIM(message_sent) <> '')           AS unreached_messages_sent,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('message', 'whatsapp', 'sms', 'email'))      AS messages_sent,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone', 'message', 'whatsapp', 'sms', 'email')) AS total_interactions
    FROM filtered_interactions
    GROUP BY handled_by
  ),
  all_reps AS (
    SELECT DISTINCT relationship_owner AS rep
    FROM public.cubs
    WHERE relationship_owner IS NOT NULL 
      AND TRIM(relationship_owner) <> ''
      AND (p_rep_name IS NULL OR p_rep_name = 'All Reps' OR TRIM(LOWER(relationship_owner)) = TRIM(LOWER(p_rep_name)))
    UNION
    SELECT DISTINCT handled_by AS rep
    FROM filtered_interactions
    WHERE handled_by IS NOT NULL AND TRIM(handled_by) <> ''
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'rep',                     r.rep,
      'calls_made',              COALESCE(im.calls_made, 0),
      'calls_successful',        COALESCE(im.calls_successful, 0),
      'calls_unsuccessful',      COALESCE(im.calls_unsuccessful, 0),
      'unreached_messages_sent', COALESCE(im.unreached_messages_sent, 0),
      'messages_sent',           COALESCE(im.messages_sent, 0),
      'total_interactions',      COALESCE(im.total_interactions, 0)
    )
    ORDER BY r.rep
  )
  INTO v_result
  FROM all_reps r
  LEFT JOIN interaction_metrics im ON TRIM(LOWER(im.handled_by)) = TRIM(LOWER(r.rep));

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- Step 4b: Update get_daily_activity_report (3-param version)
CREATE OR REPLACE FUNCTION public.get_daily_activity_report(
  p_rep_name text DEFAULT NULL::text,
  p_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone'))          AS calls_made,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')
                            AND LOWER(TRIM(status)) = 'reached')                                AS calls_successful,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')
                            AND LOWER(TRIM(status)) != 'reached')                               AS calls_unsuccessful,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone')
                            AND LOWER(TRIM(status)) != 'reached'
                            AND message_sent IS NOT NULL AND TRIM(message_sent) <> '')           AS unreached_messages_sent,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('message', 'whatsapp', 'sms', 'email'))      AS messages_sent,
      COUNT(*) FILTER (WHERE LOWER(TRIM(type)) IN ('call', 'phone call', 'telephone', 'message', 'whatsapp', 'sms', 'email')) AS total_interactions
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
      'rep',                     r.rep,
      'calls_made',              COALESCE(im.calls_made, 0),
      'calls_successful',        COALESCE(im.calls_successful, 0),
      'calls_unsuccessful',      COALESCE(im.calls_unsuccessful, 0),
      'unreached_messages_sent', COALESCE(im.unreached_messages_sent, 0),
      'messages_sent',           COALESCE(im.messages_sent, 0),
      'total_interactions',      COALESCE(im.total_interactions, 0)
    )
    ORDER BY r.rep
  )
  INTO v_result
  FROM all_reps r
  LEFT JOIN interaction_metrics im ON TRIM(LOWER(im.handled_by)) = TRIM(LOWER(r.rep));

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- Step 4c: Update get_daily_activity_report (2-param legacy wrapper)
CREATE OR REPLACE FUNCTION public.get_daily_activity_report(
  p_rep_name text DEFAULT NULL::text,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.get_daily_activity_report(p_rep_name, p_date, p_date, NULL::text[]);
$function$;

-- Step 5: Drop old get_daily_activity_interactions overloads to change return type
DROP FUNCTION IF EXISTS public.get_daily_activity_interactions(text, date);
DROP FUNCTION IF EXISTS public.get_daily_activity_interactions(text, date, date);
DROP FUNCTION IF EXISTS public.get_daily_activity_interactions(text, date, date, text[]);

-- Step 5a: Recreate 4-param (canonical) with message_sent
CREATE OR REPLACE FUNCTION public.get_daily_activity_interactions(
  p_rep_name text,
  p_date date,
  p_end_date date,
  p_purposes text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  id uuid,
  date timestamp with time zone,
  cub_id text,
  cub_first_name text,
  cub_last_name text,
  parent_first_name text,
  parent_last_name text,
  handled_by text,
  type text,
  purpose text,
  status text,
  feedback text,
  action_required text,
  action text,
  message_sent text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    i.id, i.date, i.cub_id,
    i.cub_first_name, i.cub_last_name,
    i.parent_first_name, i.parent_last_name,
    i.handled_by, i.type, i.purpose, i.status,
    i.feedback, i.action_required, i.action,
    i.message_sent
  FROM public.interactions i
  WHERE
    i.date >= p_date::TIMESTAMPTZ
    AND i.date < (COALESCE(p_end_date, p_date) + INTERVAL '1 day')::TIMESTAMPTZ
    AND (p_rep_name IS NULL OR p_rep_name = 'All Reps' OR TRIM(LOWER(i.handled_by)) = TRIM(LOWER(p_rep_name)))
    AND (p_purposes IS NULL OR array_length(p_purposes, 1) IS NULL OR i.purpose = ANY(p_purposes))
  ORDER BY i.date DESC;
$function$;

-- Step 5b: 3-param convenience wrapper
CREATE OR REPLACE FUNCTION public.get_daily_activity_interactions(
  p_rep_name text,
  p_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT NULL::date
)
RETURNS TABLE(
  id uuid,
  date timestamp with time zone,
  cub_id text,
  cub_first_name text,
  cub_last_name text,
  parent_first_name text,
  parent_last_name text,
  handled_by text,
  type text,
  purpose text,
  status text,
  feedback text,
  action_required text,
  action text,
  message_sent text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_daily_activity_interactions(p_rep_name, p_date, p_end_date, NULL::text[]);
$function$;

-- Step 5c: 2-param legacy wrapper
CREATE OR REPLACE FUNCTION public.get_daily_activity_interactions(
  p_rep_name text,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  id uuid,
  date timestamp with time zone,
  cub_id text,
  cub_first_name text,
  cub_last_name text,
  parent_first_name text,
  parent_last_name text,
  handled_by text,
  type text,
  purpose text,
  status text,
  feedback text,
  action_required text,
  action text,
  message_sent text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM public.get_daily_activity_interactions(p_rep_name, p_date, p_date, NULL::text[]);
$function$;

