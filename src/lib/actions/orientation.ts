'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Orientation, PendingSignup, Cub } from '@/lib/types';
import { z } from 'zod';
import { recomputeOrientationStage, autoSetDates, getNearestDateForDay } from '@/lib/utils/orientation';
import { computeRCCategory } from '@/lib/utils/rc';

// ─── Get Orientation Master Journey ─────────────────────────────
export async function getOrientationMaster(repFilter?: string): Promise<(Orientation & {
  cubs: Pick<Cub, 'cub_first_name' | 'cub_last_name' | 'segment' | 'relationship_owner' | 'parent_first_name' | 'parent_last_name' | 'parent_phone' | 'parent_email'> & {
    sub_status?: string | null;
    date_onboarded?: string | null;
    cumulative_points?: number;
    last_reading_activity?: string | null;
    reading_circle_category?: string | null;
  };
})[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Orientation is a whole-team responsibility — all reps see all cubs.
  // The optional repFilter is used only when an admin (or rep) explicitly filters by rep.
  const repFilterValue = repFilter && repFilter !== 'All Reps' ? repFilter : null;

  let allData: any[] = [];
  let from = 0;
  const size = 1000;
  let hasMore = true;

  while (hasMore) {
    const query = supabase
      .from('orientation')
      .select(`
        *,
        master_cubs(
          cub_first_name,
          cub_last_name,
          parent_first_name,
          parent_last_name,
          parent_phone,
          parent_email,
          date_onboarded,
          cubs(
            relationship_owner,
            segment,
            sub_status,
            date_onboarded,
            cumulative_points,
            last_reading_activity,
            reading_circle_category
          )
        )
      `)
      .order('created_at', { ascending: false })
      .range(from, from + size - 1);

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

  let results = (allData ?? []).map((row: any) => ({
    ...row,
    cubs: {
      relationship_owner: row.master_cubs?.cubs?.relationship_owner,
      segment: row.master_cubs?.cubs?.segment,
      sub_status: row.master_cubs?.cubs?.sub_status,
      date_onboarded: row.master_cubs?.cubs?.date_onboarded ?? row.master_cubs?.date_onboarded,
      cumulative_points: row.master_cubs?.cubs?.cumulative_points ?? 0,
      last_reading_activity: row.master_cubs?.cubs?.last_reading_activity,
      reading_circle_category: row.master_cubs?.cubs?.reading_circle_category,
      cub_first_name: row.master_cubs?.cub_first_name,
      cub_last_name: row.master_cubs?.cub_last_name,
      parent_first_name: row.master_cubs?.parent_first_name,
      parent_last_name: row.master_cubs?.parent_last_name,
      parent_phone: row.master_cubs?.parent_phone,
      parent_email: row.master_cubs?.parent_email,
    },
    master_cubs: undefined,
  }));

  // Optional rep filter — applied client-side to preserve full dataset in memory.
  if (repFilterValue) {
    results = results.filter(r => r.cubs.relationship_owner === repFilterValue);
  }

  return results;
}

// ─── Get Pending Signups (Orientation) ─────────────────────────
export async function getPendingOrientationSignups(repFilter?: string): Promise<PendingSignup[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Pending orientation signups are visible to the whole team.
  const repFilterValue = repFilter && repFilter !== 'All Reps' ? repFilter : null;

  const { data, error } = await supabase
    .from('pending_signups')
    .select('*')
    .eq('form_source', 'Orientation Signup')
    .eq('status', 'Pending')
    .order('timestamp', { ascending: false });

  if (error) throw new Error(error.message);

  let results = data as PendingSignup[];

  // If any signup has a phone number as parent_name or missing parent_name, enrich from master_cubs
  const needsParentName = results.filter(
    r => !r.parent_name || r.parent_name === r.parent_phone || /^[\d\s+\-()]{6,}$/.test(r.parent_name.trim())
  );
  if (needsParentName.length > 0) {
    const cubIds = needsParentName.map(r => r.matched_cub_id).filter(Boolean) as string[];
    const phones = needsParentName.map(r => r.parent_phone).filter(Boolean);

    const parentMapByCubId = new Map<string, string>();
    const parentMapByPhone = new Map<string, string>();

    if (cubIds.length > 0) {
      const { data: cubMatches } = await supabase
        .from('master_cubs')
        .select('cub_id, parent_first_name, parent_last_name')
        .in('cub_id', cubIds);
      (cubMatches || []).forEach(c => {
        const fullName = `${c.parent_first_name || ''} ${c.parent_last_name || ''}`.trim();
        if (fullName) parentMapByCubId.set(c.cub_id, fullName);
      });
    }

    if (phones.length > 0) {
      const { data: phoneMatches } = await supabase
        .from('master_cubs')
        .select('parent_phone, parent_first_name, parent_last_name')
        .in('parent_phone', phones);
      (phoneMatches || []).forEach(p => {
        const fullName = `${p.parent_first_name || ''} ${p.parent_last_name || ''}`.trim();
        if (fullName && p.parent_phone) parentMapByPhone.set(p.parent_phone, fullName);
      });
    }

    results = results.map(r => {
      const isBadName = !r.parent_name || r.parent_name === r.parent_phone || /^[\d\s+\-()]{6,}$/.test(r.parent_name.trim());
      if (!isBadName) return r;
      const resolved = (r.matched_cub_id && parentMapByCubId.get(r.matched_cub_id)) ||
                       (r.parent_phone && parentMapByPhone.get(r.parent_phone));
      return resolved ? { ...r, parent_name: resolved } : r;
    });
  }

  if (repFilterValue) {
    const { data: cubs } = await supabase
      .from('cubs')
      .select('cub_id')
      .eq('relationship_owner', repFilterValue);
    const ownerCubIds = new Set((cubs ?? []).map((c: any) => c.cub_id));
    results = results.filter(r => {
      if (!r.matched_cub_id) return false;
      return ownerCubIds.has(r.matched_cub_id);
    });
  }

  return results;
}

// ─── Process Pending Orientation Signup ────────────────────────
// Mirrors DashboardWrite.gs confirmPendingSignup() for Orientation
const ProcessSignupSchema = z.object({
  id: z.number(),
  status: z.enum(['Confirmed', 'Rejected']),
  matched_cub_id: z.string().optional().nullable(),
  selected_session: z.string().optional().nullable(),
});

export async function processOrientationSignup(formData: z.infer<typeof ProcessSignupSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = ProcessSignupSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data: pending, error: fetchErr } = await supabase
    .from('pending_signups')
    .select('*')
    .eq('id', parsed.data.id)
    .single();

  if (fetchErr || !pending) return { error: fetchErr?.message || 'Pending record not found' };

  if (parsed.data.status === 'Rejected') {
    const { error: deleteErr } = await supabase
      .from('pending_signups')
      .delete()
      .eq('id', parsed.data.id);

    if (deleteErr) return { error: deleteErr.message };

    revalidatePath('/orientation');
    revalidatePath('/dashboard');
    return { success: true };
  }

  // Status is Confirmed
  const effectiveCubId = (parsed.data.matched_cub_id || pending.matched_cub_id || '').trim();
  if (!effectiveCubId) {
    return { error: 'Please link this signup to a cub before confirming.' };
  }

  const effectiveSession = parsed.data.selected_session || pending.selected_session || 'Sunday';
  const { error: confirmErr } = await supabase.rpc('confirm_orientation_signup', {
    p_pending_id: parsed.data.id,
    p_cub_id: effectiveCubId,
    p_session: effectiveSession,
    p_user_id: user.id,
  });

  if (confirmErr) return { error: confirmErr.message };

  revalidatePath('/orientation');
  revalidatePath('/dashboard');
  return { success: true };
}

