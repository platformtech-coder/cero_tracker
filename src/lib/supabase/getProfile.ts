import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from './server';

export interface CachedProfile {
  role: 'rep' | 'admin';
  full_name: string;
  sheet_rep_name: string | null;
  email?: string;
}

const fetchProfileById = cache(async (userId: string): Promise<CachedProfile | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('role, full_name, sheet_rep_name, email')
    .eq('id', userId)
    .single();

  return data as CachedProfile | null;
});

/**
 * Per-request cached profile lookup.
 *
 * React `cache()` deduplicates calls within a single server request — all
 * server actions that run during the same render share one DB round-trip
 * instead of each making their own `profiles` query.
 *
 * Supports both signatures:
 *   await getProfile(supabase, user.id); // backwards compatible
 *   await getProfile(user.id);
 */
export async function getProfile(
  supabaseOrUserId: SupabaseClient | string,
  maybeUserId?: string
): Promise<CachedProfile | null> {
  const targetId = typeof supabaseOrUserId === 'string' ? supabaseOrUserId : maybeUserId;
  if (!targetId) return null;
  return fetchProfileById(targetId);
}
