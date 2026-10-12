'use server';

import { createClient } from '@/lib/supabase/server';
import type { DashboardStats, Action, Cub, Family } from '@/lib/types';

// ─── Dashboard Stats ───────────────────────────────────────────
export async function getDashboardStats(repFilter?: string): Promise<DashboardStats> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, sheet_rep_name')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  
  // Effective name: admin acting as rep via filter, or own name
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilterByRep = !isAdmin || isFilteredRep;

  // Total Cubs
  let cubsQuery = supabase.from('cubs').select('sub_status, flag, sub_end_date', { count: 'exact' });
  if (shouldFilterByRep) cubsQuery = cubsQuery.eq('relationship_owner', effectiveName!);
  const { data: cubsData, count: totalCubs } = await cubsQuery;

  let activeSubs = 0, expiredSubs = 0, almostExpiringWeek = 0, almostExpiringMonth = 0, flaggedCubs = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);
  const nextMonth = new Date(today); nextMonth.setMonth(today.getMonth() + 1);

  for (const cub of (cubsData ?? [])) {
    if (cub.sub_status === 'active') activeSubs++;
    else if (cub.sub_status === 'expired') expiredSubs++;
    else if (cub.sub_status === 'almost expiring') {
      activeSubs++; // Active cubs includes almost expiring
      const endDate = cub.sub_end_date ? new Date(cub.sub_end_date) : null;
      if (endDate) {
        if (endDate >= today && endDate <= nextWeek) almostExpiringWeek++;
        if (endDate >= today && endDate <= nextMonth) almostExpiringMonth++;
      }
    }
    if (cub.flag) flaggedCubs++;
  }

  // Total Families
  let famQuery = supabase.from('families').select('id', { count: 'exact' });
  if (shouldFilterByRep) famQuery = famQuery.eq('relationship_owner', effectiveName!);
  const { count: totalParents } = await famQuery;

  // Actions counts
  let actQuery = supabase.from('actions').select('action_status');
  if (shouldFilterByRep) actQuery = actQuery.eq('handled_by', effectiveName!);
  const { data: actionsData } = await actQuery;
  let pendingActionsCount = 0, completedActionsCount = 0;
  for (const a of (actionsData ?? [])) {
    if (a.action_status === 'Completed') completedActionsCount++;
    else pendingActionsCount++;
  }

  // Pending Signups
  const { count: rcPendingCount } = await supabase
    .from('pending_signups')
    .select('id', { count: 'exact' })
    .eq('status', 'Pending')
    .eq('form_source', 'Reading Circle Signup');

  const { count: orientationPendingCount } = await supabase
    .from('pending_signups')
    .select('id', { count: 'exact' })
    .eq('status', 'Pending')
    .eq('form_source', 'Orientation Signup');

  return {
    totalCubs: totalCubs ?? 0,
    totalParents: totalParents ?? 0,
    activeSubs,
    expiredSubs,
    almostExpiringWeek,
    almostExpiringMonth,
    flaggedCubs,
    pendingActionsCount,
    completedActionsCount,
    rcPendingCount: rcPendingCount ?? 0,
    orientationPendingCount: orientationPendingCount ?? 0,
  };
}

// ─── Dashboard Actions ─────────────────────────────────────────
export async function getDashboardActions(repFilter?: string): Promise<Action[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : profile?.full_name;
  const shouldFilter = !isAdmin || isFilteredRep;

  let query = supabase
    .from('actions')
    .select('*')
    .not('action_status', 'in', '("Completed","Cancelled")')
    .order('action_deadline', { ascending: true, nullsFirst: false });

  if (shouldFilter) query = query.eq('handled_by', effectiveName!);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Action[]) ?? [];
}

// ─── Dashboard Cubs ────────────────────────────────────────────
export async function getDashboardCubs(repFilter?: string): Promise<(Cub & { cub_first_name: string; cub_last_name: string })[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : profile?.full_name;
  const shouldFilter = !isAdmin || isFilteredRep;

  // Join master_cubs for name/parent fields
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
        parent_email
      )
    `)
    .order('relationship_owner', { ascending: true });

  if (shouldFilter) query = query.eq('relationship_owner', effectiveName!);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Flatten the joined data
  return (data ?? []).map((row: any) => ({
    ...row,
    cub_first_name: row.master_cubs?.cub_first_name ?? '',
    cub_last_name: row.master_cubs?.cub_last_name ?? '',
    parent_first_name: row.master_cubs?.parent_first_name ?? '',
    parent_last_name: row.master_cubs?.parent_last_name ?? '',
    parent_phone: row.master_cubs?.parent_phone ?? '',
    parent_email: row.master_cubs?.parent_email ?? '',
    master_cubs: undefined, // clean up nested object
  }));
}

// ─── Dashboard Families ────────────────────────────────────────
export async function getDashboardFamilies(repFilter?: string): Promise<Family[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : profile?.full_name;
  const shouldFilter = !isAdmin || isFilteredRep;

  let query = supabase
    .from('families')
    .select('*')
    .order('parent_last_name', { ascending: true });

  if (shouldFilter) query = query.eq('relationship_owner', effectiveName!);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Family[]) ?? [];
}

// ─── Get all rep names (dynamic from Directory) ─────────────────
export async function getAllReps(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_unique_reps');
  
  if (error || !data) return [];
  
  return data
    .map((d: any) => d.relationship_owner)
    .filter(Boolean)
    .sort((a: string, b: string) => a.localeCompare(b));
}

// ─── Get Dropdowns ─────────────────────────────────────────────
export async function getDropdowns() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('config_dropdowns')
    .select('category, value, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) console.error("getDropdowns ERROR:", error);

  const grouped: Record<string, string[]> = {};
  for (const item of (data ?? [])) {
    if (!grouped[item.category]) grouped[item.category] = [];
    // We will override handled_by entirely below
    if (item.category !== 'handled_by') {
      grouped[item.category].push(item.value);
    }
  }

  // Automatically populate handled_by with unique Relationship Owners from Cubs
  grouped['handled_by'] = await getAllReps();

  return grouped;
}
