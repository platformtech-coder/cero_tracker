-- Migration: Update get_daily_activity_interactions to support date range
-- Allows viewing interaction details in the drawer when a date range is selected in the Daily Activity report.

CREATE OR REPLACE FUNCTION public.get_daily_activity_interactions(
  p_rep_name  TEXT,
  p_date      DATE,
  p_end_date  DATE
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
  ORDER BY i.date DESC;
$$;

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
  SELECT * FROM public.get_daily_activity_interactions(p_rep_name, p_date, p_date);
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE, DATE) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_daily_activity_interactions(TEXT, DATE) TO authenticated, service_role;
