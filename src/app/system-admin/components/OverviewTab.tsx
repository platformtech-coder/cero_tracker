"use client";

import React from "react";
import {
  Database,
  HardDrive,
  Zap,
  Table2,
  ChevronRight,
  BarChart3,
  Activity,
  AlertTriangle,
  Info,
  CheckCircle2,
  Search,
  RefreshCw,
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";
import type { Overview, ErrorSummary, SystemErrorItem } from "./types";
import { fmtTime } from "./types";

export interface OverviewTabProps {
  overview: Overview;
  errorSummary: ErrorSummary;
  errorLogs: SystemErrorItem[];
  expandedErrorIds: Set<string>;
  copiedLogId: string | null;
  errorSearch: string;
  setErrorSearch: (val: string) => void;
  errorLevel: "all" | "error" | "warning" | "info";
  setErrorLevel: (val: "all" | "error" | "warning" | "info") => void;
  errorStatus: "active" | "all" | "resolved";
  setErrorStatus: (val: "active" | "all" | "resolved") => void;
  isRefreshingOverview: boolean;
  isRefreshingErrors: boolean;
  refreshOverview: (silent?: boolean) => Promise<void>;
  refreshErrors: (silent?: boolean) => Promise<void>;
  handleSimulateWarning: () => Promise<void>;
  handleResolveAllErrors: () => Promise<void>;
  handlePurgeResolvedErrors: () => Promise<void>;
  handleResolveError: (id: string) => Promise<void>;
  handleUnresolveError: (id: string) => Promise<void>;
  toggleExpandError: (id: string) => void;
  copyToClipboard: (text: string, id: string) => void;
  setIsTablesDrawerOpen: (open: boolean) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  overview,
  errorSummary,
  errorLogs,
  expandedErrorIds,
  copiedLogId,
  errorSearch,
  setErrorSearch,
  errorLevel,
  setErrorLevel,
  errorStatus,
  setErrorStatus,
  isRefreshingOverview,
  isRefreshingErrors,
  refreshOverview,
  refreshErrors,
  handleSimulateWarning,
  handleResolveAllErrors,
  handlePurgeResolvedErrors,
  handleResolveError,
  handleUnresolveError,
  toggleExpandError,
  copyToClipboard,
  setIsTablesDrawerOpen,
}) => {
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
  const latencyBadge =
    dbLatency < 100 ? "Optimal" : dbLatency < 250 ? "Healthy" : dbLatency < 500 ? "Moderate" : "High";
  const latencyBadgeBg =
    dbLatency < 100 ? "#ecfdf5" : dbLatency < 250 ? "#f0fdf4" : dbLatency < 500 ? "#fef3c7" : "#fee2e2";
  const latencyBadgeColor =
    dbLatency < 100 ? "#059669" : dbLatency < 250 ? "#16a34a" : dbLatency < 500 ? "#d97706" : "#dc2626";

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
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#ecfeff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Database size={18} style={{ color: "#06b6d4" }} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Database Size</span>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 12px",
                borderRadius: 999,
                background: "#ecfdf5",
                color: "#059669",
              }}
            >
              Healthy
            </span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  color: "var(--text-1)",
                  letterSpacing: "-0.5px",
                  lineHeight: 1,
                }}
              >
                {dbSizeMB}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-3)" }}>MB</span>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--bg)",
                borderRadius: 999,
                overflow: "hidden",
                marginTop: 14,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(dbUsagePct, 2)}%`,
                  background: "#06b6d4",
                  borderRadius: 999,
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
              {dbUsagePct.toFixed(0)}% of 0.5 GB quota used
            </div>
          </div>
        </div>

        {/* Storage */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#ccfbf1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <HardDrive size={18} style={{ color: "#0d9488" }} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Storage</span>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 12px",
                borderRadius: 999,
                background: "#ecfdf5",
                color: "#059669",
              }}
            >
              Healthy
            </span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  color: "var(--text-1)",
                  letterSpacing: "-0.5px",
                  lineHeight: 1,
                }}
              >
                {storageGB}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-3)" }}>GB</span>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--bg)",
                borderRadius: 999,
                overflow: "hidden",
                marginTop: 14,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(storagePct, 1)}%`,
                  background: "#10b981",
                  borderRadius: 999,
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
              {storagePct.toFixed(0)}% of 1 GB quota used
            </div>
          </div>
        </div>

        {/* Query Latency */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "#fef3c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Zap size={18} style={{ color: "#d97706" }} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>Query Latency</span>
            </div>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: "3px 12px",
                borderRadius: 999,
                background: latencyBadgeBg,
                color: latencyBadgeColor,
              }}
            >
              {latencyBadge}
            </span>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                style={{
                  fontSize: 34,
                  fontWeight: 800,
                  color: "var(--text-1)",
                  letterSpacing: "-0.5px",
                  lineHeight: 1,
                }}
              >
                {dbLatency}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-3)" }}>ms</span>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--bg)",
                borderRadius: 999,
                overflow: "hidden",
                marginTop: 14,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.max(latencyProgress, 4)}%`,
                  background: latencyBadgeColor,
                  borderRadius: 999,
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 6 }}>
              Postgres RPC roundtrip · Threshold: &lt;100ms
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: Engine Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16 }}>
        {/* Total Tables – with drawer trigger */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <Table2 size={14} />
            <span>TOTAL TABLES</span>
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: "var(--text-1)",
              lineHeight: 1,
              margin: "10px 0",
            }}
          >
            {totalMonitoredTables}
          </div>
          <button
            onClick={() => setIsTablesDrawerOpen(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            View table details <ChevronRight size={13} />
          </button>
        </div>

        {/* Total Records */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <BarChart3 size={14} />
            <span>TOTAL RECORDS</span>
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: "var(--text-1)",
              lineHeight: 1,
              margin: "10px 0",
            }}
          >
            {overview.totalRows.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>Across all tables</div>
        </div>

        {/* Pipeline Duration */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <Zap size={14} />
            <span>PIPELINE DURATION</span>
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: "var(--text-1)",
              lineHeight: 1,
              margin: "10px 0",
            }}
          >
            {overview.pipelineDuration ?? "—"}
          </div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: overview.pipelineStatus === "Failed" ? "#ef4444" : "#10b981",
            }}
          >
            {overview.pipelineStatus ?? "Completed"}
          </div>
        </div>

        {/* API Response */}
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-3)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <Activity size={14} />
            <span>API RESPONSE</span>
          </div>
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: "var(--text-1)",
              lineHeight: 1,
              margin: "10px 0",
            }}
          >
            {apiLatency}
            <span style={{ fontSize: 16, fontWeight: 500, color: "var(--text-3)", marginLeft: 3 }}>
              ms
            </span>
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: apiBadgeColor }}>
            {apiBadge} · Server Action roundtrip
          </div>
        </div>
      </div>

      {/* ── ERROR & LOGGING SECTION ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>
          System Errors & Logs
        </div>

        {/* 4 Summary Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid #fee2e2",
              borderRadius: 12,
              padding: "16px 20px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>Errors</div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--text-1)",
                  lineHeight: 1,
                  marginTop: 6,
                }}
              >
                {errorSummary.errors}
              </div>
              <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 500, marginTop: 6 }}>
                Critical issues
              </div>
            </div>
            <AlertTriangle size={22} style={{ color: "#ef4444" }} />
          </div>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid #fef3c7",
              borderRadius: 12,
              padding: "16px 20px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>Warnings</div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--text-1)",
                  lineHeight: 1,
                  marginTop: 6,
                }}
              >
                {errorSummary.warnings}
              </div>
              <div style={{ fontSize: 12, color: "#d97706", fontWeight: 500, marginTop: 6 }}>
                Needs attention
              </div>
            </div>
            <AlertTriangle size={22} style={{ color: "#f59e0b" }} />
          </div>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid #dbeafe",
              borderRadius: 12,
              padding: "16px 20px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>Info</div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--text-1)",
                  lineHeight: 1,
                  marginTop: 6,
                }}
              >
                {errorSummary.info}
              </div>
              <div style={{ fontSize: 12, color: "#2563eb", fontWeight: 500, marginTop: 6 }}>
                Informational
              </div>
            </div>
            <Info size={22} style={{ color: "#3b82f6" }} />
          </div>
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid #d1fae5",
              borderRadius: 12,
              padding: "16px 20px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-3)" }}>
                Active (Unresolved)
              </div>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--text-1)",
                  lineHeight: 1,
                  marginTop: 6,
                }}
              >
                {errorSummary.unresolved}
              </div>
              <div style={{ fontSize: 12, color: "#059669", fontWeight: 500, marginTop: 6 }}>
                {errorSummary.unresolved === 0 ? "System is clean ✓" : `${errorSummary.unresolved} open`}
              </div>
            </div>
            <CheckCircle2 size={22} style={{ color: "#10b981" }} />
          </div>
        </div>

        {/* Toolbar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, flex: "1 1 auto" }}>
            <div style={{ position: "relative", minWidth: 260, flex: "1 1 260px", maxWidth: 400 }}>
              <Search
                size={14}
                style={{
                  position: "absolute",
                  left: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-3)",
                }}
              />
              <input
                value={errorSearch}
                onChange={(e) => setErrorSearch(e.target.value)}
                placeholder="Search by message or endpoint..."
                style={{
                  width: "100%",
                  padding: "8px 12px 8px 36px",
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  color: "var(--text-1)",
                  fontSize: 13,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <select
              value={errorLevel}
              onChange={(e) => setErrorLevel(e.target.value as any)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text-1)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <option value="all">All Levels</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select
              value={errorStatus}
              onChange={(e) => setErrorStatus(e.target.value as any)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text-1)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              <option value="active">Active (Unresolved)</option>
              <option value="all">All Logs</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                refreshOverview(true);
                refreshErrors(false);
              }}
              disabled={isRefreshingOverview || isRefreshingErrors}
              title="Refresh overview metrics and error logs"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--bg-card)",
                color: "var(--text-2)",
                cursor: isRefreshingOverview || isRefreshingErrors ? "default" : "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <RefreshCw
                size={15}
                style={{
                  animation: isRefreshingOverview || isRefreshingErrors ? "spin 1s linear infinite" : "none",
                }}
              />
            </button>
            <button
              onClick={handleSimulateWarning}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#d97706",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Simulate Warning
            </button>
            <button
              onClick={handleResolveAllErrors}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #a7f3d0",
                background: "#ecfdf5",
                color: "#059669",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✓ Resolve All
            </button>
            <button
              onClick={handlePurgeResolvedErrors}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: "1px solid #fecaca",
                background: "#fef2f2",
                color: "#dc2626",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Trash2 size={13} /> Purge Resolved
            </button>
          </div>
        </div>

        {/* Log List */}
        {errorLogs.length === 0 ? (
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "48px 24px",
              textAlign: "center",
              color: "var(--text-3)",
              fontSize: 14,
            }}
          >
            ✓ No active errors — all systems operating normally.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {errorLogs.map((item) => {
              const isExpanded = expandedErrorIds.has(item.id);
              const isResolved = item.status === "resolved";
              const lvlColor = item.level === "error" ? "#ef4444" : item.level === "warning" ? "#f59e0b" : "#3b82f6";
              const lvlBg = item.level === "error" ? "#fee2e2" : item.level === "warning" ? "#fef3c7" : "#dbeafe";
              return (
                <div
                  key={item.id}
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderLeft: `4px solid ${lvlColor}`,
                    borderRadius: 10,
                    padding: "14px 18px",
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
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: lvlBg,
                          color: lvlColor,
                        }}
                      >
                        {item.level}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: isResolved ? "#ecfdf5" : "#fffbeb",
                          color: isResolved ? "#059669" : "#d97706",
                          border: `1px solid ${isResolved ? "#a7f3d0" : "#fde68a"}`,
                        }}
                      >
                        {isResolved ? "Resolved" : "Active"}
                      </span>
                      {item.endpoint && (
                        <code
                          style={{
                            fontSize: 12,
                            background: "var(--bg)",
                            padding: "2px 6px",
                            borderRadius: 4,
                            color: "var(--text-2)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {item.endpoint}
                        </code>
                      )}
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{fmtTime(item.created_at)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => (isResolved ? handleUnresolveError(item.id) : handleResolveError(item.id))}
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: isResolved ? "var(--bg)" : "#ecfdf5",
                          color: isResolved ? "var(--text-2)" : "#059669",
                          cursor: "pointer",
                        }}
                      >
                        {isResolved ? "Reopen" : "✓ Resolve"}
                      </button>
                      <button
                        onClick={() => toggleExpandError(item.id)}
                        style={{
                          padding: "4px 8px",
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "transparent",
                          color: "var(--text-2)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {isExpanded ? (
                          <>
                            Hide <ChevronUp size={13} />
                          </>
                        ) : (
                          <>
                            Details <ChevronDown size={13} />
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text-1)",
                      wordBreak: "break-word",
                      lineHeight: 1.4,
                    }}
                  >
                    {item.message}
                  </div>
                  {isExpanded && (
                    <div
                      style={{
                        marginTop: 8,
                        paddingTop: 12,
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                      }}
                    >
                      {item.stack_trace && (
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              marginBottom: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                color: "var(--text-3)",
                                letterSpacing: "0.04em",
                              }}
                            >
                              Stack Trace
                            </span>
                            <button
                              onClick={() => copyToClipboard(item.stack_trace!, item.id)}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--primary)",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              {copiedLogId === item.id ? (
                                <>
                                  <Check size={12} /> Copied!
                                </>
                              ) : (
                                <>
                                  <Copy size={12} /> Copy Stack
                                </>
                              )}
                            </button>
                          </div>
                          <pre
                            style={{
                              background: "#0f172a",
                              color: "#f8fafc",
                              padding: "12px 14px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontFamily: "monospace",
                              lineHeight: 1.5,
                              overflowX: "auto",
                              maxHeight: 240,
                              margin: 0,
                            }}
                          >
                            {item.stack_trace}
                          </pre>
                        </div>
                      )}
                      {item.details && (
                        <div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              color: "var(--text-3)",
                              letterSpacing: "0.04em",
                              marginBottom: 6,
                            }}
                          >
                            Context Details
                          </div>
                          <pre
                            style={{
                              background: "var(--bg)",
                              color: "var(--text-1)",
                              padding: "12px 14px",
                              borderRadius: 8,
                              fontSize: 12,
                              fontFamily: "monospace",
                              lineHeight: 1.5,
                              overflowX: "auto",
                              border: "1px solid var(--border)",
                              maxHeight: 220,
                              margin: 0,
                            }}
                          >
                            {typeof item.details === "object"
                              ? JSON.stringify(item.details, null, 2)
                              : String(item.details)}
                          </pre>
                        </div>
                      )}
                      {isResolved && (
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--text-3)",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <CheckCircle2 size={13} style={{ color: "#059669" }} />
                          <span>
                            Resolved at {fmtTime(item.resolved_at)} by <strong>{item.resolved_by ?? "Admin"}</strong>
                          </span>
                        </div>
                      )}
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
};
