-- Migration: 20261013120000_orientation_rc_team_access.sql
-- Description: Enable team-wide access for Orientation and Reading Circle
-- Across all reps for the coverage/shift system.
-- All authenticated reps can view and manage all orientation, reading circle,
-- rc_attendance, pending_signups, and related cub details.

-- ─── 1. Orientation RLS Policies ──────────────────────────────
DROP POLICY IF EXISTS "Rep sees Gen Comm orientation" ON public.orientation;
DROP POLICY IF EXISTS "Rep updates own cubs orientation" ON public.orientation;
DROP POLICY IF EXISTS "Rep updates Gen Comm orientation" ON public.orientation;
DROP POLICY IF EXISTS "Rep inserts own cubs orientation" ON public.orientation;
DROP POLICY IF EXISTS "Rep sees Gen Comm" ON public.orientation;

CREATE POLICY "Team access orientation select" ON public.orientation
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team access orientation insert" ON public.orientation
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Team access orientation update" ON public.orientation
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─── 2. Reading Circle RLS Policies ───────────────────────────
DROP POLICY IF EXISTS "Rep sees Gen Comm reading_circle" ON public.reading_circle;
DROP POLICY IF EXISTS "Rep updates own cubs reading circle" ON public.reading_circle;
DROP POLICY IF EXISTS "Rep inserts own cubs reading circle" ON public.reading_circle;
DROP POLICY IF EXISTS "Rep sees Gen Comm" ON public.reading_circle;

CREATE POLICY "Team access reading_circle select" ON public.reading_circle
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team access reading_circle insert" ON public.reading_circle
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Team access reading_circle update" ON public.reading_circle
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ─── 3. RC Attendance RLS Policies ────────────────────────────
DROP POLICY IF EXISTS "Rep sees own cubs attendance" ON public.rc_attendance;
DROP POLICY IF EXISTS "Rep manages Gen Comm rc_attendance" ON public.rc_attendance;
DROP POLICY IF EXISTS "Rep updates own cubs attendance" ON public.rc_attendance;
DROP POLICY IF EXISTS "Rep inserts attendance" ON public.rc_attendance;

CREATE POLICY "Team access rc_attendance select" ON public.rc_attendance
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team access rc_attendance insert" ON public.rc_attendance
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Team access rc_attendance update" ON public.rc_attendance
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Team access rc_attendance delete" ON public.rc_attendance
  FOR DELETE TO authenticated USING (true);

-- ─── 4. Pending Signups RLS Policies ──────────────────────────
DROP POLICY IF EXISTS "Rep sees pending for own cubs" ON public.pending_signups;
DROP POLICY IF EXISTS "Rep sees pending for own segment" ON public.pending_signups;
DROP POLICY IF EXISTS "Rep updates pending signups" ON public.pending_signups;
DROP POLICY IF EXISTS "All authenticated insert pending" ON public.pending_signups;

CREATE POLICY "Team access pending_signups select" ON public.pending_signups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team access pending_signups update" ON public.pending_signups
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Team access pending_signups insert" ON public.pending_signups
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── 5. Master Cubs & Cubs RLS Policies ───────────────────────
-- Allow authenticated reps to select all cubs/master_cubs and update
-- cubs (orientation stage, rc session/category, points) during shifts.
DROP POLICY IF EXISTS "Rep sees own master_cubs" ON public.master_cubs;
DROP POLICY IF EXISTS "Rep owns cubs" ON public.master_cubs;

CREATE POLICY "Team access master_cubs select" ON public.master_cubs
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Rep owns cubs" ON public.cubs;
DROP POLICY IF EXISTS "Rep updates own cubs" ON public.cubs;

CREATE POLICY "Team access cubs select" ON public.cubs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Team access cubs update" ON public.cubs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