// ─── Update Cub Journey ────────────────────────────────────────
// Mirrors DashboardWrite.gs updateCubJourney() — full block update +
// stage recomputation + optimistic locking + cubs propagation
const UpdateJourneySchema = z.object({
  cub_id: z.string().min(1),
  version_ts: z.number(),
  updates: z.object({
    invited_status: z.enum(['Yes', 'No']).optional().nullable(),
    booked_status: z.enum(['Completed', 'Pending']).optional().nullable(),
    booked_date: z.string().optional().nullable(),
    attended_status: z.enum(['Present', 'Absent', 'Rescheduled']).optional().nullable(),
    attended_date: z.string().optional().nullable(),
    attended_feedback: z.string().optional().nullable(),
    first_win_status: z.enum(['Yes', 'No']).optional().nullable(),
    first_win_date: z.string().optional().nullable(),
    first_win_feedback: z.string().optional().nullable(),
    rc_selected_status: z.enum(['Pending', 'Completed']).optional().nullable(),
    rc_selected_date: z.string().optional().nullable(),
    rc_selected_feedback: z.string().optional().nullable(),
    rc_session: z.string().optional().nullable(),
    session: z.string().optional().nullable(),
  }),
});

export async function updateCubJourney(formData: z.infer<typeof UpdateJourneySchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = UpdateJourneySchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { cub_id, version_ts, updates } = parsed.data;
  const { rc_session, ...rawOrientationUpdates } = updates;

  // 1. Fetch current orientation row for optimistic lock check + merge
  const { data: current, error: fetchErr } = await supabase
    .from('orientation')
    .select('*')
    .eq('cub_id', cub_id)
    .single();

  if (fetchErr || !current) return { error: 'Orientation record not found for this cub' };

  // 2. Optimistic locking — reject if version has changed
  if (current.version_ts !== version_ts) {
    return { error: 'Conflict: this record was modified by another user. Please refresh and try again.' };
  }

  // 3. If a Reading Circle session is being selected, upsert reading_circle inline
  //    (avoids a cross-action import cycle with reading-circle.ts)
  if (rc_session && rc_session.trim() !== '') {
    const trimmedSession = rc_session.trim();

    // Load grade from master_cubs + category config
    const [{ data: master }, { data: configRows }] = await Promise.all([
      supabase.from('master_cubs').select('grade').eq('cub_id', cub_id).single(),
      supabase.from('app_config').select('key, value')
        .in('key', ['forms_rc_category_lower', 'forms_rc_category_upper']),
    ]);

    const cfg: Record<string, string> = {};
    (configRows ?? []).forEach((r: any) => { cfg[r.key] = r.value; });
    const lowerCategory = cfg['forms_rc_category_lower'] || 'Word Astronauts';
    const upperCategory = cfg['forms_rc_category_upper'] || 'Word Miners';
    const rcCategory = computeRCCategory(master?.grade ?? null, trimmedSession, lowerCategory, upperCategory);

    // Upsert reading_circle row
    await supabase.from('reading_circle').upsert(
      { cub_id, selected_session: trimmedSession, rc_category: rcCategory },
      { onConflict: 'cub_id' }
    );

    // Propagate category to cubs
    await supabase.from('cubs')
      .update({ reading_circle_category: rcCategory })
      .eq('cub_id', cub_id);

    // Mark RC selection in pending updates
    rawOrientationUpdates.rc_selected_status = 'Completed';
    if (!rawOrientationUpdates.rc_selected_date && !current.rc_selected_date) {
      rawOrientationUpdates.rc_selected_date = getNearestDateForDay(trimmedSession);
    }
  }

  // 4. Auto-set dates when a status is first set — pass current DB row so existing dates are preserved
  const withDates = autoSetDates(
    {
      session: rawOrientationUpdates.session !== undefined ? rawOrientationUpdates.session : current.session,
      rc_session: rc_session || null,
      ...rawOrientationUpdates,
    },
    {
      booked_date: current.booked_date,
      attended_date: current.attended_date,
      first_win_date: current.first_win_date,
      rc_selected_date: current.rc_selected_date,
    }
  );

  // 5. Merge current + updates to compute new stage
  //    Pass existing_completion_date so we never overwrite the original date
  const merged = { ...current, ...withDates };
  const stageResult = recomputeOrientationStage({
    invited_status: merged.invited_status,
    booked_status: merged.booked_status,
    attended_status: merged.attended_status,
    first_win_status: merged.first_win_status,
    rc_selected_status: merged.rc_selected_status,
    existing_completion_date: current.completion_date,
  });

  // 6. Write atomic CAS update — DB trigger auto-increments version_ts
  const updatePayload: Record<string, any> = {
    ...withDates,
    stage: stageResult.stage,
    stage_status: stageResult.stage_status,
    next_stage: stageResult.next_stage,
    // Only write completion_date if it's newly set; preserve existing value otherwise
    completion_date: stageResult.completion_date ?? current.completion_date ?? null,
  };
  delete updatePayload.rc_session;
  if (rawOrientationUpdates.session !== undefined) {
    updatePayload.session = rawOrientationUpdates.session || null;
  }

  const { data: updated, error: updateErr } = await supabase
    .from('orientation')
    .update(updatePayload)
    .eq('cub_id', cub_id)
    .eq('version_ts', version_ts)
    .select('version_ts');

  if (updateErr) return { error: updateErr.message };
  if (!updated || updated.length === 0) {
    return { error: 'Conflict: this record was modified by another user. Please refresh and try again.' };
  }

  // 6. Propagate to cubs table
  const { error: cubsErr } = await supabase
    .from('cubs')
    .update({
      orientation_stage: stageResult.stage,
      orientation_stage_status: stageResult.stage_status,
      orientation_next_stage: stageResult.next_stage,
      orientation_completion_date: stageResult.completion_date,
    })
    .eq('cub_id', cub_id);

  if (cubsErr) return { error: cubsErr.message };

  revalidatePath('/orientation');
  revalidatePath('/directory');
  revalidatePath('/dashboard');
  return { success: true, stage: stageResult };
}

