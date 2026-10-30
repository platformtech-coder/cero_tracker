"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  Cloud,
  Archive,
  Trash2,
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
import { saveFormsPartialConfig, rebuildForms, type FormRebuildTarget } from "@/lib/actions/forms";
import { AppShell } from "@/components/layout/AppShell";
import {
  KNOWN_ORI_SESSION_ITEM_ID,
  KNOWN_RC_LOWER_ITEM_IDS,
  KNOWN_RC_UPPER_ITEM_IDS,
} from "@/lib/constants/forms";

// Modular tab components and sub-dialogs
import type {
  Overview,
  Props,
  TableMeta,
  AuditEntry,
  SystemErrorItem,
  ErrorSummary,
} from "./components/types";
import { SHEETS_CONFIG } from "./components/types";
import { OverviewTab } from "./components/OverviewTab";
import { PipelineTab } from "./components/PipelineTab";
import { CleanupTab } from "./components/CleanupTab";
import { TableDetailsDrawer } from "./components/TableDetailsDrawer";
import { PurgeDialog } from "./components/PurgeDialog";
import { PurgeAllDialog } from "./components/PurgeAllDialog";

// Re-export types for backward compatibility
export type {
  SystemErrorItem,
  ErrorSummary,
  Overview,
  Props,
  TableMeta,
  AuditEntry,
} from "./components/types";

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
  const rawTab = searchParams.get("tab");
  const [tab, setTabState] = useState<"overview" | "pipeline" | "cleanup" | "archived" | "approvals">(() => {
    return rawTab === "pipeline"
      ? "pipeline"
      : rawTab === "cleanup"
      ? "cleanup"
      : rawTab === "archived"
      ? "archived"
      : rawTab === "approvals"
      ? "approvals"
      : "overview";
  });

  useEffect(() => {
    if (rawTab && ["overview", "pipeline", "cleanup", "archived", "approvals"].includes(rawTab)) {
      setTabState(rawTab as "overview" | "pipeline" | "cleanup" | "archived" | "approvals");
    }
  }, [rawTab]);

  const setTab = useCallback((t: "overview" | "pipeline" | "cleanup" | "archived" | "approvals") => {
    setTabState(t);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  const rawSubTab = searchParams.get("subtab");
  const [pipelineSubTab, setPipelineSubTabState] = useState<"sync" | "config">(() => {
    return rawSubTab === "config" || rawSubTab === "form_settings" ? "config" : "sync";
  });

  useEffect(() => {
    if (rawSubTab) {
      setPipelineSubTabState(rawSubTab === "config" || rawSubTab === "form_settings" ? "config" : "sync");
    }
  }, [rawSubTab]);

  const setPipelineSubTab = useCallback((t: "sync" | "config") => {
    setPipelineSubTabState(t);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("subtab", t);
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  }, []);

  const [overview, setOverview] = useState(init);
  const [logs, setLogs] = useState<AuditEntry[]>(init.auditLog);
  const [, startTransition] = useTransition();

  // Per-sheet save/sync states
  const [savingSheet, setSavingSheet] = useState<string | null>(null);
  const [syncingSheet, setSyncingSheet] = useState<string | null>(null);

  // Form IDs & item IDs state
  const [oriFormId, setOriFormId] = useState(
    formsConfig?.oriFormId ?? "1euyObOz6KNG3QgzdUG5otCxjfgV-0fZ9iCo3GFKKSXU"
  );
  const [oriSessionItemId, setOriSessionItemId] = useState(
    formsConfig?.oriSessionItemId ?? KNOWN_ORI_SESSION_ITEM_ID
  );
  const [rcFormId, setRcFormId] = useState(
    formsConfig?.rcFormId ?? "1NQPCb59uhpmo72BMxb9EHbxpAXqlmLlstyICTa8DJls"
  );
  const [rcLowerItemIds, setRcLowerItemIds] = useState(
    (formsConfig?.rcLowerItemIds ?? KNOWN_RC_LOWER_ITEM_IDS).join(", ")
  );
  const [rcUpperItemIds, setRcUpperItemIds] = useState(
    (formsConfig?.rcUpperItemIds ?? KNOWN_RC_UPPER_ITEM_IDS).join(", ")
  );
  const [savingFormKey, setSavingFormKey] = useState<string | null>(null);
  const [isRebuildingForms, setIsRebuildingForms] = useState(false);
  const [rebuildingFormTarget, setRebuildingFormTarget] = useState<FormRebuildTarget | null>(null);
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
  const [, setLastRefreshed] = useState<string>("");
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
    } catch {
      /* ignore polling errors */
    }
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

  // Auto-poll every 4s while a sync is in progress
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
    tabName: string
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
    tabName: string
  ) => {
    setSyncingSheet(sheetKey);
    toast.loading(`Syncing ${sheetKey}...`, { id: `sync-${sheetKey}` });
    const res = await triggerExternalSync(sheetKey, id, tabName);
    setSyncingSheet(null);
    if (res.success) {
      const edgeKey =
        sheetKey === "readingData"
          ? "reading_data"
          : sheetKey === "scoreCalendar"
          ? "score_calendar"
          : sheetKey;
      const count = (res.result as any)?.results?.[edgeKey] ?? null;
      const countStr = typeof count === "number" ? ` — ${count} rows processed` : "";
      toast.success(`✅ ${sheetKey} synced${countStr}`, { id: `sync-${sheetKey}` });
      refresh();
    } else toast.error(res.error ?? "Failed to trigger sync", { id: `sync-${sheetKey}` });
  };

  const handleSaveOriForm = async () => {
    setSavingFormKey("ori");
    const res = await saveFormsPartialConfig({
      oriFormId: oriFormId.trim(),
      oriSessionItemId: oriSessionItemId.trim(),
    });
    setSavingFormKey(null);
    if (res.success) {
      toast.success("Orientation Form IDs saved");
      refresh();
    } else {
      toast.error(res.error ?? "Failed to save Orientation Form IDs");
    }
  };

  const handleSaveRcForm = async () => {
    setSavingFormKey("rc");
    const res = await saveFormsPartialConfig({
      rcFormId: rcFormId.trim(),
      rcLowerItemIds: rcLowerItemIds.split(",").map((s) => s.trim()).filter(Boolean),
      rcUpperItemIds: rcUpperItemIds.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setSavingFormKey(null);
    if (res.success) {
      toast.success("Reading Circle Form IDs saved");
      refresh();
    } else {
      toast.error(res.error ?? "Failed to save Reading Circle Form IDs");
    }
  };

  const handleRebuildForms = async (target: FormRebuildTarget = "all") => {
    setIsRebuildingForms(true);
    setRebuildingFormTarget(target);
    const targetLabel =
      target === "orientation"
        ? "Orientation Form"
        : target === "reading-circle"
        ? "Reading Circle Form"
        : "Both Google Forms";
    try {
      const res = await rebuildForms(target);
      if (res.success) {
        toast.success(`${targetLabel} rebuilt successfully with active sessions!`);
      } else {
        toast.error("Rebuild failed: " + (res.error ?? "Unknown error"));
      }
    } catch (e: any) {
      toast.error("Error rebuilding form: " + e.message);
    } finally {
      setIsRebuildingForms(false);
      setRebuildingFormTarget(null);
    }
  };

  const handleMigrateRC = async () => {
    setIsMigratingRC(true);
    setRcMigrationResult(null);
    toast.loading("Migrating Reading Circle & Orientation data from Google Sheet...", {
      id: "rc-migration",
    });
    try {
      const res = await migrateReadingCircleData();
      if (res.success) {
        toast.success(res.message || "Reading Circle migration completed!", {
          id: "rc-migration",
        });
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
      toast.error(err.message || "Unexpected error during migration", {
        id: "rc-migration",
      });
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

    toast.loading(
      `Syncing ${configuredSheets.length} sheets... (0/${configuredSheets.length})`,
      { id: "sync-all" }
    );
    setSyncingSheet("all");

    const errors: string[] = [];
    const successes: string[] = [];

    for (let idx = 0; idx < configuredSheets.length; idx++) {
      const cfg = configuredSheets[idx];
      const sheet = (overview.sheetConfig as any)[cfg.key];
      toast.loading(`Syncing ${cfg.label} (${idx + 1}/${configuredSheets.length})...`, {
        id: "sync-all",
      });
      const res = await triggerExternalSync(cfg.key, sheet.id, sheet.tab);
      if (!res.success) {
        errors.push(`${cfg.label}: ${res.error ?? "Sync failed"}`);
      } else {
        const count =
          (res.result as any)?.results?.[
            cfg.key === "readingData"
              ? "reading_data"
              : cfg.key === "scoreCalendar"
              ? "score_calendar"
              : cfg.key
          ] ?? 0;
        successes.push(`${cfg.label}: ${typeof count === "number" ? count + " rows" : "done"}`);
      }
    }

    setSyncingSheet(null);

    if (errors.length === 0) {
      toast.success(
        `✅ All ${successes.length} sheets synced!\n${successes.join(" • ")}`,
        { id: "sync-all", duration: 5000 }
      );
    } else if (successes.length > 0) {
      toast.dismiss("sync-all");
      toast.success(`${successes.length} synced: ${successes.join(", ")}`);
      toast.error(`${errors.length} failed: ${errors.join(", ")}`);
    } else {
      toast.error(`All syncs failed: ${errors.join(", ")}`, { id: "sync-all" });
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
        `Cleared ${res.rowsCleared?.toLocaleString() ?? "all"} rows from ${purgeTarget.label}`
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
        {tab === "overview" && (
          <OverviewTab
            overview={overview}
            errorSummary={errorSummary}
            errorLogs={errorLogs}
            expandedErrorIds={expandedErrorIds}
            copiedLogId={copiedLogId}
            errorSearch={errorSearch}
            setErrorSearch={setErrorSearch}
            errorLevel={errorLevel}
            setErrorLevel={setErrorLevel}
            errorStatus={errorStatus}
            setErrorStatus={setErrorStatus}
            isRefreshingOverview={isRefreshingOverview}
            isRefreshingErrors={isRefreshingErrors}
            refreshOverview={refreshOverview}
            refreshErrors={refreshErrors}
            handleSimulateWarning={handleSimulateWarning}
            handleResolveAllErrors={handleResolveAllErrors}
            handlePurgeResolvedErrors={handlePurgeResolvedErrors}
            handleResolveError={handleResolveError}
            handleUnresolveError={handleUnresolveError}
            toggleExpandError={toggleExpandError}
            copyToClipboard={copyToClipboard}
            setIsTablesDrawerOpen={setIsTablesDrawerOpen}
          />
        )}

        {/* ══════════ PIPELINE ══════════ */}
        {tab === "pipeline" && (
          <PipelineTab
            pipelineSubTab={pipelineSubTab}
            setPipelineSubTab={setPipelineSubTab}
            overview={overview}
            logs={logs}
            syncingSheet={syncingSheet}
            isPurging={isPurging}
            isMigratingRC={isMigratingRC}
            rcMigrationResult={rcMigrationResult}
            handleMigrateRC={handleMigrateRC}
            handleSyncAll={handleSyncAll}
            handleSheetSync={handleSheetSync}
            refreshLogs={refreshLogs}
            savingSheet={savingSheet}
            handleSheetSave={handleSheetSave}
            isRebuildingForms={isRebuildingForms}
            rebuildingFormTarget={rebuildingFormTarget}
            handleRebuildForms={handleRebuildForms}
            oriFormId={oriFormId}
            setOriFormId={setOriFormId}
            oriSessionItemId={oriSessionItemId}
            setOriSessionItemId={setOriSessionItemId}
            rcFormId={rcFormId}
            setRcFormId={setRcFormId}
            rcLowerItemIds={rcLowerItemIds}
            setRcLowerItemIds={setRcLowerItemIds}
            rcUpperItemIds={rcUpperItemIds}
            setRcUpperItemIds={setRcUpperItemIds}
            savingFormKey={savingFormKey}
            handleSaveOriForm={handleSaveOriForm}
            handleSaveRcForm={handleSaveRcForm}
          />
        )}

        {/* ══════════ DATA CLEANUP ══════════ */}
        {tab === "cleanup" && (
          <CleanupTab
            overview={overview}
            cleanupCategory={cleanupCategory}
            setCleanupCategory={setCleanupCategory}
            cleanupSearch={cleanupSearch}
            setCleanupSearch={setCleanupSearch}
            setShowPurgeAllModal={setShowPurgeAllModal}
            setPurgeTarget={setPurgeTarget}
          />
        )}

        {/* Purge Table Confirmation Modal */}
        {purgeTarget && (
          <PurgeDialog
            table={purgeTarget}
            rowCount={overview.tableCounts[purgeTarget.key] ?? 0}
            onConfirm={handlePurge}
            onCancel={() => setPurgeTarget(null)}
            isRunning={isPurging}
          />
        )}

        {/* Master Nuke / Purge All Modal */}
        {showPurgeAllModal && (
          <PurgeAllDialog
            onConfirm={handlePurgeAll}
            onCancel={() => setShowPurgeAllModal(false)}
            isRunning={isPurging}
          />
        )}

        {/* Table Details Slide-over Drawer */}
        <TableDetailsDrawer
          isOpen={isTablesDrawerOpen}
          onClose={() => setIsTablesDrawerOpen(false)}
          overview={overview}
          tableDrawerSearch={tableDrawerSearch}
          setTableDrawerSearch={setTableDrawerSearch}
          tableDrawerCategory={tableDrawerCategory}
          setTableDrawerCategory={setTableDrawerCategory}
        />

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
