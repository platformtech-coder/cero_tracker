"use client";

import React from "react";
import { Table2, X, Search, Shield } from "lucide-react";
import type { Overview } from "./types";
import { TABLE_METAS } from "./types";

export interface TableDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  overview: Overview;
  tableDrawerSearch: string;
  setTableDrawerSearch: (s: string) => void;
  tableDrawerCategory: "all" | "subscribers" | "operations" | "system";
  setTableDrawerCategory: (c: "all" | "subscribers" | "operations" | "system") => void;
}

export const TableDetailsDrawer: React.FC<TableDetailsDrawerProps> = ({
  isOpen,
  onClose,
  overview,
  tableDrawerSearch,
  setTableDrawerSearch,
  tableDrawerCategory,
  setTableDrawerCategory,
}) => {
  if (!isOpen) return null;

  const PROTECTED = ["profiles", "app_config", "config_dropdowns"];
  const allTables = [
    ...TABLE_METAS,
    {
      key: "profiles",
      label: "User Profiles",
      category: "system" as const,
      categoryLabel: "System & Config",
      danger: "low" as const,
      description: "Supabase auth profiles — permanently protected",
      pkType: "uuid",
    },
    {
      key: "app_config",
      label: "App Config & Settings",
      category: "system" as const,
      categoryLabel: "System & Config",
      danger: "low" as const,
      description: "Google Sheet settings, form URLs, system config — permanently protected",
      pkType: "text",
    },
    {
      key: "config_dropdowns",
      label: "Config Dropdowns",
      category: "system" as const,
      categoryLabel: "System & Config",
      danger: "low" as const,
      description: "Dropdown picklist values — permanently protected",
      pkType: "uuid",
    },
  ];

  const filtered = allTables.filter((t) => {
    const matchCategory =
      tableDrawerCategory === "all" || t.category === tableDrawerCategory;
    const matchSearch =
      !tableDrawerSearch.trim() ||
      t.label.toLowerCase().includes(tableDrawerSearch.toLowerCase()) ||
      t.key.toLowerCase().includes(tableDrawerSearch.toLowerCase());
    return matchCategory && matchSearch;
  });

  const grouped: Record<string, typeof filtered> = {};
  filtered.forEach((t) => {
    const cat = t.categoryLabel;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
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
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: "var(--primary-dim)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Table2 size={16} style={{ color: "var(--primary)" }} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Database Table Details</div>
                <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 1 }}>
                  {Object.keys(overview.tableCounts).length} tables ·{" "}
                  {overview.totalRows.toLocaleString()} total records
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-3)",
              padding: 6,
              borderRadius: 6,
              display: "flex",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Filter */}
        <div
          style={{
            padding: "14px 24px 10px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
            display: "flex",
            gap: 10,
          }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={13}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-3)",
              }}
            />
            <input
              value={tableDrawerSearch}
              onChange={(e) => setTableDrawerSearch(e.target.value)}
              placeholder="Search tables..."
              style={{
                width: "100%",
                padding: "7px 10px 7px 30px",
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-1)",
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <select
            value={tableDrawerCategory}
            onChange={(e) => setTableDrawerCategory(e.target.value as any)}
            style={{
              padding: "7px 10px",
              borderRadius: 7,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-1)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <option value="all">All Categories</option>
            <option value="subscribers">Subscribers</option>
            <option value="operations">Operations</option>
            <option value="system">System</option>
          </select>
        </div>

        {/* Table List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 24px 24px" }}>
          {Object.entries(grouped).map(([catLabel, tables]) => (
            <div key={catLabel} style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "var(--text-3)",
                  marginBottom: 8,
                  paddingTop: 8,
                }}
              >
                {catLabel}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {tables.map((t) => {
                  const count = overview.tableCounts[t.key] ?? 0;
                  const sharePct =
                    overview.totalRows > 0 ? (count / overview.totalRows) * 100 : 0;
                  const isProtected = PROTECTED.includes(t.key);
                  const dangerColor =
                    t.danger === "critical"
                      ? "#ef4444"
                      : t.danger === "high"
                      ? "#f97316"
                      : t.danger === "medium"
                      ? "#eab308"
                      : "#6b7280";

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
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 4,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-1)" }}>
                            {t.label}
                          </span>
                          {isProtected && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: "1px 7px",
                                borderRadius: 999,
                                background: "#d1fae5",
                                color: "#059669",
                                display: "flex",
                                alignItems: "center",
                                gap: 3,
                              }}
                            >
                              <Shield size={9} /> Protected
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 800,
                              color: "var(--text-1)",
                              fontFamily: "monospace",
                            }}
                          >
                            {count.toLocaleString()}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-3)" }}>
                            {sharePct.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                      <code
                        style={{
                          fontSize: 11,
                          color: "var(--text-3)",
                          fontFamily: "monospace",
                        }}
                      >
                        {t.key}
                      </code>
                      <div
                        style={{
                          height: 4,
                          background: "var(--bg-card)",
                          borderRadius: 999,
                          overflow: "hidden",
                          marginTop: 8,
                        }}
                      >
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
          ))}
        </div>
      </div>
    </>
  );
};
