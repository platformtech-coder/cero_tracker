'use server';

import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
import type { Action } from '@/lib/types';
import { format } from 'date-fns';

// ─── Get Shift Actions (Cover Page) ───────────────────────────
// Shift Actions = cross-rep view of the entire team's pending work.
// - Admins see ALL active actions (or filtered to one rep).
// - Reps see actions for OTHER reps only (their own actions live in Engagements tab).
export async function getShiftActions(repFilter?: string): Promise<{ overdue: Action[]; today: Action[]; future: Action[] }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  const isAdmin = profile?.role === 'admin';
  const myRepName = profile?.sheet_rep_name || profile?.full_name || null;

  // Admin filtering to a specific rep
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';

  let query = supabase
    .from('actions')
    .select(`
      *,
      master_cubs(cubs(sub_status, orientation_stage, flag, relationship_owner))
    `)
    .not('action_status', 'in', '("Completed","Cancelled")')
    .order('action_deadline', { ascending: true, nullsFirst: false });

  if (isFilteredRep) {
    // Admin explicitly selected a rep — show only that rep's actions
    query = query.eq('handled_by', repFilter!);
  } else if (!isAdmin && myRepName) {
    // Rep: exclude their own actions (those live in the Engagements tab)
    query = query.neq('handled_by', myRepName);
  }
  // Admin with no filter: see everything

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let actions = (data || []).map((row: any) => {
    const cub = Array.isArray(row.master_cubs?.cubs) ? row.master_cubs.cubs[0] : row.master_cubs?.cubs;
    return {
      ...row,
      sub_status: cub?.sub_status,
      orientation_stage: cub?.orientation_stage,
      flag: cub?.flag,
      relationship_owner: cub?.relationship_owner,
      master_cubs: undefined,
    };
  });

  // Rep: strictly exclude their own actions (matching either handled_by or cub relationship_owner)
  if (!isAdmin && myRepName) {
    const myName = myRepName.toLowerCase();
    actions = actions.filter((a: Action) => {
      const hb = (a.handled_by || '').toLowerCase();
      const ro = (a.relationship_owner || '').toLowerCase();
      return hb !== myName && ro !== myName;
    });
  }

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
