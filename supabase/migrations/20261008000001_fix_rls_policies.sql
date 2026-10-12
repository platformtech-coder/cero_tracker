-- ============================================================
-- MIGRATION: Fix RLS policies for correct business logic
-- ============================================================
-- Issues fixed:
-- 1. orientation + reading_circle + rc_attendance: add write policies for reps
-- 2. handover_notes: all authenticated users can read (cross-rep shift handover)
-- 3. actions: reps can see ALL actions for Cover/Shift page (cross-rep)
-- 4. families: reps can insert their own families (during sync)
-- 5. cubs: reps can insert their own cubs (during sync)

-- ============================================================
-- 1. ORIENTATION — Write policies for reps
-- ============================================================

-- Reps can INSERT orientation rows for their own cubs
CREATE POLICY "Rep inserts own cubs orientation" ON public.orientation FOR INSERT
  WITH CHECK (
    cub_id IN (
      SELECT cub_id FROM public.cubs
      WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Reps can UPDATE orientation rows for their own cubs
CREATE POLICY "Rep updates own cubs orientation" ON public.orientation FOR UPDATE
  USING (
    cub_id IN (
      SELECT cub_id FROM public.cubs
      WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ============================================================
-- 2. READING CIRCLE — Write policies for reps
-- ============================================================

-- Reps can INSERT reading_circle rows for their own cubs
CREATE POLICY "Rep inserts own cubs reading circle" ON public.reading_circle FOR INSERT
  WITH CHECK (
    cub_id IN (
      SELECT cub_id FROM public.cubs
      WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    )
  );

-- Reps can UPDATE reading_circle rows for their own cubs
CREATE POLICY "Rep updates own cubs reading circle" ON public.reading_circle FOR UPDATE
  USING (
    cub_id IN (
      SELECT cub_id FROM public.cubs
      WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ============================================================
-- 3. RC ATTENDANCE — Reps can insert attendance records
-- ============================================================

ALTER TABLE public.rc_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON public.rc_attendance FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Rep inserts attendance" ON public.rc_attendance FOR INSERT
  WITH CHECK (recorded_by = auth.uid());

CREATE POLICY "Rep sees own cubs attendance" ON public.rc_attendance FOR SELECT
  USING (
    cub_id IN (
      SELECT cub_id FROM public.cubs
      WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "Rep updates own cubs attendance" ON public.rc_attendance FOR UPDATE
  USING (recorded_by = auth.uid());

-- ============================================================
-- 4. HANDOVER NOTES — All authenticated users can READ
-- ============================================================
-- Drop the restrictive "own notes only" select policy
DROP POLICY IF EXISTS "User sees own notes" ON public.handover_notes;

-- Replace with: all authenticated users can see all notes (shift handover use case)
CREATE POLICY "All authenticated see notes" ON public.handover_notes FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 5. ACTIONS — All authenticated users can SELECT for Cover/Shift page
-- ============================================================
-- The current "Rep sees own cubs actions" is correct for Engagements page.
-- But Cover/Shift page needs to see ALL actions cross-rep.
-- We add a blanket SELECT policy for all authenticated users.
-- Application layer (server action) then applies any desired filtering.

-- Drop the broken "Cover page sees all" admin-only policy
DROP POLICY IF EXISTS "Cover page sees all" ON public.actions;

-- All authenticated users can see all actions (server action handles filtering)
CREATE POLICY "All authenticated can see actions" ON public.actions FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 6. FAMILIES — Reps can insert (needed for sync)
-- ============================================================
CREATE POLICY "Rep inserts families" ON public.families FOR INSERT
  WITH CHECK (
    relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Rep updates own families" ON public.families FOR UPDATE
  USING (
    relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 7. CUBS — Reps can insert their own cubs (needed for sync)
-- ============================================================
CREATE POLICY "Rep inserts own cubs" ON public.cubs FOR INSERT
  WITH CHECK (
    relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
  );

-- ============================================================
-- 8. MASTER_CUBS — Allow sync service (via service role) to upsert
-- ============================================================
-- Service role bypasses RLS, so no policy needed for the sync function.
-- However, we add an explicit insert policy for authenticated admin users
-- who may need to manually import records.
CREATE POLICY "Admin can insert master cubs" ON public.master_cubs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 9. PENDING SIGNUPS — All reps can insert (webhook will use service role anyway)
-- ============================================================
CREATE POLICY "All authenticated insert pending" ON public.pending_signups FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Reps can update (confirm/reject) pending signups for their own segment
CREATE POLICY "Rep updates pending signups" ON public.pending_signups FOR UPDATE
  USING (
    matched_cub_id IN (
      SELECT cub_id FROM public.cubs
      WHERE relationship_owner = (SELECT full_name FROM public.profiles WHERE id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
