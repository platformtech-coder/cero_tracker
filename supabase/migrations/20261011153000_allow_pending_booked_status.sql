-- Migration: Allow 'Pending' for orientation.booked_status
ALTER TABLE public.orientation DROP CONSTRAINT IF EXISTS orientation_booked_status_check;
ALTER TABLE public.orientation ADD CONSTRAINT orientation_booked_status_check CHECK (booked_status IN ('Completed', 'Pending'));
