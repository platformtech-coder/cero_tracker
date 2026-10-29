"use client";

import React from "react";
import { Shield, Trash2, Search, Info } from "lucide-react";
import type { Overview, TableMeta } from "./types";
import { TABLE_METAS } from "./types";

export interface CleanupTabProps {
  overview: Overview;
  cleanupCategory: "all" | "subscribers" | "operations" | "system" | "has_data";
  setCleanupCategory: (cat: "all" | "subscribers" | "operations" | "system" | "has_data") => void;
  cleanupSearch: string;
  setCleanupSearch: (search: string) => void;
  setShowPurgeAllModal: (show: boolean) => void;
  setPurgeTarget: (table: TableMeta) => void;
}

export const CleanupTab: React.FC<CleanupTabProps> = ({
  overview,
  cleanupCategory,
  setCleanupCategory,
  cleanupSearch,
  setCleanupSearch,
  setShowPurgeAllModal,
  setPurgeTarget,
}) => {
  return (
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
          <Shield size={20} style={{ color: "var(--red)", flexShrink: 0, marginTop: 2 }} />
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
                background: cleanupCategory === f.id ? "var(--primary)" : "var(--bg)",
                color: cleanupCategory === f.id ? "white" : "var(--text-2)",
                border: `1px solid ${cleanupCategory === f.id ? "var(--primary)" : "var(--border)"}`,
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
          if (cleanupCategory === "subscribers" && table.category !== "subscribers") return false;
          if (cleanupCategory === "operations" && table.category !== "operations") return false;
          if (cleanupCategory === "system" && table.category !== "system") return false;
          if (cleanupCategory === "has_data" && count === 0) return false;
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
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>
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
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
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
                  <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>
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
                    background: count > 0 ? "var(--red-dim)" : "var(--bg)",
                    border: `1px solid ${count > 0 ? "var(--red)" : "var(--border)"}`,
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
  );
};
