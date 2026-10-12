'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ReadingCircle, PendingSignup, Cub } from '@/lib/types';
import { z } from 'zod';
import { computeRCCategory, sortRCSessions, isBareDaySession } from '@/lib/utils/rc';
import { recomputeOrientationStage, getNearestDateForDay } from '@/lib/utils/orientation';
import {
  DEFAULT_RC_SESSIONS_LOWER,
  DEFAULT_RC_SESSIONS_UPPER,
  DEFAULT_RC_SESSION_OPTIONS,
  type SessionConfig
} from '@/lib/constants/forms';

// ─── Get Available RC Sessions ─────────────────────────────────
// Combines admin settings (forms_rc_sessions_lower, forms_rc_sessions_upper)
// with distinct sessions currently assigned to cubs in reading_circle.
export async function getAvailableRCSessions(): Promise<string[]> {
  const supabase = await createClient();

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
      sessionsSet.add(`${s.day} ${s.startTime} – ${s.endTime}`.trim());
    }
  });

  upper.forEach(s => {
    if (s.day && s.startTime && s.endTime) {
      sessionsSet.add(`${s.day} ${s.startTime} – ${s.endTime}`.trim());
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
            sessionsSet.add(val.trim());
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
      sessionsSet.add(s);
    }
  });

  if (sessionsSet.size === 0) {
    DEFAULT_RC_SESSION_OPTIONS.forEach(s => sessionsSet.add(s));
  }

  return sortRCSessions(Array.from(sessionsSet));
}


// ─── Get Reading Circle Roster ─────────────────────────────────
export async function getReadingCircleRoster(repFilter?: string): Promise<(ReadingCircle & {
  cubs: Pick<Cub, 'cub_first_name' | 'cub_last_name' | 'segment' | 'relationship_owner' | 'parent_first_name' | 'parent_last_name' | 'parent_phone' | 'parent_email'>
})[]> {
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
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilter = !isAdmin || isFilteredRep;

  const query = supabase
    .from('reading_circle')
    .select(`
      *,
      master_cubs(
        cub_first_name,
        cub_last_name,
        parent_first_name,
        parent_last_name,
        parent_phone,
        parent_email,
        cubs(relationship_owner, segment)
      )
    `)
    .order('created_at', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let results = (data ?? []).map((row: any) => ({
    ...row,
    cubs: {
      relationship_owner: row.master_cubs?.cubs?.relationship_owner,
      segment: row.master_cubs?.cubs?.segment,
      cub_first_name: row.master_cubs?.cub_first_name,
      cub_last_name: row.master_cubs?.cub_last_name,
      parent_first_name: row.master_cubs?.parent_first_name,
      parent_last_name: row.master_cubs?.parent_last_name,
      parent_phone: row.master_cubs?.parent_phone,
      parent_email: row.master_cubs?.parent_email,
    },
    master_cubs: undefined,
  }));

  if (shouldFilter) {
    results = results.filter(r => r.cubs.relationship_owner === effectiveName);
  }

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, sheet_rep_name')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilter = !isAdmin || isFilteredRep;

  const { data, error } = await supabase
    .from('pending_signups')
    .select('*')
    .eq('form_source', 'Reading Circle Signup')
    .eq('status', 'Pending')
    .order('timestamp', { ascending: false });

  if (error) throw new Error(error.message);

  let results = data as PendingSignup[];

  if (shouldFilter) {
    const { data: cubs } = await supabase
      .from('cubs')
      .select('cub_id')
      .eq('relationship_owner', effectiveName);
    const ownerCubIds = new Set((cubs ?? []).map(c => c.cub_id));
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
    const { error: deleteErr } = await supabase
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
      const cubGradeNum = parseInt((effectiveGrade || '').replace(/\D/g, ''), 10);
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

  // ── Sync orientation journey for this cub ──────────────────────
  // Fetch current orientation row (if exists) to recompute stage
  const { data: orientationRow } = await supabase
    .from('orientation')
    .select('*')
    .eq('cub_id', effectiveCubId)
    .maybeSingle();

  if (orientationRow) {
    const rcDate = getNearestDateForDay(session);
    const merged = {
      ...orientationRow,
      rc_selected_status: 'Completed',
      rc_selected_date: orientationRow.rc_selected_date || rcDate,
    };
    const stageResult = recomputeOrientationStage({
      invited_status: merged.invited_status,
      booked_status: merged.booked_status,
      attended_status: merged.attended_status,
      first_win_status: merged.first_win_status,
      rc_selected_status: 'Completed',
    });

    await supabase
      .from('orientation')
      .update({
        rc_selected_status: 'Completed',
        rc_selected_date: merged.rc_selected_date,
        stage: stageResult.stage,
        stage_status: stageResult.stage_status,
        next_stage: stageResult.next_stage,
        completion_date: stageResult.completion_date,
      })
      .eq('cub_id', effectiveCubId);

    // Propagate stage to cubs table
    await supabase
      .from('cubs')
      .update({
        orientation_stage: stageResult.stage,
        orientation_stage_status: stageResult.stage_status,
        orientation_next_stage: stageResult.next_stage,
        orientation_completion_date: stageResult.completion_date,
        reading_circle_category: rcCategory,
      })
      .eq('cub_id', effectiveCubId);
  } else {
    // No orientation row yet — still propagate RC category to cubs
    await supabase
      .from('cubs')
      .update({ reading_circle_category: rcCategory })
      .eq('cub_id', effectiveCubId);
  }

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

  // Upsert into reading_circle (supports both new assignments from Pending RC and session changes)
  const { error: rcErr } = await supabase
    .from('reading_circle')
    .upsert({
      cub_id,
      selected_session: new_session,
      rc_category: newCategory,
    }, { onConflict: 'cub_id' });

  if (rcErr) return { error: rcErr.message };

  // Propagate to cubs
  await supabase
    .from('cubs')
    .update({ reading_circle_category: newCategory })
    .eq('cub_id', cub_id);

  // Sync orientation journey — recompute stage after RC session change
  const { data: orientationRow } = await supabase
    .from('orientation')
    .select('*')
    .eq('cub_id', cub_id)
    .maybeSingle();

  if (orientationRow) {
    const rcDate = getNearestDateForDay(new_session);
    const stageResult = recomputeOrientationStage({
      invited_status: orientationRow.invited_status,
      booked_status: orientationRow.booked_status,
      attended_status: orientationRow.attended_status,
      first_win_status: orientationRow.first_win_status,
      rc_selected_status: 'Completed',
    });

    await supabase
      .from('orientation')
      .update({
        rc_selected_status: 'Completed',
        rc_selected_date: orientationRow.rc_selected_date || rcDate,
        stage: stageResult.stage,
        stage_status: stageResult.stage_status,
        next_stage: stageResult.next_stage,
        completion_date: stageResult.completion_date,
      })
      .eq('cub_id', cub_id);

    // Propagate to cubs table
    await supabase
      .from('cubs')
      .update({
        orientation_stage: stageResult.stage,
        orientation_stage_status: stageResult.stage_status,
        orientation_next_stage: stageResult.next_stage,
        orientation_completion_date: stageResult.completion_date,
        reading_circle_category: newCategory,
      })
      .eq('cub_id', cub_id);
  } else {
    // No orientation row — just update RC category on cubs
    await supabase
      .from('cubs')
      .update({ reading_circle_category: newCategory })
      .eq('cub_id', cub_id);
  }

  revalidatePath('/reading-circle');
  revalidatePath('/orientation');
  revalidatePath('/directory');
  revalidatePath('/dashboard');
  return { success: true, newCategory };
}

