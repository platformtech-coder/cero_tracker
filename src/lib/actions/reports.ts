'use server';

import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';

// ─── Types ────────────────────────────────────────────────────

export interface DailyActivityRow {
  rep: string;
  calls_made: number;
  calls_successful: number;
  calls_unsuccessful: number;
  messages_sent: number;
  total_interactions: number;
  actions_created?: number;
  handover_notes?: number;
}

export interface InteractionDetailRow {
  id: string;
  date: string;
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string;
  parent_last_name: string;
  handled_by: string;
  type: string;
  purpose: string;
  status: string | null;
  feedback: string | null;
  action_required: string;
  action: string | null;
}

export interface CallParentsSummaryRow {
  date: string;
  rep: string;
  total_families_due: number;
  total_cubs_due: number;
  families_called: number;
  families_not_called: number;
  families_reached: number;
  families_not_reached: number;
  messages_sent: number;
  cubs_covered: number;
  cubs_not_called: number;
  cubs_reached: number;
  cubs_not_reached: number;
  cubs_not_covered?: number;
  call_rate_pct: number;
  success_rate_pct: number;
}

export interface CallParentsCubItem {
  cub_id: string;
  cub_name: string;
  sub_status: string;
  was_called: boolean;
}

export interface CallParentsFamilyDetailRow {
  date: string;
  rep: string;
  family_key: string;
  parent_name: string;
  parent_phone: string | null;
  cubs_count: number;
  cubs: CallParentsCubItem[];
  was_called: boolean;
  was_reached: boolean;
  call_status: 'Reached' | 'Not Reached' | 'Not Called';
  last_call_date: string | null;
  last_call_rep: string | null;
  last_call_feedback: string | null;
}

export interface CallParentsReportData {
  summary: CallParentsSummaryRow[];
  detail: CallParentsFamilyDetailRow[];
}

// Deprecated type aliases for compatibility
export type CoreParentSummaryRow = CallParentsSummaryRow;
export type CoreParentDetailRow = CallParentsFamilyDetailRow;

export interface ActionReportRow {
  rep: string;
  total_actions: number;
  completed: number;
  cancelled: number;
  open_actions: number;
  overdue: number;
  avg_hours_to_complete: number | null;
}

export interface ActionDetailRow {
  id: number;
  date: string;
  rep: string;
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone: string | null;
  action: string;
  action_status: string;
  overdue_status: string;
  action_deadline: string | null;
  type: string;
  purpose: string;
}

export interface HandoverMetricsRow {
  rep: string;
  notes_submitted: number;
  notes_with_pending_issues: number;
  first_note_date: string | null;
  last_note_date: string | null;
}

export interface HandoverDetailRow {
  id: number;
  date: string;
  rep: string;
  summary: string;
  pending_issues: string | null;
}

export interface RCSessionSummaryRow {
  session: string;
  expected_cubs: number;
  records_marked: number;
  present_count: number;
  absent_count: number;
  attendance_rate_pct: number;
}

export interface RCCubDetailRow {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone: string | null;
  rep: string;
  session: string;
  rc_category: string | null;
  total_present: number;
  last_attendance: string | null;
}

/** Returned by get_rc_session_roster — richer than RCCubDetailRow */
export interface RCSessionRosterRow {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone: string | null;
  rep: string;
  session: string;
  rc_category: string | null;
  total_present_ever: number;
  present_in_period: number;
  absent_in_period: number;
  last_attendance: string | null;
}

export interface OrientationFunnelRow {
  rep: string;
  total_gen_comm: number;
  completed: number;
  not_completed: number;
  in_progress: number;
  not_started: number;
  attended_present: number;
  booked_count: number;
  show_rate_pct: number | null;
}

export interface OrientationDetailRow {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone: string | null;
  rep: string;
  stage: string | null;
  session: string | null;
  booked_date: string | null;
  date_onboarded: string | null;
  attended_status: string | null;
  progress_status: 'In Progress' | 'Not Started';
}

export interface RetentionMetricsRow {
  rep: string;
  total_cubs: number;
  active_count: number;
  expired_count: number;
  almost_expiring_count: number;
  expiring_7d: number;
  expiring_30d: number;
  retention_rate_pct: number | null;
}

export interface ExpiredDetailRow {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone: string | null;
  rep: string;
  sub_end_date: string | null;
  orientation_stage: string | null;
  attended_orientation: boolean;
  enrolled_rc: boolean;
  rc_sessions_attended: number;
}

export interface FlagSummaryRow {
  flag: string;
  rep: string;
  total: number;
  engaged_last_7d: number;
  not_engaged_7d: number;
}

