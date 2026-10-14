import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CachedProfile {
  role: 'rep' | 'admin';
  full_name: string;
  sheet_rep_name: string | null;
  email?: string;
}

/**
 * Per-request cached profile lookup.
 *
 * React `cache()` deduplicates calls within a single server request — all
 * server actions that run during the same render share one DB round-trip
 * instead of each making their own `profiles` query.
 *
 * Usage:
 *   const profile = await getProfile(supabase, user.id);
 */
export const getProfile = cache(
  async (supabase: SupabaseClient, userId: string): Promise<CachedProfile | null> => {
    const { data } = await supabase
      .from('profiles')
      .select('role, full_name, sheet_rep_name, email')
      .eq('id', userId)
      .single();

    return data as CachedProfile | null;
  }
);
