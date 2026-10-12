'use server';

import { createClient } from '@/lib/supabase/server';
import type { Action } from '@/lib/types';
import { format } from 'date-fns';

// ─── Get Shift Actions (Cover Page) ───────────────────────────
// Mirrors DashboardData.gs getCoverData():
// ALL authenticated users see ALL active actions across ALL reps.
// This is the shift-wide view — reps need cross-rep visibility here.
// Admin can also filter by specific rep.
export async function getShiftActions(repFilter?: string): Promise<{ overdue: Action[]; today: Action[]; future: Action[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  // Only filter by rep when admin explicitly selects one
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';

  let query = supabase
    .from('actions')
    .select('*')
    .not('action_status', 'in', '("Completed","Cancelled")')
    .order('action_deadline', { ascending: true, nullsFirst: false });

  // If admin filtered to a specific rep, apply that filter.
  // Reps see ALL actions (cross-rep cover page, original behaviour).
  if (isFilteredRep) {
    query = query.eq('handled_by', repFilter!);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const actions = (data as Action[]) ?? [];
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const overdue: Action[] = [];
  const today: Action[] = [];
  const future: Action[] = [];

  for (const a of actions) {
    if (a.overdue_status === 'Yes') {
      overdue.push(a);
    } else if (a.action_deadline && a.action_deadline.startsWith(todayStr)) {
      today.push(a);
    } else if (a.action_deadline) {
      future.push(a);
    }
  }

  return { overdue, today, future };
}