export interface FlagDetailRow {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone: string | null;
  rep: string;
  flag: string;
  sub_status: string;
  last_engagement: string | null;
}

export interface FlagTrendRow {
  date: string;
  flag: string;
  rep: string;
  flagged_count: number;
}

// ─── Helpers ──────────────────────────────────────────────────

async function getRepContext(repFilter?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);
  const isAdmin = profile?.role === 'admin';
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;

  // Admin with explicit filter → use that rep
  // Admin with no filter     → null (all reps)
  // Rep always               → their own name (ignore any passed filter)
  let targetRep: string | null;
  if (isAdmin) {
    targetRep = (repFilter && repFilter !== 'All Reps') ? repFilter : null;
  } else {
    targetRep = effectiveRepName ?? null;
  }

  return { supabase, isAdmin, targetRep };
}

// ─── 1. Daily Activity Report ─────────────────────────────────
export async function getDailyActivityReport(
  repFilter?: string,
  startDate?: string,
  endDate?: string,
  purposes?: string[]
): Promise<DailyActivityRow[]> {
  const { supabase, targetRep } = await getRepContext(repFilter);

  const payload: Record<string, unknown> = {
    p_rep_name: targetRep,
    p_date: startDate || new Date().toISOString().slice(0, 10),
    p_end_date: endDate || null,
    p_purposes: (purposes && purposes.length > 0) ? purposes : null,
  };

  const { data, error } = await supabase.rpc('get_daily_activity_report', payload);

  if (error) throw new Error(error.message);
  return (data as DailyActivityRow[]) ?? [];
}

// ─── 1b. Daily Activity — Interaction Detail ──────────────────
export async function getDailyActivityInteractions(
  repName?: string,
  startDate?: string,
  endDate?: string,
  purposes?: string[]
): Promise<InteractionDetailRow[]> {
  const { supabase, targetRep } = await getRepContext(repName);

  const start = startDate || new Date().toISOString().slice(0, 10);
  const end = endDate || start;

  // Always pass p_purposes (even if null) to avoid PostgREST RPC overload ambiguity
  const rpcPayload: Record<string, unknown> = {
    p_rep_name: targetRep,
    p_date: start,
    p_end_date: end,
    p_purposes: (purposes && purposes.length > 0) ? purposes : null,
  };

  const { data, error } = await supabase.rpc('get_daily_activity_interactions', rpcPayload);

  if (error) throw new Error(error.message);
  return (data as InteractionDetailRow[]) ?? [];
}

// ─── 2. Call Parents Flags Accountability ─────────────────────
export async function getCallParentsReport(
  repFilter?: string,
  startDate?: string,
  endDate?: string
): Promise<CallParentsReportData> {
  const { supabase, targetRep } = await getRepContext(repFilter);

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_call_parents_report', {
    p_rep_name: targetRep,
    p_start:    startDate || today,
    p_end:      endDate   || today,
  });

  if (error) throw new Error(error.message);
  const result = data as CallParentsReportData;
  return {
    summary: result?.summary ?? [],
    detail:  result?.detail  ?? [],
  };
}

export const getCoreParentAccountability = getCallParentsReport;
export const getCallParentsFlagsReport = getCallParentsReport;

// ─── 3. Actions Report ────────────────────────────────────────
export async function getActionsReport(
  repFilter?: string,
  startDate?: string,
  endDate?: string
): Promise<{ metrics: ActionReportRow[]; detail: ActionDetailRow[] }> {
  const { supabase, targetRep } = await getRepContext(repFilter);

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_actions_report', {
    p_rep_name: targetRep,
    p_start:    startDate || thirtyDaysAgo,
    p_end:      endDate   || today,
  });

  if (error) throw new Error(error.message);
  const result = data as { metrics: ActionReportRow[]; detail: ActionDetailRow[] };
  return {
    metrics: result?.metrics ?? [],
    detail:  result?.detail  ?? [],
  };
}

// ─── 4. Handover Report ───────────────────────────────────────
export async function getHandoverReport(
  repFilter?: string,
  startDate?: string,
  endDate?: string
): Promise<{ metrics: HandoverMetricsRow[]; detail: HandoverDetailRow[] }> {
  const { supabase, targetRep } = await getRepContext(repFilter);

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_handover_report', {
    p_rep_name: targetRep,
    p_start:    startDate || thirtyDaysAgo,
    p_end:      endDate   || today,
  });

  if (error) throw new Error(error.message);
  const result = data as { metrics: HandoverMetricsRow[]; detail: HandoverDetailRow[] };
  return {
    metrics: result?.metrics ?? [],
    detail:  result?.detail  ?? [],
  };
}

