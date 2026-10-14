'use server';

import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
import type { Cub, Family, Interaction, Action } from '@/lib/types';

// ─── Get Directory Cubs ─────────────────────────────────────────
export async function getDirectoryCubs(repFilter?: string): Promise<(Cub & { cub_first_name: string; cub_last_name: string })[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  const isAdmin = profile?.role === 'admin';
  // Use sheet_rep_name if explicitly set, otherwise fall back to full_name
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilter = !isAdmin || isFilteredRep;

  let allData: any[] = [];
  let from = 0;
  const size = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('cubs')
      .select(`
        *,
        master_cubs (
          cub_first_name,
          cub_last_name,
          parent_first_name,
          parent_last_name,
          parent_phone,
          parent_email,
          parent_whatsapp
        )
      `)
      .order('date_onboarded', { ascending: false, nullsFirst: false })
      .range(from, from + size - 1);


    if (shouldFilter) query = query.eq('relationship_owner', effectiveName!);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    if (data && data.length > 0) {
      allData.push(...data);
      from += size;
      hasMore = data.length === size;
    } else {
      hasMore = false;
    }
  }

  return allData.map((row: any) => ({
    ...row,
    cub_first_name: row.master_cubs?.cub_first_name ?? '',
    cub_last_name: row.master_cubs?.cub_last_name ?? '',
    parent_first_name: row.master_cubs?.parent_first_name ?? '',
    parent_last_name: row.master_cubs?.parent_last_name ?? '',
    parent_phone: row.master_cubs?.parent_phone ?? '',
    parent_email: row.master_cubs?.parent_email ?? '',
    parent_whatsapp: row.master_cubs?.parent_whatsapp ?? '',
    master_cubs: undefined, 
  }));
}

// ─── Get Directory Families ──────────────────────────────────────
export async function getDirectoryFamilies(repFilter?: string): Promise<Family[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  const isAdmin = profile?.role === 'admin';
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilter = !isAdmin || isFilteredRep;

  let allData: any[] = [];
  let from = 0;
  const size = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('families')
      .select('*')
      .order('parent_last_name', { ascending: true })
      .range(from, from + size - 1);

    if (shouldFilter) query = query.eq('relationship_owner', effectiveName!);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    if (data && data.length > 0) {
      allData.push(...data);
      from += size;
      hasMore = data.length === size;
    } else {
      hasMore = false;
    }
  }

  return (allData as Family[]) ?? [];
}

// ─── Get Cub Activity (Interactions & Actions & Emails) ──────
export async function getCubActivity(cubId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { interactions: [], actions: [], email_history: null };

  const [intsRes, actsRes, emailRes] = await Promise.all([
    supabase.from('interactions').select('*').eq('cub_id', cubId).order('date', { ascending: false }).limit(50),
    supabase.from('actions').select('*').eq('cub_id', cubId).neq('action_status', 'Completed').neq('action_status', 'Cancelled').order('action_deadline', { ascending: true }),
    supabase.from('email_history').select('*').eq('cub_id', cubId).single()
  ]);

  return {
    interactions: (intsRes.data as Interaction[]) || [],
    actions: (actsRes.data as Action[]) || [],
    email_history: emailRes.data || null
  };
}

// ─── Get Cubs Belonging to a Family ────────────────────────────
export async function getCubsForFamily(parentPhone: string | null, parentEmail: string | null): Promise<(Cub & { cub_first_name: string; cub_last_name: string })[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Find cub_ids from master_cubs that match this parent's phone or email
  let query = supabase.from('master_cubs').select('cub_id');
  if (parentPhone && parentEmail) {
    query = query.or(`parent_phone.eq.${parentPhone},parent_email.eq.${parentEmail.toLowerCase()}`);
  } else if (parentPhone) {
    query = query.eq('parent_phone', parentPhone);
  } else if (parentEmail) {
    query = query.eq('parent_email', parentEmail.toLowerCase());
  } else {
    return [];
  }

  const { data: masterRows } = await query;
  if (!masterRows || masterRows.length === 0) return [];

  const cubIds = masterRows.map((r: any) => r.cub_id);

  const { data: cubs, error } = await supabase
    .from('cubs')
    .select(`*, master_cubs(cub_first_name, cub_last_name, parent_first_name, parent_last_name, parent_phone, parent_email, parent_whatsapp)`)
    .in('cub_id', cubIds);

  if (error || !cubs) return [];

  return cubs.map((row: any) => ({
    ...row,
    cub_first_name: row.master_cubs?.cub_first_name ?? '',
    cub_last_name: row.master_cubs?.cub_last_name ?? '',
    parent_first_name: row.master_cubs?.parent_first_name ?? '',
    parent_last_name: row.master_cubs?.parent_last_name ?? '',
    parent_phone: row.master_cubs?.parent_phone ?? '',
    parent_email: row.master_cubs?.parent_email ?? '',
    parent_whatsapp: row.master_cubs?.parent_whatsapp ?? '',
    master_cubs: undefined,
  })) as any[];
}
