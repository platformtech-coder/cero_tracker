import React from "react";
import type { FormsConfig } from "@/lib/constants/forms";

// ─── Types ─────────────────────────────────────────────────────
export interface SystemErrorItem {
  id: string;
  created_at: string;
  level: "error" | "warning" | "info";
  message: string;
  endpoint: string | null;
  stack_trace: string | null;
  details: any;
  status: "active" | "resolved";
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface ErrorSummary {
  errors: number;
  warnings: number;
  info: number;
  unresolved: number;
  total: number;
}

export interface SyncEntry {
  key: string;
  label: string;
  status: string;
  lastRunAt: string | null;
  error: string | null;
  processedCount: number;
  lastProcessedRow: number;
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  details: string;
  status: string;
  userId: string | null;
  durationMs: number | null;
  timestamp: string;
}

export interface SheetCfg {
  id: string;
  tab: string;
}

export interface Overview {
  tableCounts: Record<string, number>;
  totalRows: number;
  latencyMs: number;
  queryLatencyMs?: number;
  apiResponseMs?: number;
  dbSizeBytes?: number;
  storageSizeBytes?: number;
  pipelineDuration?: string;
  pipelineStatus?: "Completed" | "Failed";
  errorSummary?: ErrorSummary;
  initialErrors?: SystemErrorItem[];
  syncState: SyncEntry[];
  auditLog: AuditEntry[];
  pendingSignups: number;
  sheetConfig: {
    directory: SheetCfg;
    readingData: SheetCfg;
    scoreCalendar: SheetCfg;
    emailHistory: SheetCfg;
  };
  formConfig?: {
    orientation?: string;
    readingCircle?: string;
  };
}

export interface Props {
  overview: Overview;
  formsConfig: FormsConfig | null;
}

// ─── Table Metadata & Constants ─────────────────────────────────
export interface TableMeta {
  key: string;
  label: string;
  category: "subscribers" | "operations" | "system";
  categoryLabel: string;
  danger: "critical" | "high" | "medium" | "low";
  description: string;
  pkType: string;
  dependencies?: string;
  allowCascade?: boolean;
}

export const TABLE_METAS: TableMeta[] = [
  // ── Subscribers & Core Directory ──
  {
    key: "master_cubs",
    label: "Master Cubs (Source)",
    category: "subscribers",
    categoryLabel: "Subscribers & Directory",
    danger: "critical",
    description: "Source directory roster imported from Google Sheets. Root of all cub relationships.",
    pkType: "id (bigint), cub_id (unique text)",
    dependencies: "Referenced by Interactions, Actions, Cubs, Orientation, Reading Circle, Email History",
    allowCascade: true,
  },
  {
    key: "cubs",
    label: "Cubs (Live)",
    category: "subscribers",
    categoryLabel: "Subscribers & Directory",
    danger: "high",
    description: "Operational subscriber records with reading streaks, leagues, medallion statuses, and points.",
    pkType: "id (bigint), cub_id (unique text)",
    dependencies: "Derived from Master Cubs + reading data sync",
  },
  {
    key: "families",
    label: "Families",
    category: "subscribers",
    categoryLabel: "Subscribers & Directory",
    danger: "high",
    description: "Parent and guardian contact records (phone, WhatsApp, email) and rep assignments.",
    pkType: "id (bigint)",
    dependencies: "Synced from Directory sheet",
  },
  {
    key: "email_history",
    label: "Email History",
    category: "subscribers",
    categoryLabel: "Subscribers & Directory",
    danger: "high",
    description: "Communication log of automated and campaign emails sent to cubs (Msg 1-7).",
    pkType: "id (bigint), cub_id (unique text)",
    dependencies: "Synced from Email History sheet",
  },

  // ── Operations & Engagement ──
  {
    key: "interactions",
    label: "Interactions",
    category: "operations",
    categoryLabel: "Operations & Engagement",
    danger: "high",
    description: "Manual interaction logs created by reps (calls, messages, meetings, parent feedback).",
    pkType: "id (uuid)",
    dependencies: "Parent of Actions (cascades on delete)",
  },
  {
    key: "actions",
    label: "Actions / Follow-ups",
    category: "operations",
    categoryLabel: "Operations & Engagement",
    danger: "high",
    description: "Follow-up tasks, deadlines, and completion statuses linked to rep interactions.",
    pkType: "id (bigint)",
    dependencies: "Linked to Interactions and Master Cubs",
  },
  {
    key: "orientation",
    label: "Orientation Records",
    category: "operations",
    categoryLabel: "Operations & Engagement",
    danger: "high",
    description: "Cub onboarding progress across stages (Invited, Booked, Attended, RC Selected, First Win).",
    pkType: "id (bigint), cub_id (unique text)",
    dependencies: "Linked to Master Cubs",
  },
  {
    key: "reading_circle",
    label: "Reading Circle Roster",
    category: "operations",
    categoryLabel: "Operations & Engagement",
    danger: "high",
    description: "Active Reading Circle enrollment, session schedules, and cumulative attendance.",
    pkType: "id (bigint), cub_id (unique text)",
    dependencies: "Linked to Master Cubs",
  },
  {
    key: "rc_attendance",
    label: "RC Attendance",
    category: "operations",
    categoryLabel: "Operations & Engagement",
    danger: "medium",
    description: "Session-by-session attendance logs (Present, Absent, Rescheduled) for Reading Circles.",
    pkType: "id (bigint)",
    dependencies: "Linked to Master Cubs",
  },
  {
    key: "pending_signups",
    label: "Pending Signups",
    category: "operations",
    categoryLabel: "Operations & Engagement",
    danger: "medium",
    description: "Inbound Google Form submissions awaiting cub matching and admin confirmation.",
    pkType: "id (bigint)",
    dependencies: "Matches to Master Cubs",
  },
  {
    key: "handover_notes",
    label: "Handover Notes",
    category: "operations",
    categoryLabel: "Operations & Engagement",
    danger: "medium",
    description: "Team shift handover summaries, open operational blockers, and pending issues.",
    pkType: "id (bigint), note_id (uuid)",
    dependencies: "Standalone team logs",
  },

  // ── System & Configuration ──
  {
    key: "sync_state",
    label: "Sync State",
    category: "system",
    categoryLabel: "System & Config",
    danger: "medium",
    description: "Background worker cursors, timestamps, and error states for sheet synchronizations.",
    pkType: "id (bigint), sync_type (unique text)",
    dependencies: "Regenerated on next sync",
  },
  {
    key: "audit_log",
    label: "Audit Log",
    category: "system",
    categoryLabel: "System Logs",
    danger: "low",
    description: "Complete chronological history of system events, logins, syncs, and administrative actions.",
    pkType: "id (bigint)",
    dependencies: "System audit trail",
  },
];

// All table labels for Overview tab (including permanently protected tables)
export const TABLE_LABELS: Record<string, string> = {
  ...Object.fromEntries(TABLE_METAS.map((m) => [m.key, m.label])),
  profiles: "User Profiles (Protected)",
  app_config: "App Config & Settings (Protected)",
  config_dropdowns: "Config Dropdowns (Protected)",
};

export const CLEARABLE_TABLES = TABLE_METAS;

// Named sheets config
export const SHEETS_CONFIG = [
  {
    key: "directory",
    idKey: "sheet_directory_id",
    tabKey: "sheet_directory_tab",
    label: "Directory",
    icon: "📋",
    desc: "Source of truth for all cubs / subscribers",
    color: "var(--primary)",
    bg: "var(--primary-dim)",
    hasTab: true,
    sharedNote: null,
  },
  {
    key: "readingData",
    idKey: "sheet_reading_data_id",
    tabKey: "sheet_reading_data_tab",
    label: "Reading Data",
    icon: "📚",
    desc: "Cumulative reading points per cub",
    color: "var(--green)",
    bg: "var(--green-dim)",
    hasTab: true,
    sharedNote: "Shares the same Google Sheet as Score Calendar",
  },
  {
    key: "scoreCalendar",
    idKey: "sheet_score_calendar_id",
    tabKey: "sheet_score_calendar_tab",
    label: "Score Calendar",
    icon: "📅",
    desc: "Weekly reading score calculations",
    color: "var(--blue)",
    bg: "var(--blue-dim)",
    hasTab: true,
    sharedNote:
      "Shares the same Google Sheet as Reading Data — paste the same ID",
  },
  {
    key: "emailHistory",
    idKey: "sheet_email_history_id",
    tabKey: "sheet_email_history_tab",
    label: "Email History",
    icon: "✉️",
    desc: "Log of all emails sent to cubs",
    color: "var(--orange)",
    bg: "var(--orange-dim)",
    hasTab: true,
    sharedNote: null,
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────
export function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export { StatusBadge } from "./StatusBadge";

