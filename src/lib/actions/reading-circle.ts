'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath, unstable_cache } from 'next/cache';
import type { ReadingCircle, PendingSignup, Cub } from '@/lib/types';
import { z } from 'zod';
import { computeRCCategory, sortRCSessions, isBareDaySession, normalizeSessionName } from '@/lib/utils/rc';
import { recomputeOrientationStage, getNearestDateForDay } from '@/lib/utils/orientation';
import { enrichPendingParentNames } from '@/lib/utils/enrichSignups';
import {
  DEFAULT_RC_SESSIONS_LOWER,
  DEFAULT_RC_SESSIONS_UPPER,
  DEFAULT_RC_SESSION_OPTIONS,
  type SessionConfig
} from '@/lib/constants/forms';

// ─── Get Available RC Sessions (Cached) ─────────────────────────
// Combines admin settings (forms_rc_sessions_lower, forms_rc_sessions_upper)
// with distinct sessions currently assigned to cubs in reading_circle.
// Cached for 5 minutes (300s) to eliminate repeated database round-trips.
const getCachedRCSessions = unstable_cache(
  async () => {
    const supabase = createAdminClient();

    // 1. Fetch sessions from app_config
    const { data: configRows } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', ['forms_rc_sessions_lower', 'forms_rc_sessions_upper', 'forms_rc_grade_mapping']);

    const cfg: Record<string, string> = {};
    (configRows ?? []).forEach((r: any) => { cfg[r.key] = r.value; });

    const sessionsSet = new Set<string>();

    const parseSessions = (key: string, fallback: SessionConfig[]): SessionConfig[] => {
      try {
        const arr = JSON.parse(cfg[key] || '');
        if (Array.isArray(arr) && arr.length > 0) return arr;
      } catch {}
      return fallback;
    };

    const lower = parseSessions('forms_rc_sessions_lower', DEFAULT_RC_SESSIONS_LOWER);
    const upper = parseSessions('forms_rc_sessions_upper', DEFAULT_RC_SESSIONS_UPPER);

    lower.forEach(s => {
      if (s.day && s.startTime && s.endTime) {
        sessionsSet.add(normalizeSessionName(`${s.day} ${s.startTime} – ${s.endTime}`));
      }
    });

    upper.forEach(s => {
      if (s.day && s.startTime && s.endTime) {
        sessionsSet.add(normalizeSessionName(`${s.day} ${s.startTime} – ${s.endTime}`));
      }
    });

    // Check grade mapping for any custom session strings
    if (cfg['forms_rc_grade_mapping']) {
      try {
        const mapping = JSON.parse(cfg['forms_rc_grade_mapping']);
        if (Array.isArray(mapping)) {
          mapping.forEach((m: any) => {
            const val = m.session || m.sessionDay;
            if (val && !isBareDaySession(val)) {
              sessionsSet.add(normalizeSessionName(val));
            }
          });
        }
      } catch {}
    }

    // 2. Fetch distinct sessions currently assigned to cubs in reading_circle
    const { data: cubRows } = await supabase
      .from('reading_circle')
      .select('selected_session')
      .not('selected_session', 'is', null)
      .neq('selected_session', '');

    (cubRows ?? []).forEach((r: any) => {
      const s = (r.selected_session || '').trim();
      if (s && !isBareDaySession(s)) {
        sessionsSet.add(normalizeSessionName(s));
      }
    });

    if (sessionsSet.size === 0) {
      DEFAULT_RC_SESSION_OPTIONS.forEach(s => sessionsSet.add(normalizeSessionName(s)));
    }

    return sortRCSessions(Array.from(sessionsSet));
  },
  ['rc-available-sessions'],
  { revalidate: 300, tags: ['rc-sessions'] }
);

export async function getAvailableRCSessions(): Promise<string[]> {
  return getCachedRCSessions();
}


