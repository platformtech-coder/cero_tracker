"use client";

import React from "react";
import {
  RefreshCw,
  FileSpreadsheet,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Settings2,
  Play,
  FileText,
  Wrench,
  Save,
  ExternalLink,
} from "lucide-react";
import type { Overview, AuditEntry } from "./types";
import { SHEETS_CONFIG, StatusBadge, fmtTime } from "./types";
import { SheetCard } from "./SheetCard";
import sharedStyles from "@/components/ui/dashboard.module.css";
import type { FormRebuildTarget } from "@/lib/actions/forms";

export interface PipelineTabProps {
  pipelineSubTab: "sync" | "config";
  setPipelineSubTab: (tab: "sync" | "config") => void;
  overview: Overview;
  logs: AuditEntry[];
  syncingSheet: string | null;
  isPurging: boolean;
  isMigratingRC: boolean;
  rcMigrationResult: { success: boolean; message: string; details?: string } | null;
  handleMigrateRC: () => Promise<void>;
  handleSyncAll: () => Promise<void>;
  handleSheetSync: (sheetKey: string, id: string, tabName: string) => Promise<void>;
  refreshLogs: () => Promise<void>;
  savingSheet: string | null;
  handleSheetSave: (
    label: string,
    idKey: string,
    tabKey: string,
    id: string,
    tab: string
  ) => Promise<void>;
  isRebuildingForms: boolean;
  rebuildingFormTarget?: FormRebuildTarget | null;
  handleRebuildForms: (target?: FormRebuildTarget) => Promise<void>;
  oriFormId: string;
  setOriFormId: (v: string) => void;
  oriSessionItemId: string;
  setOriSessionItemId: (v: string) => void;
  rcFormId: string;
  setRcFormId: (v: string) => void;
  rcLowerItemIds: string;
  setRcLowerItemIds: (v: string) => void;
  rcUpperItemIds: string;
  setRcUpperItemIds: (v: string) => void;
  savingFormKey: string | null;
  handleSaveOriForm: () => Promise<void>;
  handleSaveRcForm: () => Promise<void>;
}

export const PipelineTab: React.FC<PipelineTabProps> = ({
  pipelineSubTab,
  setPipelineSubTab,
  overview,
  logs,
  syncingSheet,
  isPurging,
  isMigratingRC,
  rcMigrationResult,
  handleMigrateRC,
  handleSyncAll,
  handleSheetSync,
  refreshLogs,
  savingSheet,
  handleSheetSave,
  isRebuildingForms,
  rebuildingFormTarget,
  handleRebuildForms,
  oriFormId,
  setOriFormId,
  oriSessionItemId,
  setOriSessionItemId,
  rcFormId,
  setRcFormId,
  rcLowerItemIds,
  setRcLowerItemIds,
  rcUpperItemIds,
  setRcUpperItemIds,
  savingFormKey,
  handleSaveOriForm,
  handleSaveRcForm,
}) => {
  return (
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
              background: pipelineSubTab === id ? "var(--bg-card)" : "transparent",
              color: pipelineSubTab === id ? "var(--text-1)" : "var(--text-3)",
              fontWeight: pipelineSubTab === id ? 700 : 500,
              fontSize: 13,
              cursor: "pointer",
              boxShadow: pipelineSubTab === id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                <Settings2 size={16} style={{ color: "var(--primary)" }} />
                <span style={{ fontWeight: 700, fontSize: 14 }}>Current Sync State</span>
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
                    animation: syncingSheet ? "spin 1s linear infinite" : undefined,
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
                    const stateMatch = overview.syncState.find(
                      (s) =>
                        s.key.toLowerCase().replace(/_sync/g, "").replace(/_/g, "").replace(/ /g, "") ===
                          cfg.key.toLowerCase() ||
                        s.label.toLowerCase().replace(/_/g, "").replace(/ /g, "") === cfg.key.toLowerCase() ||
                        s.key.toLowerCase() === cfg.key.toLowerCase()
                    );

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
                          <code style={{ fontFamily: "monospace", fontSize: 12 }}>{cfg.label}</code>
                        </td>
                        <td>
                          <StatusBadge status={stateMatch?.status || "unset"} />
                        </td>
                        <td style={{ textAlign: "right", fontFamily: "monospace" }}>
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
                            onClick={() => handleSheetSync(cfg.key, id, tabName)}
                            disabled={syncingSheet === cfg.key || !id}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "6px 12px",
                              background: id ? "var(--primary-dim)" : "var(--bg)",
                              border: `1px solid ${id ? "var(--primary)" : "var(--border)"}`,
                              borderRadius: 8,
                              fontWeight: 700,
                              fontSize: 11,
                              cursor: id ? "pointer" : "default",
                              color: id ? "var(--primary)" : "var(--text-3)",
                              opacity: syncingSheet === cfg.key ? 0.6 : 1,
                            }}
                          >
                            <Play size={11} /> {syncingSheet === cfg.key ? "Syncing…" : "Sync"}
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
                  <FileText size={16} style={{ color: "var(--primary)" }} />
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Audit Logs</span>
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
                          {log.durationMs != null ? `${log.durationMs}ms` : "—"}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Google Sheets Sync Configuration */}
          <div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Google Sheets Configuration</div>
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
                  onSave={(id: string, tab: string) =>
                    handleSheetSave(cfg.label, cfg.idKey, cfg.tabKey, id, tab)
                  }
                  isSaving={savingSheet === cfg.label}
                />
              ))}
            </div>
          </div>

          {/* Google Forms Configuration */}
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
                <div style={{ fontWeight: 700, fontSize: 14 }}>Google Forms Configuration</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
                  Google Form IDs and session dropdown item IDs. Sessions and options are managed in Dashboard &gt; Settings &gt; RC &amp; Ori Sessions.
                </div>
              </div>
              <button
                onClick={() => handleRebuildForms("all")}
                disabled={isRebuildingForms}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 16px",
                  background: "transparent",
                  color: "var(--text-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                  opacity: isRebuildingForms ? 0.7 : 1,
                }}
              >
                <Wrench size={13} /> {isRebuildingForms && rebuildingFormTarget === "all" ? "Rebuilding Both Forms…" : "Rebuild Both Google Forms"}
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
                    <button
                      onClick={() => handleRebuildForms("orientation")}
                      disabled={isRebuildingForms}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "7px 14px",
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
                      <Wrench size={12} /> {isRebuildingForms && rebuildingFormTarget === "orientation" ? "Rebuilding…" : "Rebuild Orientation Form"}
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
                    <button
                      onClick={() => handleRebuildForms("reading-circle")}
                      disabled={isRebuildingForms}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "7px 14px",
                        background: "var(--green)",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: "pointer",
                        opacity: isRebuildingForms ? 0.7 : 1,
                      }}
                    >
                      <Wrench size={12} /> {isRebuildingForms && rebuildingFormTarget === "reading-circle" ? "Rebuilding…" : "Rebuild Reading Circle Form"}
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
  );
};
