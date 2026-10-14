-- ============================================================
-- Migration: Rep access to insert, update and delete actions
-- Fixes: "when logged as a rep, i'm not able to save interaction with an action"
-- ============================================================

-- Allow authenticated reps to insert actions when logging interactions or follow-ups
DROP POLICY IF EXISTS "Rep inserts actions" ON public.actions;
DROP POLICY IF EXISTS "Team access actions insert" ON public.actions;
CREATE POLICY "Team access actions insert" ON public.actions
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow authenticated reps to update actions (e.g. status changes, feedback, rescheduling)
DROP POLICY IF EXISTS "Rep updates actions" ON public.actions;
DROP POLICY IF EXISTS "Team access actions update" ON public.actions;
CREATE POLICY "Team access actions update" ON public.actions
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow authenticated reps to delete actions when deleting their interactions
DROP POLICY IF EXISTS "Rep deletes actions" ON public.actions;
DROP POLICY IF EXISTS "Team access actions delete" ON public.actions;
CREATE POLICY "Team access actions delete" ON public.actions
  FOR DELETE TO authenticated USING (true);
