'use client';

import React from 'react';
import { X } from 'lucide-react';
import styles from '@/components/ui/dashboard.module.css';

// ─── Shared UI primitives ─────────────────────────────────────

export function Badge({
  label,
  variant = 'neutral',
}: {
  label: string;
  variant?: 'green' | 'red' | 'orange' | 'blue' | 'neutral';
}) {
  const colours: Record<string, string> = {
    green:   'var(--green)',
    red:     'var(--red)',
    orange:  'var(--orange)',
    blue:    'var(--blue)',
    neutral: 'var(--text-3)',
  };
  const bgs: Record<string, string> = {
    green:   'var(--green-dim)',
    red:     'var(--red-dim)',
    orange:  'var(--orange-dim)',
    blue:    'var(--blue-dim)',
    neutral: 'var(--bg-hover)',
  };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: colours[variant], background: bgs[variant],
    }}>
      {label}
    </span>
  );
}

export function KpiCard({
  label, value, sub, icon: Icon, iconClass, valueClass, onClick,
}: {
  label: string; value: number | string; sub?: React.ReactNode;
  icon: React.ElementType; iconClass: string; valueClass?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={styles.statCard}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      title={onClick ? 'Click to see details' : undefined}
    >
      <div className={styles.statHeader}>
        <span className={styles.statLabel}>{label}</span>
        <div className={`${styles.statIcon} ${iconClass}`}>
          <Icon size={15} strokeWidth={2} />
        </div>
      </div>
      <div className={`${styles.statValue} ${valueClass ?? ''}`}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.72rem', color: 'var(--text-3)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      marginBottom: '0.75rem', fontWeight: 600,
    }}>
      {children}
    </div>
  );
}

export function DataTable({
  columns, rows, emptyMsg = 'No data for this period.', onRowClick,
}: {
  columns: { key: string; label: string; align?: 'right' | 'left' | 'center'; render?: (v: any, row: any) => React.ReactNode }[];
  rows: Record<string, any>[];
  emptyMsg?: string;
  onRowClick?: (row: any) => void;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
            {columns.map(c => (
              <th key={c.key} style={{
                padding: '10px 14px', textAlign: c.align ?? 'left',
                fontWeight: 600, fontSize: 11, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>
                {emptyMsg}
              </td>
            </tr>
          ) : rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => onRowClick?.(row)}
              style={{
                borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => {
                if (onRowClick) e.currentTarget.style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={e => {
                if (onRowClick) e.currentTarget.style.background = 'transparent';
              }}
            >
              {columns.map(c => (
                <td key={c.key} style={{
                  padding: '10px 14px', textAlign: c.align ?? 'left',
                  color: 'var(--text-1)',
                }}>
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Detail drawer
export function DetailDrawer({
  title, isOpen, onClose, children,
}: {
  title: string; isOpen: boolean; onClose: () => void; children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 9999, backdropFilter: 'blur(3px)',
        }}
      />
      <div style={{
        position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(580px, 95vw)',
        background: '#ffffff', borderLeft: '1px solid var(--border)',
        zIndex: 10000, display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.1rem 1.4rem', borderBottom: '1px solid var(--border)',
          background: '#ffffff', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)' }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
              padding: 6, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.4rem', background: '#ffffff' }}>
          {children}
        </div>
      </div>
    </>
  );
}

// CSV export helper
export function exportCSV(filename: string, rows: Record<string, any>[], columns: string[]) {
  const header = columns.join(',');
  const body = rows.map(r =>
    columns.map(c => {
      const v = r[c] ?? '';
      const s = String(v);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  ).join('\n');
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export function getSundayWeek(date = new Date(), offsetWeeks = 0) {
  const d = new Date(date);
  const day = d.getDay(); // 0 is Sunday
  const sun = new Date(d);
  sun.setDate(d.getDate() - day + (offsetWeeks * 7));
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);

  const toYMD = (dt: Date) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const dayStr = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };

  return {
    start: toYMD(sun),
    end: toYMD(sat),
    label: `${sun.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sat.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  };
}
