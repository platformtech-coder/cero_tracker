"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Database,
  RefreshCw,
  Trash2,
  Settings2,
  Activity,
  FileText,
  AlertTriangle,
  Cloud,
  Play,
  Shield,
  BarChart3,
  Table2,
  Zap,
  FileSpreadsheet,
  Save,
  ExternalLink,
  Wrench,
  Search,
  Filter,
  Layers,
  Info,
  CheckCircle2,
  HardDrive,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  X,
  ChevronRight,
  Archive,
  BookOpen,
} from "lucide-react";

import ArchivedCubsTab from "./ArchivedCubsTab";
import ApprovalsTab from "./ApprovalsTab";
import { toast } from "sonner";
import {
  clearTable,
  clearAllTables,
  triggerExternalSync,
  saveSheetConfig,
  getSyncLogs,
  getSystemOverview,
  getSystemErrorLogs,
  resolveSystemError,
  unresolveSystemError,
  resolveAllSystemErrors,
  purgeResolvedErrors,
  simulateSystemLog,
} from "@/lib/actions/system-admin";
import { migrateReadingCircleData } from "@/lib/actions/rc-migration";
import { saveFormsPartialConfig, rebuildForms } from "@/lib/actions/forms";
import sharedStyles from "@/components/ui/dashboard.module.css";
import { AppShell } from "@/components/layout/AppShell";
import type { FormsConfig } from "@/lib/constants/forms";
import {
  KNOWN_ORI_SESSION_ITEM_ID,
  KNOWN_RC_LOWER_ITEM_IDS,
  KNOWN_RC_UPPER_ITEM_IDS,
  DEFAULT_ORI_SESSIONS,
  DEFAULT_RC_SESSIONS_LOWER,
  DEFAULT_RC_SESSIONS_UPPER,
} from "@/lib/constants/forms";

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

interface SyncEntry {
  key: string;
  label: string;
  status: string;
  lastRunAt: string | null;
  error: string | null;
  processedCount: number;
  lastProcessedRow: number;
  updatedAt: string;
}
interface AuditEntry {
  id: string;
  action: string;
  details: string;
  status: string;
  userId: string | null;
  durationMs: number | null;
  timestamp: string;
}
interface SheetCfg {
  id: string;
  tab: string;
}
interface Overview {
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
interface Props {
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
const TABLE_LABELS: Record<string, string> = {
  ...Object.fromEntries(TABLE_METAS.map((m) => [m.key, m.label])),
  profiles: "User Profiles (Protected)",
  app_config: "App Config & Settings (Protected)",
  config_dropdowns: "Config Dropdowns (Protected)",
};

const CLEARABLE_TABLES = TABLE_METAS;

// Named sheets config
const SHEETS_CONFIG = [
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

// Form URLs are no longer configured here — managed via the dashboard settings page.

// ─── Helpers ──────────────────────────────────────────────────
function fmtTime(iso: string | null) {
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    success: ["var(--green)", "var(--green-dim)"],
    ok: ["var(--green)", "var(--green-dim)"],
    configured: ["var(--green)", "var(--green-dim)"],
    triggered: ["var(--primary)", "var(--primary-dim)"],
    running: ["var(--primary)", "var(--primary-dim)"],
    SYNC_TRIGGER: ["var(--primary)", "var(--primary-dim)"],
    SETTINGS_UPDATE: ["var(--blue)", "var(--blue-dim)"],
    DATA_PURGE: ["var(--red)", "var(--red-dim)"],
    failed: ["var(--red)", "var(--red-dim)"],
    error: ["var(--red)", "var(--red-dim)"],
    warning: ["var(--orange)", "var(--orange-dim)"],
    pending: ["var(--orange)", "var(--orange-dim)"],
    unset: ["var(--text-3)", "var(--bg)"],
  };
  const [color, bg] = map[status] ?? ["var(--text-3)", "var(--bg)"];
  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 99,
        background: bg,
        color,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

function PurgeDialog({
  table,
  rowCount,
  onConfirm,
  onCancel,
  isRunning,
}: {
  table: TableMeta;
  rowCount: number;
  onConfirm: (t: string, cascade: boolean) => void;
  onCancel: () => void;
  isRunning: boolean;
}) {
  const [text, setText] = useState("");
  const [cascade, setCascade] = useState(false);

  const isCritical = table.danger === "critical";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 30000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(3px)",
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: `2px solid ${isCritical ? "var(--red)" : "var(--orange)"}`,
          borderRadius: 14,
          padding: 24,
          maxWidth: 480,
          width: "92%",
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: isCritical ? "var(--red-dim)" : "var(--orange-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <AlertTriangle
              size={22}
              style={{ color: isCritical ? "var(--red)" : "var(--orange)" }}
            />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>
              Delete Table Data — {table.label}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Table: <code style={{ color: "var(--primary)" }}>{table.key}</code> · {rowCount.toLocaleString()} rows
            </div>
          </div>
        </div>

        <div
          style={{
            background: isCritical ? "var(--red-dim)" : "rgba(245,158,11,0.08)",
            border: `1px solid ${isCritical ? "var(--red)" : "var(--orange)"}`,
            borderRadius: 8,
            padding: "12px 14px",
            marginBottom: 14,
            fontSize: 13,
            color: "var(--text-1)",
            lineHeight: 1.4,
          }}
        >
          ⚠️ You are about to permanently delete <strong>ALL {rowCount.toLocaleString()} rows</strong> in <strong>{table.label}</strong>.
          {table.category === "system" && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--red)", fontWeight: 600 }}>
              🔒 System Warning: This is an administrative table. Deleting it may reset configurations or user authentication state.
            </div>
          )}
          {table.dependencies && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)" }}>
              ℹ️ <strong>Dependencies:</strong> {table.dependencies}
            </div>
          )}
        </div>

        {table.allowCascade && (
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-1)",
              }}
            >
              <input
                type="checkbox"
                checked={cascade}
                onChange={(e) => setCascade(e.target.checked)}
                style={{ marginTop: 2, cursor: "pointer" }}
              />
              <div>
                <span>Cascade delete dependent records</span>
                <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-3)", marginTop: 2 }}>
                  Automatically remove dependent Interactions, Actions, and reset matched signups. If unchecked, deletion will fail if foreign keys still point to Master Cubs.
                </div>
              </div>
            </label>
          </div>
        )}

        <label
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text-2)",
            display: "block",
            marginBottom: 6,
          }}
        >
          Type{" "}
          <code
            style={{
              background: "var(--bg)",
              padding: "1px 6px",
              borderRadius: 4,
              color: "var(--red)",
              fontWeight: 800,
            }}
          >
            DELETE
          </code>{" "}
          to confirm
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="DELETE"
          autoFocus
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-input)",
            color: "var(--text-1)",
            fontSize: 14,
            fontFamily: "monospace",
            boxSizing: "border-box",
          }}
        />

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            onClick={onCancel}
            disabled={isRunning}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-2)",
              fontWeight: 600,
              cursor: isRunning ? "default" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(text, cascade)}
            disabled={text !== "DELETE" || isRunning}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              background: text === "DELETE" ? "var(--red)" : "var(--red-dim)",
              color: text === "DELETE" ? "#fff" : "var(--text-3)",
              fontWeight: 700,
              cursor: text === "DELETE" && !isRunning ? "pointer" : "default",
              transition: "all 0.15s",
              opacity: isRunning ? 0.7 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {isRunning ? (
              <>⏳ Deleting...</>
            ) : (
              <>
                <Trash2 size={14} /> Delete Table Data
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PurgeAllDialog({
  onConfirm,
  onCancel,
  isRunning,
}: {
  onConfirm: (t: string) => void;
  onCancel: () => void;
  isRunning: boolean;
}) {
  const [text, setText] = useState("");
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 30000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "2px solid var(--red)",
          borderRadius: 14,
          padding: 28,
          maxWidth: 420,
          width: "90%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "var(--red-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle size={20} style={{ color: "var(--red)" }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "var(--red)" }}>
              NUKE DATABASE
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
              This action is fully irreversible!
            </div>
          </div>
        </div>
        <div
          style={{
            background: "var(--red-dim)",
            border: "1px solid var(--red)",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            fontSize: 13,
            color: "var(--red)",
          }}
        >
          ⚠️ You are about to delete <strong>all operational tracker data</strong> (Cubs, Master Cubs, Families, Interactions, Actions, Orientation, Reading Circle, RC Attendance, Pending Signups, Email History, and Handover Notes).
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-1)", fontWeight: 500, background: "rgba(0,0,0,0.2)", padding: "8px 10px", borderRadius: 6 }}>
            🔒 <strong>Permanently Protected & Preserved:</strong> User Accounts (<code>profiles</code>), Google Sheet Settings & Form Settings (<code>app_config</code>), and Dropdown Picklists (<code>config_dropdowns</code>) will <strong>NEVER</strong> be touched or deleted by this purge.
          </div>
        </div>
        <label
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--text-2)",
            display: "block",
            marginBottom: 8,
          }}
        >
          Type{" "}
          <code
            style={{
              background: "var(--bg)",
              padding: "1px 6px",
              borderRadius: 4,
            }}
          >
            PURGE_ALL
          </code>{" "}
          to confirm
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="PURGE_ALL"
          style={{
            width: "100%",
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--bg-input)",
            color: "var(--text-1)",
            fontSize: 14,
            fontFamily: "monospace",
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text-2)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(text)}
            disabled={text !== "PURGE_ALL" || isRunning}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 8,
              background: text === "PURGE_ALL" ? "var(--red)" : "var(--red-dim)",
              color: text === "PURGE_ALL" ? "#fff" : "var(--text-3)",
              fontWeight: 700,
              cursor: text === "PURGE_ALL" ? "pointer" : "default",
              transition: "all 0.15s",
              opacity: isRunning ? 0.7 : 1,
            }}
          >
            {isRunning ? "⏳ Nuking..." : "🔥 Nuke Database"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sheet Card ───────────────────────────────────────────────
function SheetCard({
  cfg,
  sheetId,
  tab,
  onSave,
  isSaving,
}: {
  cfg: (typeof SHEETS_CONFIG)[number];
  sheetId: string;
  tab: string;
  onSave: (id: string, tab: string) => void;
  isSaving: boolean;
}) {
  const [localId, setLocalId] = useState(sheetId);
  const [localTab, setLocalTab] = useState(tab);
  const isConfigured = !!localId;

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "var(--bg)",
        }}
      >
        <span style={{ fontSize: 20 }}>{cfg.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{cfg.label}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {isConfigured ? (
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 99,
                background: "var(--green-dim)",
                color: "var(--green)",
                fontWeight: 700,
              }}
            >
              ✓ Configured
            </span>
          ) : (
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 99,
                background: "var(--bg)",
                color: "var(--text-3)",
                fontWeight: 700,
                border: "1px solid var(--border)",
              }}
            >
              Not set
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        style={{
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-3)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Sheet ID
          </label>
          <input
            value={localId}
            onChange={(e) => setLocalId(e.target.value)}
            placeholder="Paste Google Sheet ID…"
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-input)",
              color: "var(--text-1)",
              fontSize: 12,
              fontFamily: "monospace",
              boxSizing: "border-box",
            }}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 9,
              fontWeight: 700,
              color: "var(--text-3)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Tab / Sheet Name
          </label>
          <input
            value={localTab}
            onChange={(e) => setLocalTab(e.target.value)}
            placeholder="e.g. Master List"
            style={{
              width: "100%",
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg-input)",
              color: "var(--text-1)",
              fontSize: 12,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}
        >
          <button
            onClick={() => onSave(localId, localTab)}
            disabled={isSaving}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 14px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 12,
              cursor: "pointer",
              color: "var(--text-2)",
            }}
          >
            <Save size={12} /> {isSaving ? "Saving…" : "Save"}
          </button>
          {localId && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${localId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                padding: "7px 14px",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 12,
                color: "var(--text-3)",
                textDecoration: "none",
              }}
            >
              <ExternalLink size={12} /> Open Sheet
            </a>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Main ─────────────────────────────────────────────────────

