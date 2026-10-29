'use client';

import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { TableMeta } from "./types";

export function PurgeDialog({
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
