-- ============================================================
-- MIGRATION: Reports System — Call Parents Flags Accountability
-- Date: 2026-10-21
-- Replaces old general flags with dedicated Call Parents Accountability.
-- Models the business reality:
--   - Flags are assigned to individual CUBS.
--   - Calls are made to FAMILIES (parents).
--   - One family call covers 1 to N cubs.
--   - Tracks Reached vs Not Reached (any status other than 'reached' = not reached).
--   - Calculates Call Rate (% families called) and Success Rate (% calls reached).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_call_parents_report(
  p_rep_name TEXT DEFAULT NULL,
  p_start    DATE DEFAULT CURRENT_DATE - INTERVAL '7 days',
  p_end      DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH snap AS (
    SELECT
      dfs.snapshot_date,
      dfs.cub_id,
      dfs.flag,
      dfs.relationship_owner,
      dfs.cub_first_name,
      dfs.cub_last_name,
      dfs.parent_first_name,
      dfs.parent_last_name,
      dfs.parent_phone,
      dfs.sub_status,
      COALESCE(
        NULLIF(TRIM(dfs.parent_phone), ''),
        LOWER(TRIM(dfs.parent_first_name)) || ' ' || LOWER(TRIM(dfs.parent_last_name))
      ) AS family_key
    FROM public.daily_flag_snapshots dfs
    WHERE
      dfs.snapshot_date BETWEEN p_start AND p_end
      AND (p_rep_name IS NULL OR TRIM(LOWER(dfs.relationship_owner)) = TRIM(LOWER(p_rep_name)))
      AND LOWER(dfs.flag) LIKE '%call parent%'
  ),
  interaction_calls AS (
    SELECT
      i.id,
      i.date,
      i.handled_by,
      i.cub_id,
      i.status,
      i.feedback,
      COALESCE(
        NULLIF(TRIM(mc.parent_phone), ''),
        LOWER(TRIM(i.parent_first_name)) || ' ' || LOWER(TRIM(i.parent_last_name))
      ) AS family_key
    FROM public.interactions i
    LEFT JOIN public.master_cubs mc ON mc.cub_id = i.cub_id
    WHERE
      i.date >= p_start::TIMESTAMPTZ
      AND i.date < (p_end + INTERVAL '1 day')::TIMESTAMPTZ
      AND LOWER(TRIM(i.type)) IN ('call', 'phone call', 'telephone')
  ),
  family_interactions AS (
    SELECT
      family_key,
      date::DATE AS interaction_date,
      bool_or(LOWER(TRIM(status)) = 'reached') AS was_reached,
      array_agg(DISTINCT cub_id) AS called_cub_ids,
      MAX(date) AS last_call_date,
      MAX(handled_by) AS last_call_rep,
      MAX(feedback) AS last_call_feedback
    FROM interaction_calls
    GROUP BY family_key, date::DATE
  ),
  family_cubs AS (
    SELECT
      s.snapshot_date,
      s.relationship_owner,
      s.family_key,
      MAX(s.parent_first_name) AS parent_first_name,
      MAX(s.parent_last_name)  AS parent_last_name,
      MAX(s.parent_phone)      AS parent_phone,
      COUNT(DISTINCT s.cub_id) AS cubs_count,
      jsonb_agg(
        jsonb_build_object(
          'cub_id',     s.cub_id,
          'cub_name',   TRIM(s.cub_first_name || ' ' || COALESCE(s.cub_last_name, '')),
          'sub_status', s.sub_status,
          'was_called', (fi.called_cub_ids IS NOT NULL AND s.cub_id = ANY(fi.called_cub_ids))
        ) ORDER BY s.cub_first_name
      ) AS cubs,
      (fi.family_key IS NOT NULL) AS was_called,
      COALESCE(fi.was_reached, false) AS was_reached,
      CASE 
        WHEN fi.was_reached = true THEN 'Reached'
        WHEN fi.family_key IS NOT NULL THEN 'Not Reached'
        ELSE 'Not Called'
      END AS call_status,
      fi.last_call_date,
      fi.last_call_rep,
      fi.last_call_feedback
    FROM snap s
    LEFT JOIN family_interactions fi
      ON fi.family_key = s.family_key
      AND fi.interaction_date = s.snapshot_date
    GROUP BY
      s.snapshot_date, s.relationship_owner, s.family_key,
      fi.family_key, fi.was_reached, fi.last_call_date, fi.last_call_rep, fi.last_call_feedback, fi.called_cub_ids
  ),
  daily_summary AS (
    SELECT
      snapshot_date,
      relationship_owner,
      COUNT(*)                                                         AS total_families_due,
      SUM(cubs_count)                                                  AS total_cubs_due,
      COUNT(*) FILTER (WHERE was_called = true)                        AS families_called,
      COUNT(*) FILTER (WHERE was_called = false)                       AS families_not_called,
      COUNT(*) FILTER (WHERE was_called = true AND was_reached = true) AS families_reached,
      COUNT(*) FILTER (WHERE was_called = true AND was_reached = false) AS families_not_reached,
      COALESCE(SUM(cubs_count) FILTER (WHERE was_called = true), 0)      AS cubs_covered,
      COALESCE(SUM(cubs_count) FILTER (WHERE was_called = false), 0)     AS cubs_not_covered,
      ROUND(100.0 * COUNT(*) FILTER (WHERE was_called = true) / NULLIF(COUNT(*), 0), 1) AS call_rate_pct,
      COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE was_called = true AND was_reached = true) / NULLIF(COUNT(*) FILTER (WHERE was_called = true), 0), 1), 0.0) AS success_rate_pct
    FROM family_cubs
    GROUP BY snapshot_date, relationship_owner
  )
  SELECT jsonb_build_object(
    'summary', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date',                 ds.snapshot_date,
          'rep',                  ds.relationship_owner,
          'total_families_due',   ds.total_families_due,
          'total_cubs_due',       ds.total_cubs_due,
          'families_called',      ds.families_called,
          'families_not_called',  ds.families_not_called,
          'families_reached',     ds.families_reached,
          'families_not_reached', ds.families_not_reached,
          'cubs_covered',         ds.cubs_covered,
          'cubs_not_covered',     ds.cubs_not_covered,
          'call_rate_pct',        COALESCE(ds.call_rate_pct, 0.0),
          'success_rate_pct',     COALESCE(ds.success_rate_pct, 0.0)
        )
        ORDER BY ds.snapshot_date DESC, ds.relationship_owner
      ) FROM daily_summary ds
    ),
    'detail', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date',               fa.snapshot_date,
          'rep',                fa.relationship_owner,
          'family_key',         fa.family_key,
          'parent_name',        TRIM(fa.parent_first_name || ' ' || COALESCE(fa.parent_last_name, '')),
          'parent_phone',       fa.parent_phone,
          'cubs_count',         fa.cubs_count,
          'cubs',               fa.cubs,
          'was_called',         fa.was_called,
          'was_reached',        fa.was_reached,
          'call_status',        fa.call_status,
          'last_call_date',     fa.last_call_date,
          'last_call_rep',      fa.last_call_rep,
          'last_call_feedback', fa.last_call_feedback
        )
        ORDER BY fa.snapshot_date DESC, fa.was_called ASC, fa.cubs_count DESC
      ) FROM family_cubs fa
    )
  )
  INTO v_result;

  RETURN COALESCE(v_result, '{"summary":[],"detail":[]}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_call_parents_report(TEXT, DATE, DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_call_parents_report(TEXT, DATE, DATE) TO authenticated, service_role;
