'use client';

import { useState } from "react";
import { Save, ExternalLink } from "lucide-react";
import type { SHEETS_CONFIG } from "./types";

export function SheetCard({
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
