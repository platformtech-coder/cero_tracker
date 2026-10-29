/**
 * Shared admin-session resolution helpers used by Server Actions.
 *
 * Provides two exported helpers:
 *
 * 1. `requireAdminOrSuperAdmin()` — throws on failure; returns a display
 *    identifier string (email / id). Used where the caller needs to throw.
 *
 * 2. `getAdminContext()` — returns null on failure; returns a typed context
 *    object. Used where the caller needs to branch without exceptions.
 *
 * Both check system_admin_session JWT first (for the /system-admin portal)
 * then fall back to Supabase Auth + profile.role === 'admin'.
 */

import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getProfile } from '@/lib/supabase/getProfile';
import { getSystemAdminSession } from '@/lib/systemAdminAuth';

// ─── Shared service client factory ───────────────────────────────────────────

export function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Context shape returned by getAdminContext() ──────────────────────────────

export interface AdminContext {
  isAdmin: true;
  /** Human-readable display name for audit trail entries. */
  name: string;
  /** Supabase Auth user ID (only available for in-app admins, not system admins). */
  userId?: string;
}

// ─── Helper 1: Throws on failure (used in forms.ts, system-admin actions) ────

/**
 * Requires either a system-admin JWT cookie session or a logged-in Supabase
 * Auth user whose profile.role is 'admin'.
 *
 * Returns a display identifier (email / user id) for audit purposes.
 * Throws `Error('Unauthorized')` or `Error('Forbidden - Admin only')` on failure.
 */
export async function requireAdminOrSuperAdmin(): Promise<string> {
  // 1. System-admin JWT cookie (no Supabase Auth involved)
  const sysSession = await getSystemAdminSession();
  if (sysSession) return sysSession.email;

  // 2. Supabase Auth + profile role check
  const supabase = await createSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);
  if (profile?.role !== 'admin') throw new Error('Forbidden - Admin only');

  return profile.email ?? user.email ?? user.id;
}

// ─── Helper 2: Returns null on failure (used in edit-requests.ts) ────────────

/**
 * Checks for either a system-admin JWT cookie session or a logged-in Supabase
 * Auth user whose profile.role is 'admin'.
 *
 * Returns an `AdminContext` on success, or `null` if the caller is not an admin.
 * Does NOT throw — callers must handle the null case explicitly.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  // 1. System-admin JWT cookie
  try {
    const sysSession = await getSystemAdminSession();
    if (sysSession?.role === 'super_admin') {
      return { isAdmin: true, name: sysSession.name || 'System Administrator' };
    }
  } catch {
    // ignore and fall through
  }

  // 2. Supabase Auth + profile role check
  try {
    const supabase = await createSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profile = await getProfile(supabase, user.id);
      if (profile?.role === 'admin') {
        return {
          isAdmin: true,
          name: profile.full_name || profile.sheet_rep_name || user.email || 'Administrator',
          userId: user.id,
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}
