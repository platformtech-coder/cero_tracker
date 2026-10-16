-- ─── 1. INTERACTIONS TABLE: family_interaction_id ────────────────
ALTER TABLE public.interactions
  ADD COLUMN IF NOT EXISTS family_interaction_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_interactions_family_interaction_id
  ON public.interactions(family_interaction_id)
  WHERE family_interaction_id IS NOT NULL;

-- ─── 2. FAMILIES TABLE: metadata & engagement columns ───────────
ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS last_engagement_date TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_handled_by TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_purpose TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS schools TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS segments TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS sub_statuses TEXT[] DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_families_last_engagement
  ON public.families(last_engagement_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_families_schools
  ON public.families USING gin(schools);

CREATE INDEX IF NOT EXISTS idx_families_segments
  ON public.families USING gin(segments);

CREATE INDEX IF NOT EXISTS idx_families_sub_statuses
  ON public.families USING gin(sub_statuses);

-- ─── 3. UPDATE upsert_families RPC TO HANDLE ARRAYS & DATES ─────
CREATE OR REPLACE FUNCTION public.upsert_families(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  r jsonb;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    INSERT INTO families (
      parent_first_name, parent_last_name, parent_phone, parent_email,
      parent_whatsapp, relationship_owner, no_cubs,
      schools, segments, sub_statuses,
      last_engagement_date, last_handled_by, last_purpose,
      updated_at
    ) VALUES (
      r->>'parent_first_name',
      r->>'parent_last_name',
      r->>'parent_phone',
      r->>'parent_email',
      r->>'parent_whatsapp',
      r->>'relationship_owner',
      COALESCE((r->>'no_cubs')::int, 1),
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(r->'schools', '[]'::jsonb)) x), '{}'::TEXT[]),
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(r->'segments', '[]'::jsonb)) x), '{}'::TEXT[]),
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(r->'sub_statuses', '[]'::jsonb)) x), '{}'::TEXT[]),
      CASE WHEN r->>'last_engagement_date' IS NOT NULL THEN (r->>'last_engagement_date')::timestamptz ELSE NULL END,
      r->>'last_handled_by',
      r->>'last_purpose',
      now()
    )
    ON CONFLICT (COALESCE(parent_phone, ''), COALESCE(parent_email, ''))
    DO UPDATE SET
      parent_first_name = EXCLUDED.parent_first_name,
      parent_last_name = EXCLUDED.parent_last_name,
      parent_whatsapp = COALESCE(EXCLUDED.parent_whatsapp, families.parent_whatsapp),
      parent_email = COALESCE(EXCLUDED.parent_email, families.parent_email),
      relationship_owner = EXCLUDED.relationship_owner,
      no_cubs = EXCLUDED.no_cubs,
      schools = EXCLUDED.schools,
      segments = EXCLUDED.segments,
      sub_statuses = EXCLUDED.sub_statuses,
      last_engagement_date = COALESCE(families.last_engagement_date, EXCLUDED.last_engagement_date),
      last_handled_by = COALESCE(families.last_handled_by, EXCLUDED.last_handled_by),
      last_purpose = COALESCE(families.last_purpose, EXCLUDED.last_purpose),
      updated_at = now();
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.upsert_families(jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.upsert_families(jsonb) TO service_role;

-- ─── 4. ONE-TIME BACKFILL FOR EXISTING FAMILIES ─────────────────
WITH family_aggregates AS (
  SELECT 
    COALESCE(mc.parent_phone, '') AS phone,
    COALESCE(LOWER(mc.parent_email), '') AS email,
    array_agg(DISTINCT c.school_name) FILTER (WHERE c.school_name IS NOT NULL AND c.school_name <> '') AS agg_schools,
    array_agg(DISTINCT c.segment) FILTER (WHERE c.segment IS NOT NULL AND c.segment <> '') AS agg_segments,
    array_agg(DISTINCT c.sub_status) FILTER (WHERE c.sub_status IS NOT NULL AND c.sub_status <> '') AS agg_sub_statuses,
    MAX(c.last_engagement_activity) AS max_engagement
  FROM public.cubs c
  JOIN public.master_cubs mc ON mc.cub_id = c.cub_id
  WHERE c.is_archived = false
  GROUP BY COALESCE(mc.parent_phone, ''), COALESCE(LOWER(mc.parent_email), '')
)
UPDATE public.families f
SET 
  schools = COALESCE(fa.agg_schools, '{}'::TEXT[]),
  segments = COALESCE(fa.agg_segments, '{}'::TEXT[]),
  sub_statuses = COALESCE(fa.agg_sub_statuses, '{}'::TEXT[]),
  last_engagement_date = COALESCE(f.last_engagement_date, fa.max_engagement)
FROM family_aggregates fa
WHERE COALESCE(f.parent_phone, '') = fa.phone
  AND COALESCE(LOWER(f.parent_email), '') = fa.email;
