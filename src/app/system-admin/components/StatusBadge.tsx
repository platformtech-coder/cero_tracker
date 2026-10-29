"use client";

import React from "react";

export function StatusBadge({ status }: { status: string }) {
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
