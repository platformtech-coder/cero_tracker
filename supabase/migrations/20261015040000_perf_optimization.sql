-- ============================================================
-- MIGRATION: Comprehensive Performance Optimization
-- Date: 2026-10-15
-- Addresses: FINDING-PERF-01 through FINDING-PERF-11 from audit
-- ============================================================
-- Changes:
--   P0: Fix mutable search_path on all public functions (FINDING-PERF-11)
--   P0: Revoke EXECUTE on SECURITY DEFINER RPCs from anon role (FINDING-PERF-11)
--   P1: Fix RLS init-plans -- wrap auth.uid() in (select ...) (FINDING-PERF-01)
--   P1: Rewrite is_admin() to use (select auth.uid()) (FINDING-PERF-01)
--   P1: Rewrite get_unique_reps() as index-only loose scan (FINDING-PERF-04)
--   P2: Add missing sort/filter indexes (FINDING-PERF-05)
--   P2: Add covering indexes for 6 unindexed foreign keys (FINDING-PERF-06)
--   P2: Drop duplicate idx_cubs_owner index (FINDING-PERF-05)
--   P2: Enable pg_trgm + GIN trigram indexes for autocomplete (FINDING-PERF-10)
-- ============================================================


-- ============================================================
-- SECTION 1 (P0): Fix mutable search_path on all public functions
-- Prevents privilege escalation via search_path injection.
-- ============================================================

ALTER FUNCTION public.is_admin()
  SET search_path = public;

ALTER FUNCTION public.get_unique_reps()
  SET search_path = public;

ALTER FUNCTION public.get_dashboard_stats(text)
  SET search_path = public;

ALTER FUNCTION public.get_orientation_scorecard_metrics(text, date, date)
  SET search_path = public;

ALTER FUNCTION public.get_system_metrics()
  SET search_path = public;

ALTER FUNCTION public.handle_new_user()
  SET search_path = public;

ALTER FUNCTION public.handle_updated_at()
  SET search_path = public;

ALTER FUNCTION public.handle_rc_attendance_rollup()
  SET search_path = public;

ALTER FUNCTION public.increment_orientation_version()
  SET search_path = public;

ALTER FUNCTION public.sync_overdue_status()
  SET search_path = public;

ALTER FUNCTION public.purge_database()
  SET search_path = public;

ALTER FUNCTION public.enroll_gen_comm_orientation()
  SET search_path = public;

ALTER FUNCTION public.confirm_orientation_signup(bigint, text, text, uuid)
  SET search_path = public;

ALTER FUNCTION public.confirm_rc_signup(bigint, text, text, text, text, uuid)
  SET search_path = public;

ALTER FUNCTION public.upsert_families(jsonb)
  SET search_path = public;

ALTER FUNCTION public.upsert_synced_cubs_directory(jsonb)
  SET search_path = public;

ALTER FUNCTION public.upsert_synced_cubs_reading(jsonb)
  SET search_path = public;

ALTER FUNCTION public.upsert_synced_cubs_scores(jsonb)
  SET search_path = public;


