-- ─── Backfill families.segments, schools, sub_statuses ────────────────────────
-- Fixes the original backfill which used COALESCE(phone,'') equality that
-- prevented matches when either side had a real value vs NULL.
WITH family_aggregates AS (
  SELECT
    mc.parent_phone,
    LOWER(mc.parent_email) AS parent_email,
    array_agg(DISTINCT c.school_name) FILTER (WHERE c.school_name IS NOT NULL AND c.school_name <> '') AS agg_schools,
    array_agg(DISTINCT c.segment)     FILTER (WHERE c.segment     IS NOT NULL AND c.segment     <> '') AS agg_segments,
    array_agg(DISTINCT c.sub_status)  FILTER (WHERE c.sub_status  IS NOT NULL AND c.sub_status  <> '') AS agg_sub_statuses
  FROM public.cubs c
  JOIN public.master_cubs mc ON mc.cub_id = c.cub_id
  WHERE c.is_archived = false
  GROUP BY mc.parent_phone, LOWER(mc.parent_email)
)
UPDATE public.families f
SET
  schools      = COALESCE(fa.agg_schools,      '{}'::TEXT[]),
  segments     = COALESCE(fa.agg_segments,     '{}'::TEXT[]),
  sub_statuses = COALESCE(fa.agg_sub_statuses, '{}'::TEXT[]),
  updated_at   = now()
FROM family_aggregates fa
WHERE (
  (f.parent_phone IS NOT NULL AND f.parent_phone = fa.parent_phone)
  OR
  (f.parent_email IS NOT NULL AND LOWER(f.parent_email) = fa.parent_email)
);
