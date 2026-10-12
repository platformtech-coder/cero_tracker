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
  HardDrive,
  Link2,
  Play,
  Shield,
  BarChart3,
  Table2,
  Zap,
  Info,
  Clock,
  FileSpreadsheet,
  FormInput,
  ExternalLink,
  Save,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  clearTable,
  clearAllTables,
  triggerExternalSync,
  saveSheetConfig,
  getSyncLogs,
  getSystemOverview,
} from "@/lib/actions/system-admin";
import sharedStyles from "@/components/ui/dashboard.module.css";
import { AppShell } from "@/components/layout/AppShell";
import { FormsSetupTab } from "@/components/admin/FormsSetupTab";
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
  syncState: SyncEntry[];
  auditLog: AuditEntry[];
  pendingSignups: number;
  sheetConfig: {
    directory: SheetCfg;
    readingData: SheetCfg;
    scoreCalendar: SheetCfg;
    emailHistory: SheetCfg;
  };
  formConfig: {
    orientation: string;
    readingCircle: string;
  };
}
interface Props {
  overview: Overview;
  formsConfig: FormsConfig | null;
}

// ─── Constants ────────────────────────────────────────────────
const TABLE_LABELS: Record<string, string> = {
  cubs: "Cubs (Live)",
  master_cubs: "Master Cubs (Source)",
  interactions: "Interactions",
  actions: "Actions / Follow-ups",
  orientation: "Orientation Records",
  reading_circle: "Reading Circle",
  pending_signups: "Pending Signups",
  profiles: "User Profiles",
  config_dropdowns: "Config Dropdowns",
  audit_log: "Audit Log",
  sync_state: "Sync State",
  families: "Families",
  rc_attendance: "RC Attendance",
};

const CLEARABLE_TABLES = [
  {
    key: "interactions",
    label: "Interactions",
    danger: "high" as const,
    description: "All rep interaction records",
  },
  {
    key: "actions",
    label: "Actions / Follow-ups",
    danger: "high" as const,
    description: "All pending and completed actions",
  },
  {
    key: "audit_log",
    label: "Audit Log",
    danger: "medium" as const,
    description: "System event and sync log history",
  },
  {
    key: "pending_signups",
    label: "Pending Signups",
    danger: "medium" as const,
    description: "Unprocessed orientation & RC signups",
  },
  {
    key: "orientation",
    label: "Orientation Records",
    danger: "high" as const,
    description: "All orientation journey entries",
  },
  {
    key: "reading_circle",
    label: "Reading Circle",
    danger: "high" as const,
    description: "RC roster and attendance",
  },
  {
    key: "rc_attendance",
    label: "RC Attendance",
    danger: "medium" as const,
    description: "Reading circle attendance sessions",
  },
];

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

const FORMS_CONFIG = [
  {
    key: "orientation",
    urlKey: "form_orientation_url",
    label: "Orientation Form",
    icon: "🎓",
    desc: "Google Form for new cubs applying for orientation",
    color: "var(--primary)",
    bg: "var(--primary-dim)",
  },
  {
    key: "readingCircle",
    urlKey: "form_reading_circle_url",
    label: "Reading Circle Form",
    icon: "📖",
    desc: "Google Form for cubs signing up for the reading circle",
    color: "var(--green)",
    bg: "var(--green-dim)",
  },
] as const;

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
  label,
  onConfirm,
  onCancel,
  isRunning,
}: {
  label: string;
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
          border: "1px solid var(--red)",
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
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Confirm Deletion
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>
              This action is irreversible
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
          ⚠️ You are about to delete <strong>ALL rows</strong> in{" "}
          <strong>{label}</strong>.
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
            DELETE
          </code>{" "}
          to confirm
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="DELETE"
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
            disabled={text !== "DELETE" || isRunning}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 8,
              background: text === "DELETE" ? "var(--red)" : "var(--red-dim)",
              color: text === "DELETE" ? "#fff" : "var(--text-3)",
              fontWeight: 700,
              cursor: text === "DELETE" ? "pointer" : "default",
              transition: "all 0.15s",
              opacity: isRunning ? 0.7 : 1,
            }}
          >
            {isRunning ? "⏳ Deleting..." : "🗑️ Delete All"}
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
          ⚠️ You are about to delete <strong>all operational tracker data</strong> (Cubs, Master Cubs, Families, Interactions, Actions, Orientation, Reading Circle, and Pending Signups).
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>
            🔒 <strong>Protected & Preserved:</strong> User Accounts (Profiles), Dropdown Configurations (<code style={{ fontSize: 11 }}>config_dropdowns</code>), Google Sheet Settings, and Form Settings (<code style={{ fontSize: 11 }}>app_config</code>) are safe and will <strong>NOT</strong> be deleted.
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