// ─── Change Cub Orientation Session ────────────────────────────
const ChangeOrientationSessionSchema = z.object({
  cub_id: z.string().min(1),
  new_session: z.enum(['Tuesday', 'Sunday']),
});

export async function changeCubOrientationSession(formData: z.infer<typeof ChangeOrientationSessionSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = ChangeOrientationSessionSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from('orientation')
    .update({ session: parsed.data.new_session })
    .eq('cub_id', parsed.data.cub_id);

  if (error) return { error: error.message };

  revalidatePath('/orientation');
  return { success: true };
}

// ─── Orientation Scorecard Metrics ─────────────────────────────
// Calls the canonical DB function get_orientation_scorecard_metrics
export interface OrientationScorecardMetrics {
  total_eligible: number;
  missing_onboarding_date: number;
  window_elapsed: number;
  in_window: number;
  completed_within_7d: number;
  completed_late: number;
  missed_target: number;
  completion_rate: number;
  awaiting_invitation: number;
  invited_not_booked: number;
  booked_confirmed: number;
  attended: number;
  completed: number;
  pending_rc: number;
}

export async function getOrientationScorecardMetrics(
  startDate?: string | null,
  endDate?: string | null,
  repFilter?: string | null
): Promise<OrientationScorecardMetrics> {
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
  const effectiveRep = isAdmin
    ? (repFilter && repFilter !== 'All Reps' ? repFilter : null)
    : effectiveRepName;

  const { data, error } = await supabase.rpc('get_orientation_scorecard_metrics', {
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_rep: effectiveRep || null,
  });

  if (error) throw new Error(error.message);

  return (data as OrientationScorecardMetrics) ?? {
    total_eligible: 0, missing_onboarding_date: 0, window_elapsed: 0,
    in_window: 0, completed_within_7d: 0, completed_late: 0, missed_target: 0,
    completion_rate: 0, awaiting_invitation: 0, invited_not_booked: 0,
    booked_confirmed: 0, attended: 0, completed: 0, pending_rc: 0,
  };
}

