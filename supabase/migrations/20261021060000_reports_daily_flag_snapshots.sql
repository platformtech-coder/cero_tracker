-- ============================================================
-- MIGRATION: Reports System — Phase 1
-- Date: 2026-10-21
-- Creates:
--   1. daily_flag_snapshots table — immutable record of which cubs
--      had "Call Parent" flags at the start of each working day.
--      This solves the core accountability problem: flags mutate
--      when reps take action, so we cannot look at today's live flags
--      to audit yesterday's work. The snapshot captures the queue
--      before it changes.
--   2. pg_cron job to populate it at 06:00 AM UTC daily.
--   3. RPC: snapshot_daily_flags() — callable on-demand too.
--   4. RLS: admin sees all; rep sees only their own.
-- ============================================================

-- ─── 1. Table ────────────────────────────────────────────────
CREATE TABLE public.daily_flag_snapshots (
  id                BIGSERIAL PRIMARY KEY,
  snapshot_date     DATE        NOT NULL,
  cub_id            TEXT        NOT NULL REFERENCES public.master_cubs(cub_id) ON DELETE CASCADE,
  flag              TEXT        NOT NULL,
  relationship_owner TEXT       NOT NULL,
  -- Denormalised name fields so report queries don't need extra joins
  cub_first_name    TEXT,
  cub_last_name     TEXT,
  parent_first_name TEXT,
  parent_last_name  TEXT,
  parent_phone      TEXT,
  sub_status        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (snapshot_date, cub_id)
);

CREATE INDEX idx_daily_flag_snapshots_date        ON public.daily_flag_snapshots(snapshot_date DESC);
CREATE INDEX idx_daily_flag_snapshots_owner_date  ON public.daily_flag_snapshots(relationship_owner, snapshot_date DESC);
CREATE INDEX idx_daily_flag_snapshots_flag        ON public.daily_flag_snapshots(flag);
CREATE INDEX idx_daily_flag_snapshots_cub         ON public.daily_flag_snapshots(cub_id);

-- ─── 2. RLS ──────────────────────────────────────────────────
ALTER TABLE public.daily_flag_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON public.daily_flag_snapshots
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  ));

CREATE POLICY "Rep sees own snapshots" ON public.daily_flag_snapshots
  FOR SELECT
  USING (
    relationship_owner = (
      SELECT full_name FROM public.profiles WHERE id = (SELECT auth.uid())
    )
  );

-- ─── 3. RPC: snapshot_daily_flags() ─────────────────────────
-- Called by pg_cron at 06:00 UTC each day, and can also be called
-- manually (e.g. if the cron missed). Idempotent — ON CONFLICT DO NOTHING.
CREATE OR REPLACE FUNCTION public.snapshot_daily_flags(p_target_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  INSERT INTO public.daily_flag_snapshots (
    snapshot_date,
    cub_id,
    flag,
    relationship_owner,
    cub_first_name,
    cub_last_name,
    parent_first_name,
    parent_last_name,
    parent_phone,
    sub_status
  )
  SELECT
    p_target_date,
    c.cub_id,
    c.flag,
    c.relationship_owner,
    mc.cub_first_name,
    mc.cub_last_name,
    mc.parent_first_name,
    mc.parent_last_name,
    mc.parent_phone,
    c.sub_status
  FROM public.cubs c
  JOIN public.master_cubs mc ON mc.cub_id = c.cub_id
  WHERE
    c.flag IS NOT NULL
    AND TRIM(c.flag) <> ''
    -- Only snap cubs whose flag contains "Call Parent" (case-insensitive)
    AND LOWER(c.flag) LIKE '%call parent%'
    AND c.is_archived = false
  ON CONFLICT (snapshot_date, cub_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_daily_flags(DATE) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.snapshot_daily_flags(DATE) TO service_role;

-- ─── 4. pg_cron job ──────────────────────────────────────────
-- Runs at 06:00 AM UTC (= 06:00 AM Africa/Accra, UTC+0)
-- Same cron slot convention as daily-master-sync.
SELECT cron.schedule(
  'daily-flag-snapshot',
  '0 6 * * *',
  $$ SELECT public.snapshot_daily_flags(CURRENT_DATE); $$
);

-- ─── 5. Backfill today's snapshot immediately on deploy ───────
-- So we start accumulating data from this moment forward.
SELECT public.snapshot_daily_flags(CURRENT_DATE);

-- ─── 6. Grants ───────────────────────────────────────────────
GRANT SELECT ON public.daily_flag_snapshots TO authenticated;