// ─── Form Card ────────────────────────────────────────────────
function FormCard({
  cfg,
  url,
  onSave,
  isSaving,
}: {
  cfg: (typeof FORMS_CONFIG)[number];
  url: string;
  onSave: (url: string) => void;
  isSaving: boolean;
}) {
  const [localUrl, setLocalUrl] = useState(url);
  const isConfigured = !!localUrl;

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
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>{cfg.desc}</div>
        </div>
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
            ✓ Connected
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
            Google Form URL
          </label>
          <input
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="https://docs.google.com/forms/d/…"
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

        <div
          style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}
        >
          <button
            onClick={() => onSave(localUrl)}
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
            <Save size={12} /> {isSaving ? "Saving…" : "Save URL"}
          </button>
          {localUrl && (
            <a
              href={localUrl}
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
              <ExternalLink size={12} /> Open Form
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
  const tab: 'overview' | 'pipeline' | 'cleanup' = 
    rawTab === 'pipeline' ? 'pipeline' : rawTab === 'cleanup' ? 'cleanup' : 'overview';
  const setTab = useCallback((t: 'overview' | 'pipeline' | 'cleanup') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`/system-admin?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const rawSubTab = searchParams.get('subtab');
  const pipelineSubTab: 'sync' | 'config' | 'form_settings' = rawSubTab === 'config' ? 'config' : rawSubTab === 'form_settings' ? 'form_settings' : 'sync';
  const setPipelineSubTab = useCallback((t: 'sync' | 'config' | 'form_settings') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('subtab', t);
    router.replace(`/system-admin?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
  const [overview, setOverview] = useState(init);
  const [logs, setLogs] = useState<AuditEntry[]>(init.auditLog);
  const [isPending, startTransition] = useTransition();

  // Per-sheet save/sync states
  const [savingSheet, setSavingSheet] = useState<string | null>(null);
  const [syncingSheet, setSyncingSheet] = useState<string | null>(null);
  const [savingForm, setSavingForm] = useState<string | null>(null);

  const [purgeTarget, setPurgeTarget] = useState<{
    key: string;
    label: string;
  } | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [showPurgeAllModal, setShowPurgeAllModal] = useState(false);

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

  const handleFormSave = async (
    formKey: string,
    urlKey: string,
    url: string,
  ) => {
    setSavingForm(formKey);
    const res = await saveSheetConfig({ [urlKey]: url });
    setSavingForm(null);
    if (res.success) {
      toast.success(`${formKey} URL saved`);
      refresh();
    } else toast.error(res.error ?? "Failed to save");
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

  const handlePurge = async (confirmText: string) => {
    if (!purgeTarget || confirmText !== "DELETE") return;
    setIsPurging(true);
    const res = await clearTable(purgeTarget.key, confirmText);
    setIsPurging(false);
    setPurgeTarget(null);
    if (res.success) {
      toast.success(
        `Cleared ${res.rowsCleared ?? "all"} rows from ${purgeTarget.label}`,
      );
      refresh();
    } else {
      toast.error(res.error);
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
    { id: "pipeline", label: "Pipeline & Sync", icon: Cloud },
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
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
                gap: 12,
              }}
            >
              {[
                {
                  icon: Database,
                  label: "Total Rows",
                  value: overview.totalRows.toLocaleString(),
                  sub: "Across all monitored tables",
                  color: "var(--primary)",
                  bg: "var(--primary-dim)",
                },
                {
                  icon: Zap,
                  label: "DB Latency",
                  value: `${overview.latencyMs}ms`,
                  sub: latencyLabel,
                  color: latencyColor,
                  bg: `${latencyColor}20`,
                },
                {
                  icon: Activity,
                  label: "Active Tables",
                  value: Object.keys(overview.tableCounts).length,
                  sub: "Monitored by this panel",
                  color: "var(--blue)",
                  bg: "var(--blue-dim)",
                },
                {
                  icon: AlertTriangle,
                  label: "Pending Signups",
                  value: overview.pendingSignups,
                  sub: "Awaiting processing",
                  color:
                    overview.pendingSignups > 0
                      ? "var(--orange)"
                      : "var(--green)",
                  bg:
                    overview.pendingSignups > 0
                      ? "var(--orange-dim)"
                      : "var(--green-dim)",
                },
                {
                  icon: FileText,
                  label: "Audit Entries",
                  value: overview.auditLog.length,
                  sub: "Last 50 events",
                  color: "var(--text-2)",
                  bg: "var(--bg)",
                },
              ].map(({ icon: Icon, label, value, sub, color, bg }) => (
                <div
                  key={label}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: "1rem 1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-3)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {label}
                    </span>
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={14} style={{ color }} />
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      color: "var(--text-1)",
                      letterSpacing: "-0.5px",
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Table Counts */}
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
                  gap: 8,
                }}
              >
                <Table2 size={16} style={{ color: "var(--primary)" }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Database Table Counts
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th style={{ textAlign: "right" }}>Rows</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(overview.tableCounts)
                      .sort(([, a], [, b]) => b - a)
                      .map(([table, count]) => (
                        <tr key={table}>
                          <td>
                            <span style={{ fontWeight: 600 }}>
                              {TABLE_LABELS[table] ?? table}
                            </span>
                            <code
                              style={{
                                fontSize: 11,
                                color: "var(--text-3)",
                                marginLeft: 8,
                              }}
                            >
                              {table}
                            </code>
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontWeight: 700,
                              fontFamily: "monospace",
                            }}
                          >
                            {count.toLocaleString()}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                              }}
                            >
                              <div
                                style={{
                                  flex: 1,
                                  height: 6,
                                  background: "var(--bg)",
                                  borderRadius: 99,
                                  overflow: "hidden",
                                  minWidth: 80,
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    width: `${overview.totalRows > 0 ? Math.min((count / overview.totalRows) * 100, 100) : 0}%`,
                                    background: "var(--primary)",
                                    borderRadius: 99,
                                  }}
                                />
                              </div>
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "var(--text-3)",
                                  width: 36,
                                  textAlign: "right",
                                }}
                              >
                                {overview.totalRows > 0
                                  ? (
                                      (count / overview.totalRows) *
                                      100
                                    ).toFixed(1)
                                  : 0}
                                %
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sync State */}
            {overview.syncState.length > 0 && (
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
                    gap: 8,
                  }}
                >
                  <Settings2 size={16} style={{ color: "var(--primary)" }} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>
                    Current Sync State
                  </span>
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
                      </tr>
                    </thead>
                    <tbody>
                      {overview.syncState.map((s) => (
                        <tr key={s.key}>
                          <td>
                            <code
                              style={{ fontFamily: "monospace", fontSize: 12 }}
                            >
                              {s.label}
                            </code>
                          </td>
                          <td>
                            <StatusBadge status={s.status} />
                          </td>
                          <td
                            style={{
                              textAlign: "right",
                              fontFamily: "monospace",
                            }}
                          >
                            {s.processedCount}
                          </td>
                          <td
                            style={{
                              fontSize: 12,
                              color: "var(--text-3)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {fmtTime(s.lastRunAt)}
                          </td>
                          <td
                            style={{
                              fontSize: 12,
                              color: "var(--red)",
                              maxWidth: 200,
                              wordBreak: "break-word",
                            }}
                          >
                            {s.error ?? "—"}
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

        {/* ══════════ PIPELINE & SYNC ══════════ */}
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
                  label: "Sheets & Forms URLs",
                  icon: FileSpreadsheet,
                },
                {
                  id: "form_settings",
                  label: "Forms Setup",
                  icon: FormInput,
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
                style={{ display: "flex", flexDirection: "column", gap: 20 }}
              >
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

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: 16,
                  }}
                >
                  {FORMS_CONFIG.map((cfg) => (
                    <FormCard
                      key={cfg.key}
                      cfg={cfg}
                      url={(overview.formConfig as any)[cfg.key] ?? ""}
                      onSave={(url) =>
                        handleFormSave(cfg.label, cfg.urlKey, url)
                      }
                      isSaving={savingForm === cfg.label}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── FORMS SETUP TAB ── */}
            {pipelineSubTab === "form_settings" && (
              <FormsSetupTab initialConfig={formsConfig ?? {
                oriFormId: '1euyObOz6KNG3QgzdUG5otCxjfgV-0fZ9iCo3GFKKSXU',
                oriSessionItemId: KNOWN_ORI_SESSION_ITEM_ID,
                oriSessions: DEFAULT_ORI_SESSIONS,
                rcFormId: '1NQPCb59uhpmo72BMxb9EHbxpAXqlmLlstyICTa8DJls',
                rcSessionsLower: DEFAULT_RC_SESSIONS_LOWER,
                rcSessionsUpper: DEFAULT_RC_SESSIONS_UPPER,
                rcCategoryLower: 'Word Astronauts',
                rcCategoryUpper: 'Word Miners',
                rcGradeMapping: [],
                rcLowerItemIds: KNOWN_RC_LOWER_ITEM_IDS,
                rcUpperItemIds: KNOWN_RC_UPPER_ITEM_IDS,
              }} />
            )}
          </div>
        )}

        {/* ══════════ DATA CLEANUP ══════════ */}
        {tab === "cleanup" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div
              style={{
                background: "rgba(253,107,86,0.08)",
                border: "1px solid var(--red)",
                borderRadius: 10,
                padding: "14px 18px",
                display: "flex",
                gap: 12,
              }}
            >
              <Shield
                size={18}
                style={{ color: "var(--red)", flexShrink: 0, marginTop: 2 }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: "var(--red)",
                    marginBottom: 4,
                  }}
                >
                  Danger Zone — Destructive Actions
                </div>
                <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 12 }}>
                  You can clear individual tables below, or completely purge all data from the database using the master button.
                </div>
                
                <button
                  onClick={() => setShowPurgeAllModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "10px 18px",
                    background: "var(--red)",
                    color: "white",
                    border: "none",
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  <Trash2 size={16} /> Nuke Database (Delete All Data)
                </button>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: 14,
              }}
            >
              {CLEARABLE_TABLES.map((table) => {
                const count = overview.tableCounts[table.key] ?? 0;
                const isHigh = table.danger === "high";
                return (
                  <div
                    key={table.key}
                    style={{
                      background: "var(--bg-card)",
                      border: `1px solid ${isHigh ? "rgba(253,107,86,0.3)" : "var(--border)"}`,
                      borderRadius: 12,
                      padding: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          {table.label}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-3)",
                            marginTop: 3,
                          }}
                        >
                          {table.description}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 99,
                          background: isHigh
                            ? "var(--red-dim)"
                            : "var(--orange-dim)",
                          color: isHigh ? "var(--red)" : "var(--orange)",
                          fontWeight: 700,
                          marginLeft: 8,
                          flexShrink: 0,
                        }}
                      >
                        {isHigh ? "⚠ HIGH RISK" : "MEDIUM"}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 22,
                          fontWeight: 800,
                          color: count > 0 ? "var(--text-1)" : "var(--text-3)",
                        }}
                      >
                        {count.toLocaleString()}{" "}
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 400,
                            color: "var(--text-3)",
                          }}
                        >
                          rows
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          setPurgeTarget({ key: table.key, label: table.label })
                        }
                        disabled={count === 0}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 14px",
                          background:
                            count > 0 ? "var(--red-dim)" : "var(--bg)",
                          border: `1px solid ${count > 0 ? "var(--red)" : "var(--border)"}`,
                          borderRadius: 8,
                          color: count > 0 ? "var(--red)" : "var(--text-3)",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: count > 0 ? "pointer" : "default",
                          transition: "all 0.15s",
                        }}
                      >
                        <Trash2 size={13} /> Clear All
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
            label={purgeTarget.label}
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
      </div>
    </AppShell>
  );
}