// ─── Get Reading Circle Roster ─────────────────────────────────
export async function getReadingCircleRoster(repFilter?: string): Promise<(ReadingCircle & {
  cubs: Pick<Cub, 'cub_first_name' | 'cub_last_name' | 'segment' | 'relationship_owner' | 'parent_first_name' | 'parent_last_name' | 'parent_phone' | 'parent_email'> & {
    sub_status?: string | null;
  };
})[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Reading Circle is a whole-team responsibility — all reps see all cubs.
  // The optional repFilter narrows results only when explicitly set.
  const repFilterValue = repFilter && repFilter !== 'All Reps' ? repFilter : null;

  // 1. Fast path: single-query RPC bypassing PostgREST pagination & nested join overhead
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_reading_circle_roster', {
    p_rep: repFilterValue,
  });

  if (!rpcError && rpcData) {
    return rpcData as any;
  }

  let allData: any[] = [];
  let from = 0;
  const size = 1000;
  let hasMore = true;

  const innerJoin = repFilterValue ? '!inner' : '';
  const selectQuery = `
    *,
    master_cubs${innerJoin}(
      cub_first_name,
      cub_last_name,
      parent_first_name,
      parent_last_name,
      parent_phone,
      parent_email,
      cubs${innerJoin}(relationship_owner, segment, sub_status)
    )
  `;

  while (hasMore) {
    let query = supabase
      .from('reading_circle')
      .select(selectQuery)
      .order('created_at', { ascending: false })
      .range(from, from + size - 1);

    // Push rep filter into SQL — avoids loading the entire roster into memory.
    if (repFilterValue) {
      query = (query as any).eq('master_cubs.cubs.relationship_owner', repFilterValue);
    }
    query = (query as any).eq('master_cubs.cubs.is_archived', false);

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

  const results = (allData ?? []).map((row: any) => ({
    ...row,
    cubs: {
      relationship_owner: row.master_cubs?.cubs?.relationship_owner,
      segment: row.master_cubs?.cubs?.segment,
      sub_status: row.master_cubs?.cubs?.sub_status,
      cub_first_name: row.master_cubs?.cub_first_name,
      cub_last_name: row.master_cubs?.cub_last_name,
      parent_first_name: row.master_cubs?.parent_first_name,
      parent_last_name: row.master_cubs?.parent_last_name,
      parent_phone: row.master_cubs?.parent_phone,
      parent_email: row.master_cubs?.parent_email,
    },
    master_cubs: undefined,
  }));

  // No in-memory filter needed — SQL handles the rep scope above.
  return results;
}

// ─── Get RC Attendance for a specific date + session ──────────
export async function getRCAttendance(attendanceDate: string, session: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data, error } = await supabase
    .from('rc_attendance')
    .select('cub_id, status')
    .eq('attendance_date', attendanceDate)
    .eq('session', session);

  if (error) throw new Error(error.message);
  return (data ?? []) as { cub_id: string; status: string }[];
}

// ─── Get Pending Signups (RC) ──────────────────────────────────
export async function getPendingRCSignups(repFilter?: string): Promise<PendingSignup[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Pending RC signups are visible to the whole team.
  const repFilterValue = repFilter && repFilter !== 'All Reps' ? repFilter : null;

  const { data, error } = await supabase
    .from('pending_signups')
    .select('*')
    .eq('form_source', 'Reading Circle Signup')
    .eq('status', 'Pending')
    .order('timestamp', { ascending: false });

  if (error) throw new Error(error.message);

  let results = data as PendingSignup[];

  // If any signup has a phone number as parent_name or missing parent_name, enrich from master_cubs
  results = await enrichPendingParentNames(supabase, results);

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

// ─── Process Pending Signup (RC) ──────────────────────────────
// Mirrors DashboardWrite.gs confirmPendingSignup() for RC
const ProcessSignupSchema = z.object({
  id: z.number(),
  status: z.enum(['Confirmed', 'Rejected']),
  matched_cub_id: z.string().optional().nullable(),
  selected_session: z.string().optional().nullable(),
  grade: z.string().optional().nullable(),
});

export async function processRCSignup(formData: z.infer<typeof ProcessSignupSchema>) {
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
    const adminDb = createAdminClient();
    const { error: deleteErr } = await adminDb
      .from('pending_signups')
      .delete()
      .eq('id', parsed.data.id);

    if (deleteErr) return { error: deleteErr.message };

    revalidatePath('/reading-circle');
    revalidatePath('/dashboard');
    return { success: true };
  }

  // Status is Confirmed
  const effectiveCubId = (parsed.data.matched_cub_id || pending.matched_cub_id || '').trim();
  if (!effectiveCubId) {
    return { error: 'Please link this signup to a cub before confirming.' };
  }

  const effectiveGrade = (parsed.data.grade !== undefined && parsed.data.grade !== null) ? parsed.data.grade : pending.grade;

  // Load RC config: grade mapping + category names
  const { data: configRows } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', ['forms_rc_grade_mapping', 'forms_rc_category_lower', 'forms_rc_category_upper']);

  const cfg: Record<string, string> = {};
  (configRows ?? []).forEach((r: any) => { cfg[r.key] = r.value; });

  const lowerCategory = cfg['forms_rc_category_lower'] || 'Word Astronauts';
  const upperCategory = cfg['forms_rc_category_upper'] || 'Word Miners';

  // Apply grade mapping: array of { grade: "1", session: "Tuesday 5:00 pm – 5:45 pm" }
  let effectiveSession = parsed.data.selected_session || pending.selected_session || 'Saturday 8:00 am – 8:45 am';
  if (cfg['forms_rc_grade_mapping'] && effectiveGrade) {
    try {
      const mapping: { grade: string; session?: string; sessionDay?: string }[] = JSON.parse(cfg['forms_rc_grade_mapping']);
      const cubGradeNum = parseInt(((effectiveGrade || '').match(/\d+/) ?? ['0'])[0], 10);
      const match = mapping.find(m => parseInt(m.grade, 10) === cubGradeNum);
      if (match) {
        const mappedVal = match.session || match.sessionDay;
        if (mappedVal) effectiveSession = mappedVal;
      }
    } catch { /* ignore parse error */ }
  }

  // Compute RC category using configurable names
  const rcCategory = computeRCCategory(effectiveGrade, effectiveSession, lowerCategory, upperCategory);
  const session = effectiveSession;

  const { error: confirmErr } = await supabase.rpc('confirm_rc_signup', {
    p_pending_id: parsed.data.id,
    p_cub_id: effectiveCubId,
    p_session: session,
    p_category: rcCategory,
    p_grade: effectiveGrade ?? '',
    p_user_id: user.id,
  });

  if (confirmErr) return { error: confirmErr.message };

  revalidatePath('/reading-circle');
  revalidatePath('/orientation');
  revalidatePath('/directory');
  revalidatePath('/dashboard');
  return { success: true };
}

