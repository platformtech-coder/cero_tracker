-- Migration: Add purpose filter to get_daily_activity_interactions
-- Allows the Daily Activity drawer to be filtered by one or more interaction purposes.

CREATE OR REPLACE FUNCTION public.get_daily_activity_interactions(
  p_rep_name  TEXT,
  p_date      DATE,
  p_end_date  DATE,
  p_purposes  TEXT[] DEFAULT NULL
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
    AND i.date < (COALESCE(p_end_date, p_date) + INTERVAL '1 day')::TIMESTAMPTZ
    AND (p_rep_name IS NULL OR p_rep_name = 'All Reps' OR TRIM(LOWER(i.handled_by)) = TRIM(LOWER(p_rep_name)))
    AND (p_purposes IS NULL OR array_length(p_purposes, 1) IS NULL OR i.purpose = ANY(p_purposes))
  ORDER BY i.date DESC;
$$;

-- Update the single-date convenience overload to forward purposes
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
  SELECT * FROM public.get_daily_activity_interactions(p_rep_name, p_date, p_date, NULL);
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE, DATE, TEXT[]) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE, DATE, TEXT[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE) TO authenticated, service_role;

-- Also support purpose filtering in get_daily_activity_report summary
CREATE OR REPLACE FUNCTION public.get_daily_activity_report(
  p_rep_name  TEXT,
  p_date      DATE,
  p_end_date  DATE,
  p_purposes  TEXT[]
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
      AND (p_rep_name IS NULL OR p_rep_name = 'All Reps' OR TRIM(LOWER(i.handled_by)) = TRIM(LOWER(p_rep_name)))
      AND (p_purposes IS NULL OR array_length(p_purposes, 1) IS NULL OR i.purpose = ANY(p_purposes))
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
      AND (p_rep_name IS NULL OR p_rep_name = 'All Reps' OR TRIM(LOWER(relationship_owner)) = TRIM(LOWER(p_rep_name)))
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

REVOKE EXECUTE ON FUNCTION public.get_daily_activity_report(TEXT, DATE, DATE, TEXT[]) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_daily_activity_report(TEXT, DATE, DATE, TEXT[]) TO authenticated, service_role;