// ─── Gen. Comm Cubs Pending RC Selection ──────────────────────
// Returns active Gen. Comm cubs who have no reading circle membership yet,
// with their name and parent details. Newest onboarded first.
export async function getGenCommPendingRC(repFilter?: string): Promise<{
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_phone: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  date_onboarded: string | null;
  orientation_stage: string | null;
  orientation_completion_date: string | null;
  relationship_owner: string;
}[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Gen. Comm pending RC — whole team sees all cubs; repFilter narrows when explicitly set.
  const repFilterValue = repFilter && repFilter !== 'All Reps' ? repFilter : null;

  // Fetch enrolled RC cub IDs and all Gen. Comm cubs in parallel
  const [rcResult, cubsResult] = await Promise.all([
    supabase.from('reading_circle').select('cub_id').not('selected_session', 'is', null).neq('selected_session', ''),
    (() => {
      let q = supabase
        .from('cubs')
        .select(`
          cub_id, date_onboarded, orientation_stage, orientation_completion_date, relationship_owner,
          master_cubs(cub_first_name, cub_last_name, parent_first_name, parent_last_name, parent_phone)
        `)
        .eq('segment', 'Gen. Comm')
        .in('sub_status', ['active', 'almost expiring'])
        .order('date_onboarded', { ascending: false });

      if (repFilterValue) q = q.eq('relationship_owner', repFilterValue);
      return q;
    })(),
  ]);

  if (cubsResult.error) throw new Error(cubsResult.error.message);

  const rcSet = new Set((rcResult.data ?? []).map((r: any) => r.cub_id));

  return (cubsResult.data ?? [])
    .filter((c: any) => !rcSet.has(c.cub_id))
    .map((c: any) => ({
      cub_id: c.cub_id,
      cub_first_name: c.master_cubs?.cub_first_name ?? 'Unknown',
      cub_last_name: c.master_cubs?.cub_last_name ?? '',
      parent_phone: c.master_cubs?.parent_phone ?? null,
      parent_first_name: c.master_cubs?.parent_first_name ?? null,
      parent_last_name: c.master_cubs?.parent_last_name ?? null,
      date_onboarded: c.date_onboarded,
      orientation_stage: c.orientation_stage,
      orientation_completion_date: c.orientation_completion_date,
      relationship_owner: c.relationship_owner,
    }));
}