-- ============================================================
-- SECTION 2 (P0): Revoke EXECUTE from anon on SECURITY DEFINER RPCs
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.purge_database() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_system_metrics() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.enroll_gen_comm_orientation() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_orientation_signup(bigint, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_rc_signup(bigint, text, text, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.upsert_families(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.upsert_synced_cubs_directory(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.upsert_synced_cubs_reading(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.upsert_synced_cubs_scores(jsonb) FROM anon, public;

-- Grant back to correct roles
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unique_reps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orientation_scorecard_metrics(text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_orientation_signup(bigint, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_rc_signup(bigint, text, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_gen_comm_orientation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_families(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_synced_cubs_directory(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_synced_cubs_reading(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_synced_cubs_scores(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_database() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_system_metrics() TO authenticated;


-- ============================================================
-- SECTION 3 (P1): Rewrite is_admin() with (select auth.uid())
-- Enables PostgreSQL initplan memoization: evaluated ONCE per query.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;


-- ============================================================
-- SECTION 4 (P1): Fix RLS Init-Plans on all affected tables
-- Drop affected policies; recreate with (select auth.uid()) wrapper.
-- This eliminates the N+1 subquery avalanche (2.8M profile index scans).
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Admins can manage profiles" ON public.profiles
  FOR ALL USING (is_admin());

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (is_admin());

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING ((SELECT auth.uid()) = id);

-- cubs
DROP POLICY IF EXISTS "Admin full access to cubs" ON public.cubs;
DROP POLICY IF EXISTS "Rep sees own cubs" ON public.cubs;
DROP POLICY IF EXISTS "Rep inserts own cubs" ON public.cubs;

CREATE POLICY "Admin full access to cubs" ON public.cubs
  FOR ALL USING (is_admin());

-- Drop "Rep sees own cubs" entirely: "Team access cubs select" (authenticated=true)
-- already covers all reps. Removing the overlapping policy eliminates double evaluation.

CREATE POLICY "Rep inserts own cubs" ON public.cubs
  FOR INSERT
  WITH CHECK (
    relationship_owner = (
      SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
      FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- families
DROP POLICY IF EXISTS "Admin full access to families" ON public.families;
DROP POLICY IF EXISTS "Rep sees own families" ON public.families;
DROP POLICY IF EXISTS "Rep inserts families" ON public.families;
DROP POLICY IF EXISTS "Rep updates own families" ON public.families;

CREATE POLICY "Admin full access to families" ON public.families
  FOR ALL USING (is_admin());

CREATE POLICY "Rep sees own families" ON public.families
  FOR SELECT USING (
    relationship_owner = (
      SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
      FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Rep inserts families" ON public.families
  FOR INSERT
  WITH CHECK (
    relationship_owner = (
      SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
      FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Rep updates own families" ON public.families
  FOR UPDATE USING (
    relationship_owner = (
      SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
      FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
    )
  );

-- actions
DROP POLICY IF EXISTS "Admin full access to actions" ON public.actions;
DROP POLICY IF EXISTS "Rep sees own cubs actions" ON public.actions;
DROP POLICY IF EXISTS "Rep updates own actions" ON public.actions;

CREATE POLICY "Admin full access to actions" ON public.actions
  FOR ALL USING (is_admin());

-- "Rep sees own cubs actions" dropped: "All authenticated can see actions" covers all reps.
-- "Rep updates own actions" dropped: "Team access actions update" (authenticated=true) covers all reps.

-- interactions
DROP POLICY IF EXISTS "Admin full access to interactions" ON public.interactions;
DROP POLICY IF EXISTS "Rep inserts interactions" ON public.interactions;
DROP POLICY IF EXISTS "Rep sees own cubs interactions" ON public.interactions;

CREATE POLICY "Admin full access to interactions" ON public.interactions
  FOR ALL USING (is_admin());

CREATE POLICY "Rep inserts interactions" ON public.interactions
  FOR INSERT WITH CHECK (logged_by = (SELECT auth.uid()));

CREATE POLICY "Rep sees own cubs interactions" ON public.interactions
  FOR SELECT USING (
    (
      cub_id IN (
        SELECT cubs.cub_id FROM public.cubs
        WHERE cubs.relationship_owner = (
          SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
          FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
        )
      )
    )
    OR (logged_by = (SELECT auth.uid()))
  );

-- email_history
DROP POLICY IF EXISTS "Admin full access to email_history" ON public.email_history;
DROP POLICY IF EXISTS "Rep sees own cubs email_history" ON public.email_history;

CREATE POLICY "Admin full access to email_history" ON public.email_history
  FOR ALL USING (is_admin());

CREATE POLICY "Rep sees own cubs email_history" ON public.email_history
  FOR SELECT USING (
    cub_id IN (
      SELECT cubs.cub_id FROM public.cubs
      WHERE cubs.relationship_owner = (
        SELECT COALESCE(profiles.sheet_rep_name, profiles.full_name)
        FROM public.profiles WHERE profiles.id = (SELECT auth.uid())
      )
    )
  );

-- handover_notes
DROP POLICY IF EXISTS "Admin full access to handover_notes" ON public.handover_notes;
DROP POLICY IF EXISTS "User inserts own handover notes" ON public.handover_notes;
DROP POLICY IF EXISTS "User sees own handover notes" ON public.handover_notes;
DROP POLICY IF EXISTS "User updates own handover notes" ON public.handover_notes;

CREATE POLICY "Admin full access to handover_notes" ON public.handover_notes
  FOR ALL USING (is_admin());

CREATE POLICY "User inserts own handover notes" ON public.handover_notes
  FOR INSERT WITH CHECK (logged_by = (SELECT auth.uid()));

-- "All authenticated see notes" policy already grants SELECT to all authenticated users.
-- "User sees own handover notes" was already replaced; keep it dropped.

CREATE POLICY "User updates own handover notes" ON public.handover_notes
  FOR UPDATE USING (logged_by = (SELECT auth.uid()));

-- master_cubs
DROP POLICY IF EXISTS "Admin full access to master_cubs" ON public.master_cubs;
DROP POLICY IF EXISTS "Admin can insert master cubs" ON public.master_cubs;

CREATE POLICY "Admin full access to master_cubs" ON public.master_cubs
  FOR ALL USING (is_admin());

CREATE POLICY "Admin can insert master cubs" ON public.master_cubs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (SELECT auth.uid()) AND profiles.role = 'admin'
    )
  );

-- audit_log
DROP POLICY IF EXISTS "Admin full access to audit_log" ON public.audit_log;

CREATE POLICY "Admin full access to audit_log" ON public.audit_log
  FOR ALL USING (is_admin());

-- config_dropdowns
DROP POLICY IF EXISTS "Admin manages dropdowns" ON public.config_dropdowns;

CREATE POLICY "Admin manages dropdowns" ON public.config_dropdowns
  FOR ALL USING (is_admin());

-- app_config
DROP POLICY IF EXISTS "Admin manage app_config" ON public.app_config;

CREATE POLICY "Admin manage app_config" ON public.app_config
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- sync_state
DROP POLICY IF EXISTS "Admin manages sync_state" ON public.sync_state;

CREATE POLICY "Admin manages sync_state" ON public.sync_state
  FOR ALL USING (is_admin());


-- ============================================================
-- SECTION 5 (P1): Rewrite get_unique_reps() as recursive loose index scan
-- Replaces sequential DISTINCT full-table scan (25ms, 512 buffer reads)
-- with recursive CTE walking B-tree index leaf pages (< 0.1ms, 4-6 reads).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_unique_reps()
RETURNS TABLE(relationship_owner text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE loose_scan AS (
    SELECT MIN(c.relationship_owner) AS owner
    FROM public.cubs c
    WHERE c.relationship_owner IS NOT NULL
      AND c.relationship_owner <> 'Unassigned'

    UNION ALL

    SELECT (
      SELECT MIN(c2.relationship_owner)
      FROM public.cubs c2
      WHERE c2.relationship_owner > ls.owner
        AND c2.relationship_owner IS NOT NULL
        AND c2.relationship_owner <> 'Unassigned'
    )
    FROM loose_scan ls
    WHERE ls.owner IS NOT NULL
  )
  SELECT owner AS relationship_owner
  FROM loose_scan
  WHERE owner IS NOT NULL;
$$;


-- ============================================================
-- SECTION 6 (P2): Add missing sort/filter indexes
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_families_parent_last_name
  ON public.families(parent_last_name ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_families_owner_name
  ON public.families(relationship_owner, parent_last_name ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cubs_date_onboarded_desc
  ON public.cubs(date_onboarded DESC NULLS LAST);

-- Drop duplicate index (identical function to idx_cubs_relationship_owner)
DROP INDEX CONCURRENTLY IF EXISTS idx_cubs_owner;


-- ============================================================
-- SECTION 7 (P2): Covering indexes for 6 unindexed foreign keys
-- ============================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_actions_interaction_id
  ON public.actions(interaction_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_actions_logged_by
  ON public.actions(logged_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orientation_last_updated_by
  ON public.orientation(last_updated_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_signups_confirmed_by
  ON public.pending_signups(confirmed_by);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pending_signups_matched_cub_id
  ON public.pending_signups(matched_cub_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rc_attendance_recorded_by
  ON public.rc_attendance(recorded_by);


-- ============================================================
-- SECTION 8 (P2): pg_trgm extension + GIN trigram indexes for autocomplete
-- Enables fast ILIKE searches on master_cubs (was 36-150ms, drops to < 5ms)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_master_cubs_name_trgm
  ON public.master_cubs
  USING gin ((cub_first_name || ' ' || cub_last_name) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_master_cubs_parent_name_trgm
  ON public.master_cubs
  USING gin ((parent_first_name || ' ' || parent_last_name) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_master_cubs_phone_trgm
  ON public.master_cubs
  USING gin (parent_phone gin_trgm_ops);


-- ============================================================
-- END OF MIGRATION
-- ============================================================
