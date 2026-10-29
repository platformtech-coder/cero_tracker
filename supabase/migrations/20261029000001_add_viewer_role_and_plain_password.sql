-- ============================================================
-- Add 'viewer' role to the profiles_role_check constraint
-- and add a plain_password column for admin reference
-- ============================================================

-- 1. Drop the existing role check constraint
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Re-add it with 'viewer' included
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('rep', 'admin', 'viewer'));

-- 3. Add plain_password column (nullable) for admin reference only
--    This is NOT the hashed auth password — it's the admin-set value
--    stored purely so admins can look up what password they assigned.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plain_password TEXT DEFAULT NULL;

-- 4. RLS: only admins can read the plain_password column
--    (handled at the application layer — the column is on the profiles
--     table which already has admin-only write policies, and we only
--     expose it via a server action that checks role = 'admin')
