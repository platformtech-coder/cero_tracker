-- ============================================================
-- Drop plain_password column from public.profiles
-- Eliminates cleartext credential storage in database (B4-01)
-- ============================================================

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS plain_password;