// ─── 5. Reading Circle Attendance Report ──────────────────────
export async function getRCAttendanceReport(
  repFilter?: string,
  startDate?: string,
  endDate?: string
): Promise<{
  session_summary: RCSessionSummaryRow[];
  rep_metrics: { rep: string; total_enrolled: number; never_attended: number; attended_in_period: number }[];
  cub_detail: RCCubDetailRow[];
}> {
  const { supabase, targetRep } = await getRepContext(repFilter);

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_rc_attendance_report', {
    p_rep_name: targetRep,
    p_start:    startDate || thirtyDaysAgo,
    p_end:      endDate   || today,
  });

  if (error) throw new Error(error.message);
  const result = data as any;
  return {
    session_summary: result?.session_summary ?? [],
    rep_metrics:     result?.rep_metrics     ?? [],
    cub_detail:      result?.cub_detail      ?? [],
  };
}

// ─── 6. Orientation Report ────────────────────────────────────
export async function getOrientationReport(
  repFilter?: string,
  startDate?: string,
  endDate?: string
): Promise<{ funnel: OrientationFunnelRow[]; not_completed_detail: OrientationDetailRow[] }> {
  const { supabase, targetRep } = await getRepContext(repFilter);

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_orientation_report', {
    p_rep_name: targetRep,
    p_start:    startDate || thirtyDaysAgo,
    p_end:      endDate   || today,
  });

  if (error) throw new Error(error.message);
  const result = data as any;
  return {
    funnel:               result?.funnel               ?? [],
    not_completed_detail: result?.not_completed_detail ?? [],
  };
}

// ─── 7. Expiry & Retention Report ────────────────────────────
export async function getExpiryRetentionReport(
  repFilter?: string,
  startDate?: string,
  endDate?: string
): Promise<{
  retention_metrics: RetentionMetricsRow[];
  expiring_soon_detail: ExpiredDetailRow[];
  expired_detail: ExpiredDetailRow[];
}> {
  const { supabase, targetRep } = await getRepContext(repFilter);

  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc('get_expiry_retention_report', {
    p_rep_name: targetRep,
    p_start:    startDate || '2020-01-01',
    p_end:      endDate   || today,
  });

  if (error) throw new Error(error.message);
  const result = data as any;
  return {
    retention_metrics:     result?.retention_metrics     ?? [],
    expiring_soon_detail:  result?.expiring_soon_detail  ?? [],
    expired_detail:        result?.expired_detail        ?? [],
  };
}

// ─── 2b. Call Parents — Lazy-load family detail ───────────────
// Called only when the user opens the detail drawer for a specific rep+date.
// Replaces the 814KB detail payload that used to be embedded in the main report.
export async function getCallParentsDetail(
  repName: string | null,
  targetDate: string,
  status?: 'Reached' | 'Not Reached' | 'Not Called'
): Promise<CallParentsFamilyDetailRow[]> {
  const { supabase, isAdmin, targetRep } = await getRepContext(repName ?? undefined);
  // Non-admins may only see their own data
  const effectiveRep = isAdmin ? repName : targetRep;

  const { data, error } = await supabase.rpc('get_call_parents_detail', {
    p_rep_name:    effectiveRep ?? null,
    p_target_date: targetDate,
    p_status:      status ?? null,
  });

  if (error) throw new Error(error.message);
  return (data as CallParentsFamilyDetailRow[]) ?? [];
}

// ─── 5b. RC — Lazy-load session roster ────────────────────────
// Called only when the user opens a session card to see per-cub detail.
// Replaces the 56KB cub_detail array that used to be embedded in the main report.
export async function getRCSessionRoster(
  repFilter: string | null,
  session: string | null,
  startDate: string,
  endDate: string
): Promise<RCSessionRosterRow[]> {
  const { supabase, isAdmin, targetRep } = await getRepContext(repFilter ?? undefined);
  const effectiveRep = isAdmin ? repFilter : targetRep;

  const { data, error } = await supabase.rpc('get_rc_session_roster', {
    p_rep_name: effectiveRep ?? null,
    p_session:  session ?? null,
    p_start:    startDate,
    p_end:      endDate,
  });

  if (error) throw new Error(error.message);
  return (data as RCSessionRosterRow[]) ?? [];
}

// Legacy aliases
export const getFlagsReport = getCallParentsReport as typeof getCallParentsReport;
export const getCoreParentAccountability2 = getCallParentsReport;
