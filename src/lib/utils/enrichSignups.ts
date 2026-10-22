import { SupabaseClient } from '@supabase/supabase-js';
import type { PendingSignup } from '@/lib/types';

/**
 * Enriches pending signups that have missing or phone-formatted parent names
 * by looking up master_cubs records in parallel.
 */
export async function enrichPendingParentNames(
  supabase: SupabaseClient,
  results: PendingSignup[]
): Promise<PendingSignup[]> {
  const needsParentName = results.filter(
    r => !r.parent_name || r.parent_name === r.parent_phone || /^[\d\s+\-()]{6,}$/.test(r.parent_name.trim())
  );

  if (needsParentName.length === 0) return results;

  const cubIds = needsParentName.map(r => r.matched_cub_id).filter(Boolean) as string[];
  const phones = needsParentName.map(r => r.parent_phone).filter(Boolean);

  const parentMapByCubId = new Map<string, string>();
  const parentMapByPhone = new Map<string, string>();

  const [cubMatchesRes, phoneMatchesRes] = await Promise.all([
    cubIds.length > 0
      ? supabase
          .from('master_cubs')
          .select('cub_id, parent_first_name, parent_last_name')
          .in('cub_id', cubIds)
      : Promise.resolve({ data: null, error: null }),
    phones.length > 0
      ? supabase
          .from('master_cubs')
          .select('parent_phone, parent_first_name, parent_last_name')
          .in('parent_phone', phones)
      : Promise.resolve({ data: null, error: null }),
  ]);

  (cubMatchesRes.data || []).forEach(c => {
    const fullName = `${c.parent_first_name || ''} ${c.parent_last_name || ''}`.trim();
    if (fullName) parentMapByCubId.set(c.cub_id, fullName);
  });

  (phoneMatchesRes.data || []).forEach(p => {
    const fullName = `${p.parent_first_name || ''} ${p.parent_last_name || ''}`.trim();
    if (fullName && p.parent_phone) parentMapByPhone.set(p.parent_phone, fullName);
  });

  return results.map(r => {
    const isBadName = !r.parent_name || r.parent_name === r.parent_phone || /^[\d\s+\-()]{6,}$/.test(r.parent_name.trim());
    if (!isBadName) return r;
    const resolved = (r.matched_cub_id && parentMapByCubId.get(r.matched_cub_id)) ||
                     (r.parent_phone && parentMapByPhone.get(r.parent_phone));
    return resolved ? { ...r, parent_name: resolved } : r;
  });
}
