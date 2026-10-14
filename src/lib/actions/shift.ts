'use server';

import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
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

  const profile = await getProfile(supabase, user.id);

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
    const deadlineDate = a.action_deadline ? a.action_deadline.slice(0, 10) : null;
    const isOverdue =
      a.action_status === 'Overdue' ||
      a.overdue_status === 'Yes' ||
      (deadlineDate !== null && deadlineDate < todayStr);

    if (isOverdue) {
      overdue.push(a);
    } else if (deadlineDate === todayStr) {
      today.push(a);
    } else {
      future.push(a);
    }
  }

  return { overdue, today, future };
}
