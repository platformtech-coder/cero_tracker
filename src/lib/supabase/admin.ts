import { createClient } from '@supabase/supabase-js';

// Admin client uses the service role key — bypasses RLS.
// ONLY use server-side in trusted Server Actions.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