// ─── Submit RC Attendance ──────────────────────────────────────
// Mirrors DashboardWrite.gs submitRCAttendance()
const RCAttendanceSchema = z.object({
  attendance_date: z.string().min(1, 'Date is required'),
  session: z.string().min(1, 'Session is required'),
  records: z.array(z.object({
    cub_id: z.string(),
    status: z.enum(['Present', 'Absent', 'Rescheduled']),
  })),
});

export async function submitRCAttendance(formData: z.infer<typeof RCAttendanceSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = RCAttendanceSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { attendance_date, session, records } = parsed.data;
  if (records.length === 0) return { error: 'No records to submit' };

  // 1. Upsert attendance records (idempotent via unique constraint on cub_id+date)
  const { error: upsertErr } = await supabase
    .from('rc_attendance')
    .upsert(
      records.map(r => ({
        cub_id: r.cub_id,
        session,
        attendance_date,
        status: r.status,
        recorded_by: user.id,
      })),
      { onConflict: 'cub_id,attendance_date' }
    );

  if (upsertErr) return { error: upsertErr.message };

  // Stats (no_present, last_attendance_date) on reading_circle and cubs
  // are atomically recalculated and synced via DB trigger trg_rc_attendance_rollup

  revalidatePath('/reading-circle');
  return { success: true, count: records.length };
}

// ─── Change Cub RC Session ─────────────────────────────────────
// Mirrors DashboardWrite.gs changeCubRCSession()
const ChangeSessionSchema = z.object({
  cub_id: z.string().min(1),
  new_session: z.string().min(1, 'Session is required'),
});

export async function changeCubRCSession(formData: z.infer<typeof ChangeSessionSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = ChangeSessionSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { cub_id, new_session } = parsed.data;

  // Fetch grade from master_cubs to compute new category
  const { data: master, error: masterErr } = await supabase
    .from('master_cubs')
    .select('grade')
    .eq('cub_id', cub_id)
    .single();

  if (masterErr || !master) return { error: 'Cub not found' };

  // Load category names from app_config (now readable via authenticated client)
  const { data: configRows } = await supabase
    .from('app_config')
    .select('key, value')
    .in('key', ['forms_rc_category_lower', 'forms_rc_category_upper']);

  const cfg: Record<string, string> = {};
  (configRows ?? []).forEach((r: any) => { cfg[r.key] = r.value; });

  const lowerCategory = cfg['forms_rc_category_lower'] || 'Word Astronauts';
  const upperCategory = cfg['forms_rc_category_upper'] || 'Word Miners';

  const newCategory = computeRCCategory(master.grade, new_session, lowerCategory, upperCategory);

  // Sync orientation journey — recompute stage after RC session change
  const { data: orientationRow } = await supabase
    .from('orientation')
    .select('*')
    .eq('cub_id', cub_id)
    .maybeSingle();

  const rcDate = getNearestDateForDay(new_session);
  let stageResult: any = null;

  if (orientationRow) {
    stageResult = recomputeOrientationStage({
      invited_status: orientationRow.invited_status,
      booked_status: orientationRow.booked_status,
      attended_status: orientationRow.attended_status,
      first_win_status: orientationRow.first_win_status,
      rc_selected_status: 'Completed',
    });
  }

  // Atomically update reading_circle, orientation, and cubs in single transaction
  const { error: atomicErr } = await supabase.rpc('change_rc_session_atomic', {
    p_cub_id: cub_id,
    p_new_session: new_session,
    p_new_category: newCategory,
    p_rc_date: rcDate,
    p_stage: stageResult?.stage ?? null,
    p_stage_status: stageResult?.stage_status ?? null,
    p_next_stage: stageResult?.next_stage ?? null,
    p_completion_date: stageResult?.completion_date ?? null,
  });

  if (atomicErr) return { error: atomicErr.message };

  revalidatePath('/reading-circle');
  revalidatePath('/orientation');
  revalidatePath('/directory');
  revalidatePath('/dashboard');
  return { success: true, newCategory };
}

