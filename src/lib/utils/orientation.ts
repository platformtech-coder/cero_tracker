// ============================================================
// Orientation Business Logic Utilities
// ============================================================

export interface OrientationBlocks {
  invited_status?: string | null;
  booked_status?: string | null;
  attended_status?: string | null;
  first_win_status?: string | null;
  rc_selected_status?: string | null;
  /** Pass the row's existing completion_date so we never overwrite it with "today". */
  existing_completion_date?: string | null;
}

export interface StageResult {
  stage: string | null;
  stage_status: string | null;
  next_stage: string | null;
  completion_date: string | null;
}

/**
 * Recompute overall stage/next_stage from the 5 block statuses.
 * Mirrors DashboardWrite.gs updateCubJourney() stage computation logic.
 * Priority: later stages win over earlier ones.
 *
 * Pass `existing_completion_date` from the DB row so we preserve the
 * original date instead of stamping "today" on every re-save.
 */
export function recomputeOrientationStage(blocks: OrientationBlocks): StageResult {
  const today = new Date().toISOString().slice(0, 10);

  // First Win → Completed
  if (blocks.first_win_status === 'Yes') {
    return {
      stage: 'Completed',
      stage_status: 'Completed',
      next_stage: null,
      // Preserve the original completion date; only stamp today on first completion
      completion_date: blocks.existing_completion_date || today,
    };
  }

  // RC Selected → stage = RC Selected, next = First Win Sent
  if (blocks.rc_selected_status === 'Completed') {
    return {
      stage: 'RC Selected',
      stage_status: 'Completed',
      next_stage: 'First Win Sent',
      completion_date: null,
    };
  }

  // Attended (present/rescheduled) → stage = Attended, next = RC Selected
  if (blocks.attended_status === 'Present' || blocks.attended_status === 'Rescheduled') {
    return {
      stage: 'Attended',
      stage_status: 'Completed',
      next_stage: 'RC Selected',
      completion_date: null,
    };
  }

  // Attended Absent → still Booked, next = Attended (must re-attend)
  if (blocks.attended_status === 'Absent') {
    return {
      stage: 'Booked',
      stage_status: 'Completed',
      next_stage: 'Attended',
      completion_date: null,
    };
  }

  // Booked (Completed or Pending) → stage = Booked, next = Attended
  if (blocks.booked_status === 'Completed' || blocks.booked_status === 'Pending') {
    return {
      stage: 'Booked',
      stage_status: blocks.booked_status,
      next_stage: 'Attended',
      completion_date: null,
    };
  }

  // Default — cub has been invited (the baseline state when added to Gen. Comm)
  return {
    stage: 'Invited',
    stage_status: 'Completed',
    next_stage: 'Booked',
    completion_date: null,
  };
}

/**
 * Calculate the nearest upcoming calendar date (YYYY-MM-DD) for a given day
 * or full session name string.
 * - "Tuesday" → next Tuesday's date
 * - "Saturday 9:00 am – 9:45 am" → next Saturday's date
 * - If today IS that day, returns today (same-day session).
 */
export function getNearestDateForDay(input: string): string {
  if (!input) return new Date().toISOString().slice(0, 10);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const lower = input.toLowerCase();
  const targetIdx = DAYS.findIndex(d => lower.includes(d.toLowerCase()));
  if (targetIdx === -1) return new Date().toISOString().slice(0, 10);

  const today = new Date();
  const currentDay = today.getDay();
  // 0 → same day (keep as today), 1–6 → days ahead
  const daysUntil = (targetIdx - currentDay + 7) % 7;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntil);
  return targetDate.toISOString().slice(0, 10);
}

/**
 * Auto-set dates when a status is first set.
 * Rules:
 * - booked_date  → nearest upcoming session date (only if not already stored)
 * - attended_date → today (only if not already stored)
 * - first_win_date → today (only if not already stored)
 * - rc_selected_date → nearest upcoming RC session date (only if not already stored)
 *
 * Accepts `current` DB row values so we never overwrite an already-recorded date.
 */
export function autoSetDates(
  updates: Partial<{
    session: string | null;
    rc_session: string | null;
    booked_status: string | null;
    booked_date: string | null;
    attended_status: string | null;
    attended_date: string | null;
    first_win_status: string | null;
    first_win_date: string | null;
    rc_selected_status: string | null;
    rc_selected_date: string | null;
  }>,
  /** Pass the current DB row so existing dates are never overwritten. */
  current?: Partial<{
    booked_date: string | null;
    attended_date: string | null;
    first_win_date: string | null;
    rc_selected_date: string | null;
  }>
) {
  const today = new Date().toISOString().slice(0, 10);
  const { rc_session, ...result } = updates;

  // Only set booked_date if neither the update nor the existing DB row has one
  if (result.booked_status && !result.booked_date && !current?.booked_date) {
    result.booked_date = result.session ? getNearestDateForDay(result.session) : today;
  }

  if (result.attended_status && !result.attended_date && !current?.attended_date) {
    result.attended_date = today;
  }

  if (result.first_win_status && !result.first_win_date && !current?.first_win_date) {
    result.first_win_date = today;
  }

  if (result.rc_selected_status && !result.rc_selected_date && !current?.rc_selected_date) {
    result.rc_selected_date = rc_session ? getNearestDateForDay(rc_session) : today;
  }

  return result;
}
