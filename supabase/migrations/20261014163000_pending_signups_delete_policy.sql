-- Migration: Add missing DELETE policy on pending_signups for authenticated team members
-- Allows coordinators and reps to permanently delete rejected pending registrations.

DROP POLICY IF EXISTS "Team access pending_signups delete" ON public.pending_signups;

CREATE POLICY "Team access pending_signups delete" ON public.pending_signups
  FOR DELETE TO authenticated USING (true);
