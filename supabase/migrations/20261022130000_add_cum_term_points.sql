-- Migration: 20261022130000_add_cum_term_points.sql
-- Add cum_term_points column to cubs table and update reading sync RPC + directory RPC

-- 1. Add cum_term_points column
ALTER TABLE public.cubs
  ADD COLUMN IF NOT EXISTS cum_term_points INTEGER DEFAULT 0;

-- 2. Update upsert_synced_cubs_reading to persist cum_term_points
CREATE OR REPLACE FUNCTION public.upsert_synced_cubs_reading(cubs_data jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec jsonb;
  n integer := 0;
BEGIN
  FOR rec IN SELECT * FROM jsonb_array_elements(cubs_data) LOOP
    UPDATE public.cubs SET
      current_streak    = COALESCE(NULLIF(rec->>'current_streak','')::integer, current_streak),
      longest_streak    = COALESCE(NULLIF(rec->>'longest_streak','')::integer, longest_streak),
      streak_label      = NULLIF(rec->>'streak_label',''),
      current_league    = NULLIF(rec->>'current_league',''),
      medallion_status  = NULLIF(rec->>'medallion_status',''),
      flag              = NULLIF(rec->>'flag',''),
      cumulative_points = COALESCE(NULLIF(rec->>'cumulative_points','')::integer, cumulative_points),
      cum_term_points   = COALESCE(NULLIF(rec->>'cum_term_points','')::integer, cum_term_points)
    WHERE cub_id = rec->>'cub_id';

    IF FOUND THEN
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

-- 3. Update get_directory_cubs RPC to include cum_term_points
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
        'cum_term_points', COALESCE(c.cum_term_points, c.cumulative_points, 0),
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
  LEFT JOIN public.master_cubs mc ON mc.cub_id = c.cub_id
  WHERE c.is_archived = false
    AND (p_rep IS NULL OR c.relationship_owner = p_rep);
$$;

REVOKE EXECUTE ON FUNCTION public.get_directory_cubs FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_directory_cubs TO authenticated, service_role;
