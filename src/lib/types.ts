// ============================================================
// Core Domain Types for CERO Tracker
// ============================================================

export type Role = 'rep' | 'admin';
export type SubStatus = 'active' | 'almost expiring' | 'expired';
export type Segment = 'Gen. Comm' | 'CDLS' | 'RCS';
export type ActionStatus = 'Pending' | 'Overdue' | 'Completed' | 'Cancelled' | 'Not started' | 'In Progress';
export type MatchConfidence = 'High' | 'Medium' | 'Low' | 'None';

// ─── Profile ────────────────────────────────────────────────
export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  sheet_rep_name: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Cubs ───────────────────────────────────────────────────
export interface Cub {
  id: number;
  cub_id: string;
  date_onboarded: string;
  segment: Segment;
  gender: string | null;
  grade: string | null;
  stream: string | null;
  school_name: string | null;
  sub_start_date: string | null;
  sub_end_date: string | null;
  no_sub_days: number | null;
  sub_status: SubStatus;
  current_streak: number;
  longest_streak: number;
  streak_label: string | null;
  current_league: string | null;
  medallion_status: string | null;
  flag: string | null;
  cumulative_points: number;
  cumulative_weekly_points: number;
  last_reading_activity: string | null;
  reading_circle_category: string | null;
  no_present: number;
  last_attendance_date: string | null;
  orientation_stage: string | null;
  orientation_stage_status: string | null;
  orientation_next_stage: string | null;
  orientation_completion_date: string | null;
  last_engagement_activity: string | null;
  handled_by_last: string | null;
  purpose_last: string | null;
  relationship_owner: string;
  created_at: string;
  updated_at: string;
  // Joined from master_cubs
  cub_first_name?: string;
  cub_last_name?: string;
  parent_first_name?: string;
  parent_last_name?: string;
  parent_phone?: string;
  parent_email?: string;
}

// ─── Families ───────────────────────────────────────────────
export interface Family {
  id: number;
  parent_phone: string | null;
  parent_email: string | null;
  parent_first_name: string;
  parent_last_name: string;
  parent_whatsapp: string | null;
  no_cubs: number;
  relationship_owner: string;
  created_at: string;
  updated_at: string;
}

// ─── Interactions ────────────────────────────────────────────
export interface Interaction {
  id: string;
  interaction_id: string;
  date: string;
  parent_first_name: string;
  parent_last_name: string;
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  handled_by: string;
  type: string;
  purpose: string;
  status: string | null;
  feedback: string | null;
  action_required: 'Yes' | 'No';
  action: string | null;
  action_deadline: string | null;
  action_status: string | null;
  logged_by: string;
  created_at: string;
}

// ─── Actions ─────────────────────────────────────────────────
export interface Action {
  id: number;
  interaction_id: string;
  date: string;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone?: string;
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  handled_by: string;
  type: string;
  purpose: string;
  status: string | null;
  feedback: string | null;
  action_required: 'Yes' | 'No';
  action: string;
  action_deadline: string | null;
  action_status: ActionStatus;
  overdue_status: 'Yes' | 'No';
  logged_by: string;
  created_at: string;
  updated_at: string;
  // Enriched
  relationship_owner?: string;
  sub_status?: SubStatus;
  orientation_stage?: string;
  flag?: string;
}

// ─── Dashboard Stats ──────────────────────────────────────────
export interface DashboardStats {
  totalCubs: number;
  totalParents: number;
  activeSubs: number;
  expiredSubs: number;
  almostExpiringWeek: number;
  almostExpiringMonth: number;
  flaggedCubs: number;
  pendingActionsCount: number;
  completedActionsCount: number;
  rcPendingCount: number;
  orientationPendingCount: number;
}

// ─── Pending Signups ──────────────────────────────────────────
export interface PendingSignup {
  id: number;
  pending_id: string;
  timestamp: string;
  form_source: 'Reading Circle Signup' | 'Orientation Signup';
  parent_name: string;
  parent_phone: string;
  cub_name: string;
  library_card: string | null;
  selected_session: string | null;
  grade: string | null;
  matched_cub_id: string | null;
  match_confidence: MatchConfidence;
  confirmed_by: string | null;
  confirmed_at: string | null;
  status: 'Pending' | 'Confirmed' | 'Rejected';
  created_at: string;
}

// ─── Orientation ──────────────────────────────────────────────
export interface Orientation {
  id: number;
  cub_id: string;
  session: 'Tuesday' | 'Sunday' | null;
  stage: string | null;
  stage_status: string | null;
  next_stage: string | null;
  completion_date: string | null;
  invited_status: 'Yes' | 'No' | null;
  booked_date: string | null;
  booked_status: string | null;
  attended_date: string | null;
  attended_status: 'Present' | 'Absent' | 'Rescheduled' | null;
  attended_feedback: string | null;
  first_win_date: string | null;
  first_win_status: 'Yes' | 'No' | null;
  first_win_feedback: string | null;
  rc_selected_date: string | null;
  rc_selected_status: 'Pending' | 'Completed' | null;
  rc_selected_feedback: string | null;
  version_ts: number;
  last_updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Reading Circle ───────────────────────────────────────────
export interface ReadingCircle {
  id: number;
  cub_id: string;
  selected_session: string;
  rc_category: string | null;
  weeks_active: number;
  no_present: number;
  last_attendance_date: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Handover Note ────────────────────────────────────────────
export interface HandoverNote {
  id: number;
  note_id: string;
  date: string;
  logged_by: string;
  summary: string;
  pending_issues: string | null;
  created_at: string;
}

// ─── Config Dropdown ──────────────────────────────────────────
export interface ConfigDropdown {
  id: number;
  category: 'handled_by' | 'type' | 'purpose' | 'status' | 'action_status' | 'orientation_stages';
  value: string;
  sort_order: number;
  is_active: boolean;
}