export default function SystemAdminClient({ overview: init, formsConfig }: Props) {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/system-admin/auth", { method: "DELETE" });
    router.push("/system-admin/login");
  };

  const dummyProfile = {
    id: "system",
    email: "system@admin",
    full_name: "System Administrator",
    role: "admin" as const,
    sheet_rep_name: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const [tab, setTabState] = useState<'overview' | 'pipeline' | 'cleanup' | 'archived' | 'approvals'>(() => {
    return rawTab === 'pipeline' ? 'pipeline' : rawTab === 'cleanup' ? 'cleanup' : rawTab === 'archived' ? 'archived' : rawTab === 'approvals' ? 'approvals' : 'overview';
  });

  useEffect(() => {
    if (rawTab && ['overview', 'pipeline', 'cleanup', 'archived', 'approvals'].includes(rawTab)) {
      setTabState(rawTab as 'overview' | 'pipeline' | 'cleanup' | 'archived' | 'approvals');
    }
  }, [rawTab]);

  const setTab = useCallback((t: 'overview' | 'pipeline' | 'cleanup' | 'archived' | 'approvals') => {
    setTabState(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  const rawSubTab = searchParams.get('subtab');
  const [pipelineSubTab, setPipelineSubTabState] = useState<'sync' | 'config'>(() => {
    return rawSubTab === 'config' || rawSubTab === 'form_settings' ? 'config' : 'sync';
  });

  useEffect(() => {
    if (rawSubTab) {
      setPipelineSubTabState(rawSubTab === 'config' || rawSubTab === 'form_settings' ? 'config' : 'sync');
    }
  }, [rawSubTab]);

  const setPipelineSubTab = useCallback((t: 'sync' | 'config') => {
    setPipelineSubTabState(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('subtab', t);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);
  const [overview, setOverview] = useState(init);
  const [logs, setLogs] = useState<AuditEntry[]>(init.auditLog);
  const [isPending, startTransition] = useTransition();

  // Per-sheet save/sync states
  const [savingSheet, setSavingSheet] = useState<string | null>(null);
  const [syncingSheet, setSyncingSheet] = useState<string | null>(null);

  // Form IDs & item IDs state
  const [oriFormId, setOriFormId] = useState(
    formsConfig?.oriFormId ?? '1euyObOz6KNG3QgzdUG5otCxjfgV-0fZ9iCo3GFKKSXU'
  );
  const [oriSessionItemId, setOriSessionItemId] = useState(
    formsConfig?.oriSessionItemId ?? KNOWN_ORI_SESSION_ITEM_ID
  );
  const [rcFormId, setRcFormId] = useState(
    formsConfig?.rcFormId ?? '1NQPCb59uhpmo72BMxb9EHbxpAXqlmLlstyICTa8DJls'
  );
  const [rcLowerItemIds, setRcLowerItemIds] = useState(
    (formsConfig?.rcLowerItemIds ?? KNOWN_RC_LOWER_ITEM_IDS).join(', ')
  );
  const [rcUpperItemIds, setRcUpperItemIds] = useState(
    (formsConfig?.rcUpperItemIds ?? KNOWN_RC_UPPER_ITEM_IDS).join(', ')
  );
  const [savingFormKey, setSavingFormKey] = useState<string | null>(null);
  const [isRebuildingForms, setIsRebuildingForms] = useState(false);
  const [isMigratingRC, setIsMigratingRC] = useState(false);
  const [rcMigrationResult, setRcMigrationResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
  } | null>(null);

  const [purgeTarget, setPurgeTarget] = useState<TableMeta | null>(null);
  const [cleanupCategory, setCleanupCategory] = useState<
    "all" | "subscribers" | "operations" | "system" | "has_data"
  >("all");
  const [cleanupSearch, setCleanupSearch] = useState<string>("");
  const [isPurging, setIsPurging] = useState(false);
  const [showPurgeAllModal, setShowPurgeAllModal] = useState(false);

  // Table Details Drawer State
  const [isTablesDrawerOpen, setIsTablesDrawerOpen] = useState(false);
  const [tableDrawerSearch, setTableDrawerSearch] = useState("");
  const [tableDrawerCategory, setTableDrawerCategory] = useState<
    "all" | "subscribers" | "operations" | "system"
  >("all");

  // Error & Logging Section State
  const [errorLogs, setErrorLogs] = useState<SystemErrorItem[]>(
    overview.initialErrors || []
  );
  const [errorSummary, setErrorSummary] = useState<ErrorSummary>(
    overview.errorSummary || {
      errors: 0,
      warnings: 0,
      info: 0,
      unresolved: 0,
      total: 0,
    }
  );
  const [errorSearch, setErrorSearch] = useState("");
  const [errorLevel, setErrorLevel] = useState<"all" | "error" | "warning" | "info">("all");
  const [errorStatus, setErrorStatus] = useState<"active" | "resolved" | "all">("active");
  const [lastRefreshed, setLastRefreshed] = useState<string>("");
  const [isRefreshingErrors, setIsRefreshingErrors] = useState(false);
  const [expandedErrorIds, setExpandedErrorIds] = useState<Set<string>>(new Set());
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  const [isRefreshingOverview, setIsRefreshingOverview] = useState(false);

  const refreshOverview = useCallback(
    async (showToast = false) => {
      setIsRefreshingOverview(true);
      const clientStart = performance.now();
      try {
        const fresh = await getSystemOverview();
        const clientRoundtrip = Math.round(performance.now() - clientStart);
        setOverview({
          ...fresh,
          apiResponseMs: clientRoundtrip,
        });
        if (fresh.initialErrors) setErrorLogs(fresh.initialErrors);
        if (fresh.errorSummary) setErrorSummary(fresh.errorSummary);
        if (fresh.auditLog) setLogs(fresh.auditLog);
        setLastRefreshed(new Date().toLocaleTimeString());
        if (showToast) toast.success("System overview refreshed");
      } catch (err: any) {
        if (showToast) toast.error("Failed to refresh metrics: " + err.message);
      } finally {
        setIsRefreshingOverview(false);
      }
    },
    []
  );

  const refreshErrors = useCallback(
    async (showToast = false) => {
      setIsRefreshingErrors(true);
      try {
        const res = await getSystemErrorLogs({
          level: errorLevel,
          status: errorStatus,
          search: errorSearch,
        });
        setErrorLogs(res.logs as SystemErrorItem[]);
        setErrorSummary(res.summary);
        setLastRefreshed(new Date().toLocaleTimeString());
        if (showToast) toast.success("Error logs refreshed");
      } catch (err: any) {
        if (showToast) toast.error("Failed to refresh error logs: " + err.message);
      } finally {
        setIsRefreshingErrors(false);
      }
    },
    [errorLevel, errorStatus, errorSearch]
  );

  // Auto-refresh overview and error logs periodically (every 20s)
  useEffect(() => {
    setLastRefreshed(new Date().toLocaleTimeString());
    const timer = setInterval(() => {
      refreshOverview(false);
    }, 20000);
    return () => clearInterval(timer);
  }, [refreshOverview]);

  const toggleExpandError = (id: string) => {
    setExpandedErrorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  const handleResolveError = async (id: string) => {
    const res = await resolveSystemError(id);
    if (res.success) {
      toast.success("Error marked as resolved");
      refreshErrors(false);
    } else {
      toast.error(res.error || "Failed to resolve error");
    }
  };

  const handleUnresolveError = async (id: string) => {
    const res = await unresolveSystemError(id);
    if (res.success) {
      toast.success("Error reopened as active");
      refreshErrors(false);
    } else {
      toast.error(res.error || "Failed to reopen error");
    }
  };

  const handleResolveAllErrors = async () => {
    const res = await resolveAllSystemErrors();
    if (res.success) {
      toast.success("All active errors marked as resolved");
      refreshErrors(false);
    } else {
      toast.error(res.error || "Failed to resolve all errors");
    }
  };

  const handlePurgeResolvedErrors = async () => {
    const res = await purgeResolvedErrors();
    if (res.success) {
      toast.success(`Purged ${res.purgedCount ?? 0} resolved error logs`);
      refreshErrors(false);
    } else {
      toast.error(res.error || "Failed to purge resolved errors");
    }
  };

  const handleSimulateWarning = async () => {
    const res = await simulateSystemLog("warning");
    if (res.success) {
      toast.warning("Simulated warning captured in logger!");
      refreshErrors(false);
    } else {
      toast.error(res.error || "Failed to simulate warning");
    }
  };

  // Silent refresh (no toast) used by polling
  const silentRefresh = useCallback(async () => {
    try {
      const data = await getSystemOverview();
      setOverview(data);
      setLogs(data.auditLog);
    } catch { /* ignore polling errors */ }
  }, []);

  const refresh = useCallback(() => {
    startTransition(async () => {
      try {
        const data = await getSystemOverview();
        setOverview(data);
        setLogs(data.auditLog);
        toast.success("Data refreshed");
      } catch {
        toast.error("Failed to refresh");
      }
    });
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      const data = await getSyncLogs(100);
      setLogs(data as AuditEntry[]);
    } catch {
      toast.error("Failed to refresh logs");
    }
  }, []);

  // Auto-poll every 4 s while a sync is in progress
  useEffect(() => {
    if (!syncingSheet) return;
    const interval = setInterval(silentRefresh, 4000);
    return () => clearInterval(interval);
  }, [syncingSheet, silentRefresh]);

  const handleSheetSave = async (
    sheetKey: string,
    idKey: string,
    tabKey: string,
    id: string,
    tabName: string,
  ) => {
    setSavingSheet(sheetKey);
    const res = await saveSheetConfig({ [idKey]: id, [tabKey]: tabName });
    setSavingSheet(null);
    if (res.success) {
      toast.success(`${sheetKey} settings saved`);
      refresh();
    } else toast.error(res.error ?? "Failed to save");
  };

  const handleSheetSync = async (
    sheetKey: string,
    id: string,
    tabName: string,
  ) => {
    setSyncingSheet(sheetKey);
    toast.loading(`Syncing ${sheetKey}...`, { id: `sync-${sheetKey}` });
    const res = await triggerExternalSync(sheetKey, id, tabName);
    setSyncingSheet(null);
    if (res.success) {
      const edgeKey = sheetKey === 'readingData' ? 'reading_data' : sheetKey === 'scoreCalendar' ? 'score_calendar' : sheetKey;
      const count = (res.result as any)?.results?.[edgeKey] ?? null;
      const countStr = typeof count === 'number' ? ` — ${count} rows processed` : '';
      toast.success(`✅ ${sheetKey} synced${countStr}`, { id: `sync-${sheetKey}` });
      refresh();
    } else toast.error(res.error ?? "Failed to trigger sync", { id: `sync-${sheetKey}` });
  };

  const handleSaveOriForm = async () => {
    setSavingFormKey('ori');
    const res = await saveFormsPartialConfig({
      oriFormId: oriFormId.trim(),
      oriSessionItemId: oriSessionItemId.trim(),
    });
    setSavingFormKey(null);
    if (res.success) {
      toast.success('Orientation Form IDs saved');
      refresh();
    } else {
      toast.error(res.error ?? 'Failed to save Orientation Form IDs');
    }
  };

  const handleSaveRcForm = async () => {
    setSavingFormKey('rc');
    const res = await saveFormsPartialConfig({
      rcFormId: rcFormId.trim(),
      rcLowerItemIds: rcLowerItemIds.split(',').map((s) => s.trim()).filter(Boolean),
      rcUpperItemIds: rcUpperItemIds.split(',').map((s) => s.trim()).filter(Boolean),
    });
    setSavingFormKey(null);
    if (res.success) {
      toast.success('Reading Circle Form IDs saved');
      refresh();
    } else {
      toast.error(res.error ?? 'Failed to save Reading Circle Form IDs');
    }
  };

  const handleRebuildForms = async () => {
    setIsRebuildingForms(true);
    try {
      const res = await rebuildForms();
      if (res.success) {
        toast.success('Both Google Forms rebuilt successfully with active sessions!');
      } else {
        toast.error('Rebuild failed: ' + (res.error ?? 'Unknown error'));
      }
    } catch (e: any) {
      toast.error('Error rebuilding forms: ' + e.message);
    } finally {
      setIsRebuildingForms(false);
    }
  };

  const handleMigrateRC = async () => {
    setIsMigratingRC(true);
    setRcMigrationResult(null);
    toast.loading("Migrating Reading Circle & Orientation data from Google Sheet...", { id: "rc-migration" });
    try {
      const res = await migrateReadingCircleData();
      if (res.success) {
        toast.success(res.message || "Reading Circle migration completed!", { id: "rc-migration" });
        setRcMigrationResult({
          success: true,
          message: res.message || "Migration succeeded",
          details: res.details,
        });
        refresh();
      } else {
        toast.error(res.error || "Migration failed", { id: "rc-migration" });
        setRcMigrationResult({
          success: false,
          message: res.error || "Migration failed",
          details: res.details,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Unexpected error during migration", { id: "rc-migration" });
      setRcMigrationResult({
        success: false,
        message: err.message || "Unexpected error",
      });
    } finally {
      setIsMigratingRC(false);
    }
  };

  const handleSyncAll = async () => {
    const configuredSheets = SHEETS_CONFIG.filter((cfg) => {
      const sheet = (overview.sheetConfig as any)[cfg.key];
      return sheet?.id && sheet?.tab;
    });

    if (configuredSheets.length === 0) {
      toast.error("No sheets configured to sync");
      return;
    }

    const toastId = toast.loading(`Syncing ${configuredSheets.length} sheets... (0/${configuredSheets.length})`, { id: "sync-all" });
    setSyncingSheet('all');

    const errors: string[] = [];
    const successes: string[] = [];

    for (let idx = 0; idx < configuredSheets.length; idx++) {
      const cfg = configuredSheets[idx];
      const sheet = (overview.sheetConfig as any)[cfg.key];
      toast.loading(`Syncing ${cfg.label} (${idx + 1}/${configuredSheets.length})...`, { id: "sync-all" });
      const res = await triggerExternalSync(cfg.key, sheet.id, sheet.tab);
      if (!res.success) {
        errors.push(`${cfg.label}: ${res.error ?? "Sync failed"}`);
      } else {
        const count = (res.result as any)?.results?.[cfg.key === 'readingData' ? 'reading_data' : cfg.key === 'scoreCalendar' ? 'score_calendar' : cfg.key] ?? 0;
        successes.push(`${cfg.label}: ${typeof count === 'number' ? count + ' rows' : 'done'}`);
      }
    }

    setSyncingSheet(null);

    if (errors.length === 0) {
      toast.success(`✅ All ${successes.length} sheets synced!\n${successes.join(' • ')}`, { id: "sync-all", duration: 5000 });
    } else if (successes.length > 0) {
      toast.dismiss("sync-all");
      toast.success(`${successes.length} synced: ${successes.join(', ')}`);
      toast.error(`${errors.length} failed: ${errors.join(', ')}`);
    } else {
      toast.error(`All syncs failed: ${errors.join(', ')}`, { id: "sync-all" });
    }

    // Final refresh to pick up completed state
    await silentRefresh();
  };

  const handlePurge = async (confirmText: string, cascade: boolean = false) => {
    if (!purgeTarget || confirmText !== "DELETE") return;
    setIsPurging(true);
    const res = await clearTable(purgeTarget.key, confirmText, cascade);
    setIsPurging(false);
    setPurgeTarget(null);
    if (res.success) {
      toast.success(
        `Cleared ${res.rowsCleared?.toLocaleString() ?? "all"} rows from ${purgeTarget.label}`,
      );
      refresh();
    } else {
      toast.error(res.error || `Failed to clear ${purgeTarget.label}`);
    }
  };

  const handlePurgeAll = async (confirmText: string) => {
    if (confirmText !== "PURGE_ALL") return;
    setIsPurging(true);
    const res = await clearAllTables(confirmText);
    setIsPurging(false);
    setShowPurgeAllModal(false);
    if (res.success) {
      toast.success("Database fully nuked. All tables are empty.");
      refresh();
    } else {
      toast.error(res.error);
    }
  };

  const latencyColor =
    overview.latencyMs < 500
      ? "var(--green)"
      : overview.latencyMs < 1500
        ? "var(--orange)"
        : "var(--red)";
  const latencyLabel =
    overview.latencyMs < 500
      ? "Excellent"
      : overview.latencyMs < 1500
        ? "Moderate"
        : "Slow";

  const SIDEBAR_ITEMS = [
    { id: "overview", label: "System Overview", icon: BarChart3 },
    { id: "approvals", label: "Edit Approvals", icon: CheckCircle2 },
    { id: "pipeline", label: "Pipeline & Sync", icon: Cloud },
    { id: "archived", label: "Archived Cubs", icon: Archive },
    { id: "cleanup", label: "Data Cleanup", icon: Trash2 },
  ] as const;

  return (
    <AppShell
      profile={dummyProfile}
      pageTitle="System Administration"
      customNavItems={SIDEBAR_ITEMS as any}
      activeCustomNavId={tab}
      onCustomNavClick={(id) => setTab(id as any)}
      customLogout={handleLogout}
      hideHeaderActions={true}
      onRefresh={refresh}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          paddingBottom: 48,
        }}
      >
        {/* ══════════ OVERVIEW ══════════ */}
        {tab === "overview" && (()=> {
          // ─── Derived metrics ───────────────────────────────
          const dbSizeMB = ((overview.dbSizeBytes ?? 20756147) / (1024 * 1024)).toFixed(2);
          const dbQuotaBytes = 0.5 * 1024 * 1024 * 1024;
          const dbUsagePct = Math.min(((overview.dbSizeBytes ?? 20756147) / dbQuotaBytes) * 100, 100);
          const storageGB = ((overview.storageSizeBytes ?? 0) / (1024 * 1024 * 1024)).toFixed(2);
          const storageQuotaBytes = 1.0 * 1024 * 1024 * 1024;
          const storagePct = Math.min(((overview.storageSizeBytes ?? 0) / storageQuotaBytes) * 100, 100);

          // 1. Database Query Latency (Postgres RPC ping)
          const dbLatency = overview.queryLatencyMs ?? overview.latencyMs ?? 42;
          const latencyProgress = Math.min((dbLatency / 300) * 100, 100);
          const latencyBadge = dbLatency < 100 ? "Optimal" : dbLatency < 250 ? "Healthy" : dbLatency < 500 ? "Moderate" : "High";
          const latencyBadgeBg = dbLatency < 100 ? "#ecfdf5" : dbLatency < 250 ? "#f0fdf4" : dbLatency < 500 ? "#fef3c7" : "#fee2e2";
          const latencyBadgeColor = dbLatency < 100 ? "#059669" : dbLatency < 250 ? "#16a34a" : dbLatency < 500 ? "#d97706" : "#dc2626";

          // 2. Client-to-Server API Response (Complete Server Action Roundtrip)
          const apiLatency = overview.apiResponseMs ?? Math.round(dbLatency * 1.5);
          const apiBadge = apiLatency < 250 ? "Fast" : apiLatency < 500 ? "Normal" : "Slow";
          const apiBadgeColor = apiLatency < 250 ? "#059669" : apiLatency < 500 ? "var(--primary)" : "#dc2626";

          const totalMonitoredTables = Object.keys(overview.tableCounts).length;

          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* ROW 1: System Capacity */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {/* DB Size */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ecfeff", display: "flex", alignItems: "center", justifyContent: "center" }}><Database size={18} style={{ color: "#06b6d4" }} /></div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>Database Size</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 12px", borderRadius: 999, background: "#ecfdf5", color: "#059669" }}>Healthy</span>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.5px", lineHeight: 1 }}>{dbSizeMB}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-3)" }}>MB</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg)", borderRadius: 999, overflow: "hidden", marginTop: 14 }}>
                    <div style={{ height: "100%", width: `${Math.max(dbUsagePct, 2)}%`, background: "#06b6d4", borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>{dbUsagePct.toFixed(0)}% of 0.5 GB quota used</div>
                </div>
              </div>

              {/* Storage */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#ccfbf1", display: "flex", alignItems: "center", justifyContent: "center" }}><HardDrive size={18} style={{ color: "#0d9488" }} /></div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>Storage</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 12px", borderRadius: 999, background: "#ecfdf5", color: "#059669" }}>Healthy</span>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.5px", lineHeight: 1 }}>{storageGB}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-3)" }}>GB</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg)", borderRadius: 999, overflow: "hidden", marginTop: 14 }}>
                    <div style={{ height: "100%", width: `${Math.max(storagePct, 1)}%`, background: "#10b981", borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>{storagePct.toFixed(0)}% of 1 GB quota used</div>
                </div>
              </div>

              {/* Query Latency */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fef3c7", display: "flex", alignItems: "center", justifyContent: "center" }}><Zap size={18} style={{ color: "#d97706" }} /></div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>Query Latency</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 12px", borderRadius: 999, background: latencyBadgeBg, color: latencyBadgeColor }}>{latencyBadge}</span>
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: "var(--text-1)", letterSpacing: "-0.5px", lineHeight: 1 }}>{dbLatency}</span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-3)" }}>ms</span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg)", borderRadius: 999, overflow: "hidden", marginTop: 14 }}>
                    <div style={{ height: "100%", width: `${Math.max(latencyProgress, 4)}%`, background: latencyBadgeColor, borderRadius: 999 }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>Postgres RPC roundtrip · Threshold: &lt;100ms</div>
                </div>
              </div>
            </div>

            {/* ROW 2: Engine Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16 }}>
              {/* Total Tables – with drawer trigger */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <Table2 size={14} /><span>TOTAL TABLES</span>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, margin: "10px 0" }}>{totalMonitoredTables}</div>
                <button onClick={() => setIsTablesDrawerOpen(true)}
                  style={{ background: "transparent", border: "none", color: "var(--primary)", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                  View table details <ChevronRight size={13} />
                </button>
              </div>

              {/* Total Records */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <BarChart3 size={14} /><span>TOTAL RECORDS</span>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, margin: "10px 0" }}>{overview.totalRows.toLocaleString()}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>Across all tables</div>
              </div>

              {/* Pipeline Duration */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <Zap size={14} /><span>PIPELINE DURATION</span>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, margin: "10px 0" }}>{overview.pipelineDuration ?? "—"}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: overview.pipelineStatus === "Failed" ? "#ef4444" : "#10b981" }}>
                  {overview.pipelineStatus ?? "Completed"}
                </div>
              </div>

              {/* API Response */}
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  <Activity size={14} /><span>API RESPONSE</span>
                </div>
                <div style={{ fontSize: 34, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, margin: "10px 0" }}>
                  {apiLatency}<span style={{ fontSize: 16, fontWeight: 500, color: "var(--text-3)", marginLeft: 3 }}>ms</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: apiBadgeColor }}>{apiBadge} · Server Action roundtrip</div>
              </div>
            </div>

            {/* ── ERROR & LOGGING SECTION ── */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
                System Errors & Logs
              </div>

              {/* 4 Summary Stat Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                <div style={{ background: "var(--bg-card)", border: "1px solid #fee2e2", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>Errors</div><div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, marginTop: 6 }}>{errorSummary.errors}</div><div style={{ fontSize: 12, color: "#ef4444", fontWeight: 500, marginTop: 6 }}>Critical issues</div></div>
                  <AlertTriangle size={22} style={{ color: "#ef4444" }} />
                </div>
                <div style={{ background: "var(--bg-card)", border: "1px solid #fef3c7", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>Warnings</div><div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, marginTop: 6 }}>{errorSummary.warnings}</div><div style={{ fontSize: 12, color: "#d97706", fontWeight: 500, marginTop: 6 }}>Needs attention</div></div>
                  <AlertTriangle size={22} style={{ color: "#f59e0b" }} />
                </div>
                <div style={{ background: "var(--bg-card)", border: "1px solid #dbeafe", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>Info</div><div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, marginTop: 6 }}>{errorSummary.info}</div><div style={{ fontSize: 12, color: "#2563eb", fontWeight: 500, marginTop: 6 }}>Informational</div></div>
                  <Info size={22} style={{ color: "#3b82f6" }} />
                </div>
                <div style={{ background: "var(--bg-card)", border: "1px solid #d1fae5", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>Active (Unresolved)</div><div style={{ fontSize: 32, fontWeight: 800, color: "var(--text-1)", lineHeight: 1, marginTop: 6 }}>{errorSummary.unresolved}</div><div style={{ fontSize: 12, color: "#059669", fontWeight: 500, marginTop: 6 }}>{errorSummary.unresolved === 0 ? "System is clean ✓" : `${errorSummary.unresolved} open`}</div></div>
                  <CheckCircle2 size={22} style={{ color: "#10b981" }} />
                </div>
              </div>

              {/* Toolbar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, flex: "1 1 auto" }}>
                  <div style={{ position: "relative", minWidth: 260, flex: "1 1 260px", maxWidth: 400 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
                    <input value={errorSearch} onChange={e => { setErrorSearch(e.target.value); }} placeholder="Search by message or endpoint..." style={{ width: "100%", padding: "8px 12px 8px 36px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-1)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <select value={errorLevel} onChange={e => setErrorLevel(e.target.value as any)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-1)", fontSize: 13, cursor: "pointer" }}>
                    <option value="all">All Levels</option>
                    <option value="error">Error</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                  <select value={errorStatus} onChange={e => setErrorStatus(e.target.value as any)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-1)", fontSize: 13, cursor: "pointer" }}>
                    <option value="active">Active (Unresolved)</option>
                    <option value="all">All Logs</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button onClick={() => { refreshOverview(true); refreshErrors(false); }} disabled={isRefreshingOverview || isRefreshingErrors} title="Refresh overview metrics and error logs" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", color: "var(--text-2)", cursor: (isRefreshingOverview || isRefreshingErrors) ? "default" : "pointer", display: "flex", alignItems: "center" }}>
                    <RefreshCw size={15} style={{ animation: (isRefreshingOverview || isRefreshingErrors) ? "spin 1s linear infinite" : "none" }} />
                  </button>
                  <button onClick={handleSimulateWarning} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fde68a", background: "#fffbeb", color: "#d97706", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Simulate Warning</button>
                  <button onClick={handleResolveAllErrors} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #a7f3d0", background: "#ecfdf5", color: "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>✓ Resolve All</button>
                  <button onClick={handlePurgeResolvedErrors} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><Trash2 size={13} /> Purge Resolved</button>
                </div>
              </div>

              {/* Log List */}
              {errorLogs.length === 0 ? (
                <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "48px 24px", textAlign: "center", color: "var(--text-3)", fontSize: 14 }}>
                  ✓ No active errors — all systems operating normally.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {errorLogs.map(item => {
                    const isExpanded = expandedErrorIds.has(item.id);
                    const isResolved = item.status === "resolved";
                    const lvlColor = item.level === "error" ? "#ef4444" : item.level === "warning" ? "#f59e0b" : "#3b82f6";
                    const lvlBg = item.level === "error" ? "#fee2e2" : item.level === "warning" ? "#fef3c7" : "#dbeafe";
                    return (
                      <div key={item.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderLeft: `4px solid ${lvlColor}`, borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", padding: "2px 8px", borderRadius: 6, background: lvlBg, color: lvlColor }}>{item.level}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: isResolved ? "#ecfdf5" : "#fffbeb", color: isResolved ? "#059669" : "#d97706", border: `1px solid ${isResolved ? "#a7f3d0" : "#fde68a"}` }}>{isResolved ? "Resolved" : "Active"}</span>
                            {item.endpoint && <code style={{ fontSize: 12, background: "var(--bg)", padding: "2px 6px", borderRadius: 4, color: "var(--text-2)", border: "1px solid var(--border)" }}>{item.endpoint}</code>}
                            <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtTime(item.created_at)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button onClick={() => isResolved ? handleUnresolveError(item.id) : handleResolveError(item.id)} style={{ padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid var(--border)", background: isResolved ? "var(--bg)" : "#ecfdf5", color: isResolved ? "var(--text-2)" : "#059669", cursor: "pointer" }}>
                              {isResolved ? "Reopen" : "✓ Resolve"}
                            </button>
                            <button onClick={() => toggleExpandError(item.id)} style={{ padding: "4px 8px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--text-2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                              {isExpanded ? <>Hide <ChevronUp size={13} /></> : <>Details <ChevronDown size={13} /></>}
                            </button>
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", wordBreak: "break-word", lineHeight: 1.4 }}>{item.message}</div>
                        {isExpanded && (
                          <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 12 }}>
                            {item.stack_trace && (
                              <div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)", letterSpacing: "0.04em" }}>Stack Trace</span>
                                  <button onClick={() => copyToClipboard(item.stack_trace!, item.id)} style={{ background: "transparent", border: "none", color: "var(--primary)", fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                                    {copiedLogId === item.id ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy Stack</>}
                                  </button>
                                </div>
                                <pre style={{ background: "#0f172a", color: "#f8fafc", padding: "12px 14px", borderRadius: 8, fontSize: 12, fontFamily: "monospace", lineHeight: 1.5, overflowX: "auto", maxHeight: 240, margin: 0 }}>{item.stack_trace}</pre>
                              </div>
                            )}
                            {item.details && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-3)", letterSpacing: "0.04em", marginBottom: 6 }}>Context Details</div>
                                <pre style={{ background: "var(--bg)", color: "var(--text-1)", padding: "12px 14px", borderRadius: 8, fontSize: 12, fontFamily: "monospace", lineHeight: 1.5, overflowX: "auto", border: "1px solid var(--border)", maxHeight: 220, margin: 0 }}>{typeof item.details === "object" ? JSON.stringify(item.details, null, 2) : String(item.details)}</pre>
                              </div>
                            )}
                            {isResolved && <div style={{ fontSize: 12, color: "var(--text-3)", display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={13} style={{ color: "#059669" }} /><span>Resolved at {fmtTime(item.resolved_at)} by <strong>{item.resolved_by ?? "Admin"}</strong></span></div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
          );
        })()}


        {tab === "pipeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Pipeline sub-tabs */}
            <div
              style={{
                display: "flex",
                gap: 0,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 4,
                width: "fit-content",
              }}
            >
              {[
                { id: "sync", label: "Sync", icon: RefreshCw },
                {
                  id: "config",
                  label: "Sheets & Forms",
                  icon: FileSpreadsheet,
                },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setPipelineSubTab(id as any)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "7px 18px",
                    borderRadius: 7,
                    border: "none",
                    background:
                      pipelineSubTab === id ? "var(--bg-card)" : "transparent",
                    color:
                      pipelineSubTab === id ? "var(--text-1)" : "var(--text-3)",
                    fontWeight: pipelineSubTab === id ? 700 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow:
                      pipelineSubTab === id
                        ? "0 1px 4px rgba(0,0,0,0.08)"
                        : "none",
                    transition: "all 0.15s",
                  }}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            {/* ── SYNC TAB ── */}
            {pipelineSubTab === "sync" && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                {/* ── Reading Circle & Orientation Migration (Testing & Sync Tool) ── */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 14,
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: "var(--primary-dim)",
                          color: "var(--primary)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <BookOpen size={22} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: "var(--text-1)" }}>
                            Reading Circle & Orientation Migration
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 6,
                              background: "rgba(59, 130, 246, 0.12)",
                              color: "#3b82f6",
                            }}
                          >
                            Testing & Initial Sync
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
                          Syncs completed orientation, assigned sessions, categories, and historical attendance logs from Google Sheet. Safe to re-run anytime.
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleMigrateRC}
                      disabled={isMigratingRC || isPurging || !!syncingSheet}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 22px",
                        background: isMigratingRC ? "var(--bg)" : "var(--primary)",
                        color: isMigratingRC ? "var(--text-3)" : "white",
                        border: isMigratingRC ? "1px solid var(--border)" : "none",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: isMigratingRC ? "not-allowed" : "pointer",
                        transition: "all 0.15s ease",
                        boxShadow: isMigratingRC ? "none" : "0 2px 6px rgba(0,0,0,0.12)",
                      }}
                    >
                      <RefreshCw
                        size={15}
                        style={{
                          animation: isMigratingRC ? "spin 1s linear infinite" : undefined,
                        }}
                      />
                      {isMigratingRC ? "Migrating Data…" : "Migrate Reading Circle Data"}
                    </button>
                  </div>

                  {rcMigrationResult && (
                    <div
                      style={{
                        background: rcMigrationResult.success ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                        border: `1px solid ${rcMigrationResult.success ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                        borderRadius: 8,
                        padding: "12px 16px",
                        fontSize: 13,
                        color: rcMigrationResult.success ? "var(--green)" : "var(--red)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {rcMigrationResult.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        <span style={{ fontWeight: 600 }}>{rcMigrationResult.message}</span>
                      </div>
                      {rcMigrationResult.details && (
                        <span style={{ fontSize: 12, opacity: 0.9, fontFamily: "monospace" }}>
                          {rcMigrationResult.details}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Current Sync State */}
                <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 20px",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Settings2
                          size={16}
                          style={{ color: "var(--primary)" }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                          Current Sync State
                        </span>
                      </div>
                      <button
                        onClick={handleSyncAll}
                        disabled={isPurging || !!syncingSheet}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "10px 20px",
                          background: "var(--primary)",
                          color: "white",
                          border: "none",
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                          transition: "background 0.15s, opacity 0.15s",
                          opacity: syncingSheet ? 0.7 : 1,
                        }}
                      >
                        <RefreshCw
                          size={16}
                          style={{
                            animation: syncingSheet
                              ? "spin 1s linear infinite"
                              : undefined,
                          }}
                        />
                        {syncingSheet ? "Syncing All…" : "Sync All Now"}
                      </button>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className={sharedStyles.table}>
                        <thead>
                          <tr>
                            <th>Key</th>
                            <th>Status</th>
                            <th style={{ textAlign: "right" }}>Processed</th>
                            <th>Last Run</th>
                            <th>Error</th>
                            <th style={{ textAlign: "center" }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {SHEETS_CONFIG.map((cfg) => {
                            // Find matching state if it exists
                            const stateMatch = overview.syncState.find(
                              (s) =>
                                s.key.toLowerCase().replace(/_sync/g, "").replace(/_/g, "").replace(/ /g, "") === cfg.key.toLowerCase() ||
                                s.label.toLowerCase().replace(/_/g, "").replace(/ /g, "") === cfg.key.toLowerCase() ||
                                s.key.toLowerCase() === cfg.key.toLowerCase()
                            );
                            
                            // Default to empty strings if sheet isn't configured
                            let id = "";
                            let tabName = "";
                            if (cfg.key === "directory") {
                              id = overview.sheetConfig.directory.id;
                              tabName = overview.sheetConfig.directory.tab;
                            } else if (cfg.key === "readingData") {
                              id = overview.sheetConfig.readingData.id;
                              tabName = overview.sheetConfig.readingData.tab;
                            } else if (cfg.key === "scoreCalendar") {
                              id = overview.sheetConfig.scoreCalendar.id;
                              tabName = overview.sheetConfig.scoreCalendar.tab;
                            } else if (cfg.key === "emailHistory") {
                              id = overview.sheetConfig.emailHistory.id;
                              tabName = overview.sheetConfig.emailHistory.tab;
                            }

                            return (
                              <tr key={cfg.key}>
                                <td>
                                  <code
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: 12,
                                    }}
                                  >
                                    {cfg.label}
                                  </code>
                                </td>
                                <td>
                                  <StatusBadge status={stateMatch?.status || "unset"} />
                                </td>
                                <td
                                  style={{
                                    textAlign: "right",
                                    fontFamily: "monospace",
                                  }}
                                >
                                  {stateMatch?.processedCount ?? 0}
                                </td>
                                <td
                                  style={{
                                    fontSize: 12,
                                    color: "var(--text-3)",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {fmtTime(stateMatch?.lastRunAt || null)}
                                </td>
                                <td
                                  style={{
                                    fontSize: 12,
                                    color: stateMatch?.error ? "var(--red)" : "var(--text-3)",
                                    maxWidth: 200,
                                    wordBreak: "break-word",
                                  }}
                                >
                                  {stateMatch?.error ?? "—"}
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  <button
                                    onClick={() =>
                                      handleSheetSync(cfg.key, id, tabName)
                                    }
                                    disabled={syncingSheet === cfg.key || !id}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 5,
                                      padding: "6px 12px",
                                      background: id
                                        ? "var(--primary-dim)"
                                        : "var(--bg)",
                                      border: `1px solid ${id ? "var(--primary)" : "var(--border)"}`,
                                      borderRadius: 8,
                                      fontWeight: 700,
                                      fontSize: 11,
                                      cursor: id ? "pointer" : "default",
                                      color: id
                                        ? "var(--primary)"
                                        : "var(--text-3)",
                                      opacity: syncingSheet === cfg.key ? 0.6 : 1,
                                    }}
                                  >
                                    <Play size={11} />{" "}
                                    {syncingSheet === cfg.key
                                      ? "Syncing…"
                                      : "Sync"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                {/* Audit Logs */}
                {logs.length > 0 && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                    }}
                  >
                    <div
                      style={{
                        padding: "14px 20px",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <FileText
                          size={16}
                          style={{ color: "var(--primary)" }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                          Audit Logs
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--text-3)",
                            background: "var(--bg)",
                            border: "1px solid var(--border)",
                            borderRadius: 99,
                            padding: "1px 10px",
                          }}
                        >
                          {logs.length} entries
                        </span>
                      </div>
                      <button
                        onClick={refreshLogs}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 14px",
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          color: "var(--text-2)",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        <RefreshCw size={13} /> Refresh
                      </button>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className={sharedStyles.table}>
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Action</th>
                            <th>Status</th>
                            <th>Details</th>
                            <th style={{ textAlign: "right" }}>Duration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {logs.map((log, i) => (
                            <tr key={log.id ?? i}>
                              <td
                                style={{
                                  whiteSpace: "nowrap",
                                  fontSize: 12,
                                  color: "var(--text-3)",
                                }}
                              >
                                {fmtTime(log.timestamp)}
                              </td>
                              <td>
                                <StatusBadge status={log.action} />
                              </td>
                              <td>
                                <StatusBadge status={log.status} />
                              </td>
                              <td
                                style={{
                                  fontSize: 12,
                                  maxWidth: 360,
                                  wordBreak: "break-word",
                                }}
                              >
                                {log.details}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  fontSize: 12,
                                  color: "var(--text-3)",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {log.durationMs != null
                                  ? `${log.durationMs}ms`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SHEETS & FORMS CONFIG TAB ── */}
            {pipelineSubTab === "config" && (
              <div
                style={{ display: "flex", flexDirection: "column", gap: 24 }}
              >
                {/* Google Sheets Sync Configuration */}
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>
                      Google Sheets Configuration
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                      Sheet IDs and tab names used by background syncing and webhooks
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 16,
                    }}
                  >
                    {SHEETS_CONFIG.map((cfg) => (
                      <SheetCard
                        key={cfg.key}
                        cfg={cfg}
                        sheetId={(overview.sheetConfig as any)[cfg.key]?.id ?? ""}
                        tab={(overview.sheetConfig as any)[cfg.key]?.tab ?? ""}
                        onSave={(id, tab) =>
                          handleSheetSave(
                            cfg.label,
                            cfg.idKey,
                            cfg.tabKey,
                            id,
                            tab,
                          )
                        }
                        isSaving={savingSheet === cfg.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Google Forms Configuration (Form IDs & Session Dropdown Item IDs) */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-end",
                      marginBottom: 12,
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        Google Forms Configuration
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                        Google Form IDs and session dropdown item IDs. Sessions and options are managed in Dashboard &gt; Settings &gt; RC &amp; Ori Sessions.
                      </div>
                    </div>
                    <button
                      onClick={handleRebuildForms}
                      disabled={isRebuildingForms}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 16px",
                        background: "var(--primary)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                        opacity: isRebuildingForms ? 0.7 : 1,
                      }}
                    >
                      <Wrench size={13} /> {isRebuildingForms ? "Rebuilding Forms…" : "Rebuild Google Forms Now"}
                    </button>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: 16,
                    }}
                  >
                    {/* Orientation Form Card */}
                    <div
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 18px",
                          borderBottom: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          background: "var(--bg)",
                        }}
                      >
                        <span style={{ fontSize: 20 }}>🎓</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>Orientation Form</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                            Form ID and Session Dropdown Item ID
                          </div>
                        </div>
                        {oriFormId ? (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 99,
                              background: "var(--green-dim)",
                              color: "var(--green)",
                              fontWeight: 700,
                            }}
                          >
                            ✓ Configured
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 99,
                              background: "var(--bg)",
                              color: "var(--text-3)",
                              fontWeight: 700,
                              border: "1px solid var(--border)",
                            }}
                          >
                            Not set
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          padding: 16,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 9,
                              fontWeight: 700,
                              color: "var(--text-3)",
                              marginBottom: 4,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Google Form ID
                          </label>
                          <input
                            value={oriFormId}
                            onChange={(e) => setOriFormId(e.target.value)}
                            placeholder="1euyObOz6KNG3QgzdUG5otCxjfgV-0fZ9iCo3GFKKSXU"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              background: "var(--bg-input)",
                              color: "var(--text-1)",
                              fontSize: 12,
                              fontFamily: "monospace",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 9,
                              fontWeight: 700,
                              color: "var(--text-3)",
                              marginBottom: 4,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Session Dropdown Item ID
                          </label>
                          <input
                            value={oriSessionItemId}
                            onChange={(e) => setOriSessionItemId(e.target.value)}
                            placeholder="465ce0fd"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              background: "var(--bg-input)",
                              color: "var(--text-1)",
                              fontSize: 12,
                              fontFamily: "monospace",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                          <button
                            onClick={handleSaveOriForm}
                            disabled={savingFormKey === "ori"}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "7px 14px",
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontWeight: 600,
                              fontSize: 12,
                              cursor: "pointer",
                              color: "var(--text-2)",
                            }}
                          >
                            <Save size={12} /> {savingFormKey === "ori" ? "Saving…" : "Save Orientation Form"}
                          </button>
                          {oriFormId && (
                            <a
                              href={`https://docs.google.com/forms/d/${oriFormId}/edit`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "7px 14px",
                                background: "transparent",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 12,
                                color: "var(--text-3)",
                                textDecoration: "none",
                              }}
                            >
                              <ExternalLink size={12} /> Open Form in Google
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reading Circle Form Card */}
                    <div
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <div
                        style={{
                          padding: "12px 18px",
                          borderBottom: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          background: "var(--bg)",
                        }}
                      >
                        <span style={{ fontSize: 20 }}>📖</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>Reading Circle Form</div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                            Form ID and Session Dropdown Item IDs
                          </div>
                        </div>
                        {rcFormId ? (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 99,
                              background: "var(--green-dim)",
                              color: "var(--green)",
                              fontWeight: 700,
                            }}
                          >
                            ✓ Configured
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 99,
                              background: "var(--bg)",
                              color: "var(--text-3)",
                              fontWeight: 700,
                              border: "1px solid var(--border)",
                            }}
                          >
                            Not set
                          </span>
                        )}
                      </div>

                      <div
                        style={{
                          padding: 16,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 9,
                              fontWeight: 700,
                              color: "var(--text-3)",
                              marginBottom: 4,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Google Form ID
                          </label>
                          <input
                            value={rcFormId}
                            onChange={(e) => setRcFormId(e.target.value)}
                            placeholder="1NQPCb59uhpmo72BMxb9EHbxpAXqlmLlstyICTa8DJls"
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              background: "var(--bg-input)",
                              color: "var(--text-1)",
                              fontSize: 12,
                              fontFamily: "monospace",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 9,
                              fontWeight: 700,
                              color: "var(--text-3)",
                              marginBottom: 4,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Grades 1–4 Item IDs (comma-separated)
                          </label>
                          <input
                            value={rcLowerItemIds}
                            onChange={(e) => setRcLowerItemIds(e.target.value)}
                            placeholder="465ce0fd, ..."
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              background: "var(--bg-input)",
                              color: "var(--text-1)",
                              fontSize: 12,
                              fontFamily: "monospace",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 9,
                              fontWeight: 700,
                              color: "var(--text-3)",
                              marginBottom: 4,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Grades 5–8 Item IDs (comma-separated)
                          </label>
                          <input
                            value={rcUpperItemIds}
                            onChange={(e) => setRcUpperItemIds(e.target.value)}
                            placeholder="01d71c4c, ..."
                            style={{
                              width: "100%",
                              padding: "8px 10px",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              background: "var(--bg-input)",
                              color: "var(--text-1)",
                              fontSize: 12,
                              fontFamily: "monospace",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                          <button
                            onClick={handleSaveRcForm}
                            disabled={savingFormKey === "rc"}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "7px 14px",
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontWeight: 600,
                              fontSize: 12,
                              cursor: "pointer",
                              color: "var(--text-2)",
                            }}
                          >
                            <Save size={12} /> {savingFormKey === "rc" ? "Saving…" : "Save RC Form"}
                          </button>
                          {rcFormId && (
                            <a
                              href={`https://docs.google.com/forms/d/${rcFormId}/edit`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "7px 14px",
                                background: "transparent",
                                border: "1px solid var(--border)",
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 12,
                                color: "var(--text-3)",
                                textDecoration: "none",
                              }}
                            >
                              <ExternalLink size={12} /> Open Form in Google
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════ DATA CLEANUP ══════════ */}
        {tab === "cleanup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Danger Zone Banner */}
            <div
              style={{
                background: "rgba(253,107,86,0.08)",
                border: "1px solid var(--red)",
                borderRadius: 12,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", maxWidth: 650 }}>
                <Shield
                  size={20}
                  style={{ color: "var(--red)", flexShrink: 0, marginTop: 2 }}
                />
                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 15,
                      color: "var(--red)",
                      marginBottom: 4,
                    }}
                  >
                    Danger Zone — Targeted Data Cleanup & Reset
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.4 }}>
                    Delete data from <strong>specific tables</strong> individually without wiping everything, or perform a full system reset using the master nuke button.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowPurgeAllModal(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  background: "var(--red)",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)",
                  transition: "opacity 0.15s",
                }}
              >
                <Trash2 size={16} /> Nuke Database (Delete All Data)
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              {/* Category Pills */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[
                  { id: "all", label: `All Cleanable Tables (${TABLE_METAS.length})` },
                  {
                    id: "subscribers",
                    label: `Subscribers (${TABLE_METAS.filter((t) => t.category === "subscribers").length})`,
                  },
                  {
                    id: "operations",
                    label: `Operations (${TABLE_METAS.filter((t) => t.category === "operations").length})`,
                  },
                  {
                    id: "system",
                    label: `System Logs (${TABLE_METAS.filter((t) => t.category === "system").length})`,
                  },
                  {
                    id: "has_data",
                    label: `Has Data (${TABLE_METAS.filter((t) => (overview.tableCounts[t.key] ?? 0) > 0).length})`,
                  },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setCleanupCategory(f.id as any)}
                    style={{
                      padding: "6px 12px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: cleanupCategory === f.id ? 700 : 500,
                      background:
                        cleanupCategory === f.id
                          ? "var(--primary)"
                          : "var(--bg)",
                      color:
                        cleanupCategory === f.id
                          ? "white"
                          : "var(--text-2)",
                      border: `1px solid ${
                        cleanupCategory === f.id
                          ? "var(--primary)"
                          : "var(--border)"
                      }`,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Search Box */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "6px 10px",
                  minWidth: 240,
                }}
              >
                <Search size={14} style={{ color: "var(--text-3)" }} />
                <input
                  type="text"
                  placeholder="Filter tables by name or key..."
                  value={cleanupSearch}
                  onChange={(e) => setCleanupSearch(e.target.value)}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--text-1)",
                    fontSize: 12,
                    outline: "none",
                    width: "100%",
                  }}
                />
              </div>
            </div>

            {/* Tables Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 14,
              }}
            >
              {TABLE_METAS.filter((table) => {
                const count = overview.tableCounts[table.key] ?? 0;
                if (cleanupCategory === "subscribers" && table.category !== "subscribers")
                  return false;
                if (cleanupCategory === "operations" && table.category !== "operations")
                  return false;
                if (cleanupCategory === "system" && table.category !== "system")
                  return false;
                if (cleanupCategory === "has_data" && count === 0)
                  return false;
                if (cleanupSearch.trim()) {
                  const q = cleanupSearch.toLowerCase();
                  return (
                    table.label.toLowerCase().includes(q) ||
                    table.key.toLowerCase().includes(q) ||
                    table.description.toLowerCase().includes(q)
                  );
                }
                return true;
              }).map((table) => {
                const count = overview.tableCounts[table.key] ?? 0;
                const isCritical = table.danger === "critical";
                const isHigh = table.danger === "high";

                const riskBg = isCritical
                  ? "var(--red-dim)"
                  : isHigh
                  ? "rgba(239,68,68,0.12)"
                  : table.danger === "medium"
                  ? "var(--orange-dim)"
                  : "var(--blue-dim)";

                const riskColor = isCritical
                  ? "var(--red)"
                  : isHigh
                  ? "var(--red)"
                  : table.danger === "medium"
                  ? "var(--orange)"
                  : "var(--blue)";

                const riskText =
                  table.danger === "critical"
                    ? "CRITICAL"
                    : table.danger === "high"
                    ? "HIGH RISK"
                    : table.danger === "medium"
                    ? "MEDIUM"
                    : "LOGS";

                return (
                  <div
                    key={table.key}
                    style={{
                      background: "var(--bg-card)",
                      border: `1px solid ${
                        isCritical
                          ? "rgba(253,107,86,0.4)"
                          : count > 0
                          ? "var(--border)"
                          : "var(--border)"
                      }`,
                      borderRadius: 12,
                      padding: 18,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      gap: 14,
                      transition: "transform 0.1s, border-color 0.15s",
                    }}
                  >
                    <div>
                      {/* Card Header */}
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          marginBottom: 8,
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: "var(--text-1)" }}>
                            {table.label}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              marginTop: 4,
                            }}
                          >
                            <code
                              style={{
                                fontSize: 11,
                                color: "var(--primary)",
                                background: "var(--primary-dim)",
                                padding: "2px 6px",
                                borderRadius: 4,
                                fontFamily: "monospace",
                              }}
                            >
                              {table.key}
                            </code>
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--text-3)",
                              }}
                            >
                              · {table.categoryLabel}
                            </span>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: 10,
                            padding: "3px 8px",
                            borderRadius: 99,
                            background: riskBg,
                            color: riskColor,
                            fontWeight: 800,
                            letterSpacing: "0.03em",
                            flexShrink: 0,
                          }}
                        >
                          {riskText}
                        </span>
                      </div>

                      {/* Description */}
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-2)",
                          lineHeight: 1.45,
                          marginTop: 6,
                        }}
                      >
                        {table.description}
                      </div>

                      {/* Dependency Badge */}
                      {table.dependencies && (
                        <div
                          style={{
                            marginTop: 10,
                            fontSize: 11,
                            color: "var(--text-3)",
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Info size={12} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {table.dependencies}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Row Count & Delete Button */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: 12,
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 22,
                            fontWeight: 800,
                            color: count > 0 ? "var(--text-1)" : "var(--text-3)",
                            lineHeight: 1,
                          }}
                        >
                          {count.toLocaleString()}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-3)",
                            marginTop: 3,
                          }}
                        >
                          {count === 1 ? "1 row" : `${count.toLocaleString()} rows`}
                        </div>
                      </div>

                      <button
                        onClick={() => setPurgeTarget(table)}
                        disabled={count === 0}
                        title={count === 0 ? "Table has 0 rows" : `Delete all rows from ${table.label}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "8px 14px",
                          background:
                            count > 0 ? "var(--red-dim)" : "var(--bg)",
                          border: `1px solid ${
                            count > 0 ? "var(--red)" : "var(--border)"
                          }`,
                          borderRadius: 8,
                          color: count > 0 ? "var(--red)" : "var(--text-3)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: count > 0 ? "pointer" : "not-allowed",
                          transition: "all 0.15s",
                          opacity: count > 0 ? 1 : 0.6,
                        }}
                      >
                        <Trash2 size={13} /> {count > 0 ? "Delete Table Data" : "Empty Table"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {purgeTarget && (
          <PurgeDialog
            table={purgeTarget}
            rowCount={overview.tableCounts[purgeTarget.key] ?? 0}
            onConfirm={handlePurge}
            onCancel={() => setPurgeTarget(null)}
            isRunning={isPurging}
          />
        )}

        {showPurgeAllModal && (
          <PurgeAllDialog
            onConfirm={handlePurgeAll}
            onCancel={() => setShowPurgeAllModal(false)}
            isRunning={isPurging}
          />
        )}

        {/* ── Table Details Slide-over Drawer ── */}
        {isTablesDrawerOpen && (
          <>
            {/* Backdrop */}
            <div
              onClick={() => setIsTablesDrawerOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                zIndex: 9000,
                backdropFilter: "blur(2px)",
              }}
            />
            {/* Drawer Panel */}
            <div
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(520px, 95vw)",
                background: "var(--bg-card)",
                borderLeft: "1px solid var(--border)",
                zIndex: 9001,
                display: "flex",
                flexDirection: "column",
                boxShadow: "-8px 0 40px rgba(0,0,0,0.18)",
              }}
            >
              {/* Drawer Header */}
              <div
                style={{
                  padding: "20px 24px 16px",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexShrink: 0,
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--primary-dim)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Table2 size={16} style={{ color: "var(--primary)" }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>Database Table Details</div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 1 }}>
                        {Object.keys(overview.tableCounts).length} tables · {overview.totalRows.toLocaleString()} total records
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsTablesDrawerOpen(false)}
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", padding: 6, borderRadius: 6, display: "flex" }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search & Filter */}
              <div style={{ padding: "14px 24px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", gap: 10 }}>
                <div style={{ position: "relative", flex: 1 }}>
                  <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }} />
                  <input
                    value={tableDrawerSearch}
                    onChange={e => setTableDrawerSearch(e.target.value)}
                    placeholder="Search tables..."
                    style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-1)", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <select
                  value={tableDrawerCategory}
                  onChange={e => setTableDrawerCategory(e.target.value as any)}
                  style={{ padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text-1)", fontSize: 13, cursor: "pointer" }}
                >
                  <option value="all">All Categories</option>
                  <option value="subscribers">Subscribers</option>
                  <option value="operations">Operations</option>
                  <option value="system">System</option>
                </select>
              </div>

              {/* Table List */}
              <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 24px" }}>
                {(() => {
                  const PROTECTED = ["profiles", "app_config", "config_dropdowns"];
                  const allTables = [
                    ...TABLE_METAS,
                    { key: "profiles", label: "User Profiles", category: "system" as const, categoryLabel: "System & Config", danger: "low" as const, description: "Supabase auth profiles — permanently protected", pkType: "uuid" },
                    { key: "app_config", label: "App Config & Settings", category: "system" as const, categoryLabel: "System & Config", danger: "low" as const, description: "Google Sheet settings, form URLs, system config — permanently protected", pkType: "text" },
                    { key: "config_dropdowns", label: "Config Dropdowns", category: "system" as const, categoryLabel: "System & Config", danger: "low" as const, description: "Dropdown picklist values — permanently protected", pkType: "uuid" },
                  ];

                  const filtered = allTables.filter(t => {
                    const matchCategory = tableDrawerCategory === "all" || t.category === tableDrawerCategory;
                    const matchSearch = !tableDrawerSearch.trim() || t.label.toLowerCase().includes(tableDrawerSearch.toLowerCase()) || t.key.toLowerCase().includes(tableDrawerSearch.toLowerCase());
                    return matchCategory && matchSearch;
                  });

                  const categories = ["Subscribers & Directory", "Operations & Engagement", "System & Config", "System Logs"];
                  const grouped: Record<string, typeof filtered> = {};
                  filtered.forEach(t => {
                    const cat = t.categoryLabel;
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(t);
                  });

                  return Object.entries(grouped).map(([catLabel, tables]) => (
                    <div key={catLabel} style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-3)", marginBottom: 8, paddingTop: 8 }}>
                        {catLabel}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {tables.map(t => {
                          const count = overview.tableCounts[t.key] ?? 0;
                          const sharePct = overview.totalRows > 0 ? ((count / overview.totalRows) * 100) : 0;
                          const isProtected = PROTECTED.includes(t.key);
                          const dangerColor = t.danger === "critical" ? "#ef4444" : t.danger === "high" ? "#f97316" : t.danger === "medium" ? "#eab308" : "#6b7280";

                          return (
                            <div
                              key={t.key}
                              style={{
                                background: isProtected ? "rgba(16,185,129,0.04)" : "var(--bg)",
                                border: `1px solid ${isProtected ? "#d1fae5" : "var(--border)"}`,
                                borderRadius: 9,
                                padding: "10px 14px",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>{t.label}</span>
                                  {isProtected && (
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: "#d1fae5", color: "#059669", display: "flex", alignItems: "center", gap: 3 }}>
                                      <Shield size={9} /> Protected
                                    </span>
                                  )}
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text-1)", fontFamily: "monospace" }}>{count.toLocaleString()}</div>
                                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>{sharePct.toFixed(1)}%</div>
                                </div>
                              </div>
                              <code style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "monospace" }}>{t.key}</code>
                              <div style={{ height: 4, background: "var(--bg-card)", borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${Math.max(sharePct, 0.5)}%`,
                                    background: isProtected ? "#10b981" : dangerColor,
                                    borderRadius: 999,
                                    transition: "width 0.3s ease",
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </>
        )}

        {/* ══════════ ARCHIVED CUBS ══════════ */}
        {tab === "archived" && (
          <ArchivedCubsTab onRefreshOverview={refresh} />
        )}

        {/* ══════════ CONTACT EDIT APPROVALS ══════════ */}
        {tab === "approvals" && (
          <ApprovalsTab onRefreshOverview={refresh} />
        )}
      </div>
    </AppShell>
  );
}

