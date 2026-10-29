'use client';

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

export function PurgeAllDialog({
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
