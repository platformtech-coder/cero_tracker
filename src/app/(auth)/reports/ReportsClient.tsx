'use client';

import { useState, useCallback, useTransition, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  BarChart2, Phone, PhoneOff, MessageSquare, AlertTriangle, CheckCircle2,
  Users, BookOpenCheck, Compass, TrendingDown, TrendingUp, Flag,
  ChevronRight, ChevronDown, Download, Calendar, Search, X, 
  PhoneCall, AlertCircle,
} from 'lucide-react';
import type {
  DailyActivityRow,
  CallParentsFamilyDetailRow,
  CallParentsReportData,
  RCSessionSummaryRow, RCCubDetailRow, RCSessionRosterRow,
  OrientationFunnelRow, OrientationDetailRow,
  RetentionMetricsRow, ExpiredDetailRow,
  InteractionDetailRow,
} from '@/lib/actions/reports';
import {
  getDailyActivityReport,
  getCallParentsReport,
  getRCAttendanceReport,
  getOrientationReport,
  getExpiryRetentionReport,
  getCallParentsDetail,
  getRCSessionRoster,
  getDailyActivityInteractions,
} from '@/lib/actions/reports';
import styles from '@/components/ui/dashboard.module.css';
import tabStyles from '../engagements/engagements.module.css';
import { compareRCSessionStrings } from '@/lib/utils/rc';
import { formatDate, formatDateTime, formatTime } from '@/lib/utils/date';
import { ReportsSkeleton, ReportsTabContentSkeleton } from '@/components/ui/Skeleton';

// ─── Tab definitions ──────────────────────────────────────────

const TABS = [
  { id: 'daily',       label: 'Daily Activity',     icon: BarChart2 },
  { id: 'flags',       label: 'Flags',              icon: Flag },
  { id: 'rc',          label: 'Reading Circle',     icon: BookOpenCheck },
  { id: 'orientation', label: 'Orientation',        icon: Compass },
  { id: 'expiry',      label: 'Expiry & Retention', icon: TrendingDown },
];

// ─── Shared UI primitives ─────────────────────────────────────

function Badge({ label, variant = 'neutral' }: { label: string; variant?: 'green' | 'red' | 'orange' | 'blue' | 'neutral' }) {
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

function KpiCard({
  label, value, sub, icon: Icon, iconClass, valueClass, onClick,
}: {
  label: string; value: number | string; sub?: string;
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

function SectionTitle({ children }: { children: React.ReactNode }) {
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

function DataTable({
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
function DetailDrawer({
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
function exportCSV(filename: string, rows: Record<string, any>[], columns: string[]) {
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

function getSundayWeek(date = new Date(), offsetWeeks = 0) {
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

// ─── Filter Dropdown Module ────────────────────────────────────

function FilterDropdownModule({
  activeTab,
  startDate,
  endDate,
  onApplyRange,
}: {
  activeTab: string;
  startDate: string;
  endDate: string;
  onApplyRange: (s: string, e: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customStart, setCustomStart] = useState(startDate);
  const [customEnd, setCustomEnd] = useState(endDate);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const last7Str = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const last30Str = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const thisMonth = useMemo(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: toYMD(s), end: toYMD(e) };
  }, []);

  const isRC = activeTab === 'rc';
  const isGeneralTab = activeTab === 'orientation' || activeTab === 'expiry';

  const currentPreset = useMemo(() => {
    if (showCustom) return 'custom';
    if (isGeneralTab && (!startDate || startDate === 'all' || (!startDate && !endDate))) return 'all';
    if (startDate === todayStr && endDate === todayStr) return 'today';
    if (startDate === yesterdayStr && endDate === yesterdayStr) return 'yesterday';
    if (startDate === last7Str && endDate === todayStr) return 'last7';
    if (startDate === last30Str && endDate === todayStr) return 'last30';
    if (startDate === thisMonth.start && endDate === thisMonth.end) return 'thisMonth';
    if (!startDate && !endDate) return isGeneralTab ? 'all' : 'today';
    return 'custom';
  }, [startDate, endDate, todayStr, yesterdayStr, last7Str, last30Str, thisMonth, showCustom, isGeneralTab]);

  const handleSelectChange = (val: string) => {
    if (val === 'all') {
      setShowCustom(false);
      onApplyRange('', '');
    } else if (val === 'today') {
      setShowCustom(false);
      onApplyRange(todayStr, todayStr);
    } else if (val === 'yesterday') {
      setShowCustom(false);
      onApplyRange(yesterdayStr, yesterdayStr);
    } else if (val === 'last7') {
      setShowCustom(false);
      onApplyRange(last7Str, todayStr);
    } else if (val === 'last30') {
      setShowCustom(false);
      onApplyRange(last30Str, todayStr);
    } else if (val === 'thisMonth') {
      setShowCustom(false);
      onApplyRange(thisMonth.start, thisMonth.end);
    } else if (val === 'thisWeek') {
      setShowCustom(false);
      const w = getSundayWeek(new Date(), 0);
      onApplyRange(w.start, w.end);
    } else if (val === 'lastWeek') {
      setShowCustom(false);
      const w = getSundayWeek(new Date(), -1);
      onApplyRange(w.start, w.end);
    } else if (val === 'custom') {
      setShowCustom(true);
    }
  };

  const handleApplyCustom = () => {
    if (customStart && customEnd) {
      onApplyRange(customStart, customEnd);
    }
  };

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: '1.25rem',
      padding: '8px 14px',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      width: 'fit-content',
      maxWidth: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={15} color="var(--primary)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Filter:</span>
          <select
            value={currentPreset}
            onChange={e => handleSelectChange(e.target.value)}
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-1)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {isGeneralTab && <option value="all">Overall (All Time)</option>}
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="thisMonth">This Month</option>
            {isRC && (
              <>
                <option value="thisWeek">This Week (Sun–Sat)</option>
                <option value="lastWeek">Last Week (Sun–Sat)</option>
              </>
            )}
            <option value="custom">Custom Range...</option>
          </select>
        </div>

        {/* Custom Range Inputs */}
        {(showCustom || currentPreset === 'custom') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
                color: 'var(--text-1)',
                outline: 'none',
              }}
            />
            <span style={{ color: 'var(--text-3)', fontSize: 12 }}>to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontSize: 12,
                color: 'var(--text-1)',
                outline: 'none',
              }}
            />
            <button
              onClick={handleApplyCustom}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          </div>
        )}

        {/* Formatted Date Range Display */}
        <span style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--text-2)',
          background: 'var(--bg-hover)',
          padding: '4px 10px',
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}>
          {isGeneralTab && (!startDate || currentPreset === 'all')
            ? 'Overall (All Time)'
            : !startDate
            ? 'All Time'
            : `${formatDate(startDate)}${startDate !== endDate ? ` – ${formatDate(endDate)}` : ''}`}
        </span>
      </div>
    </div>
  );
}

// ─── Tab: Daily Activity ─────────────────────────────────────

function DailyActivityTab({
  data,
  startDate,
  endDate,
  allPurposes,
  repFilter,
}: {
  data: DailyActivityRow[];
  startDate: string;
  endDate: string;
  allPurposes: string[];
  repFilter?: string;
}) {
  const [drawer, setDrawer] = useState<{ rep: string; startDate: string; endDate: string } | null>(null);
  const [interactions, setInteractions] = useState<InteractionDetailRow[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPurposes, setSelectedPurposes] = useState<string[]>([]);
  const [tableData, setTableData] = useState<DailyActivityRow[]>(data);
  const [loadingTable, setLoadingTable] = useState(false);

  const isFirstMount = useRef(true);

  // Sync tableData when parent data changes (e.g. date range changed at page level)
  useEffect(() => {
    if (selectedPurposes.length === 0) {
      setTableData(data);
    }
  }, [data, selectedPurposes.length]);

  // Re-fetch report metrics when purpose filter, dates, or repFilter change
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    let isCurrent = true;
    setLoadingTable(true);
    getDailyActivityReport(
      repFilter,
      startDate,
      endDate,
      selectedPurposes.length > 0 ? selectedPurposes : undefined
    )
      .then(rows => {
        if (isCurrent) setTableData(rows);
      })
      .catch(() => {
        if (isCurrent) setTableData([]);
      })
      .finally(() => {
        if (isCurrent) setLoadingTable(false);
      });

    return () => { isCurrent = false; };
  }, [selectedPurposes, repFilter, startDate, endDate]);

  const totals = tableData.reduce((acc, r) => ({
    calls_made:         acc.calls_made + r.calls_made,
    calls_successful:   acc.calls_successful + r.calls_successful,
    calls_unsuccessful: acc.calls_unsuccessful + r.calls_unsuccessful,
    messages_sent:      acc.messages_sent + r.messages_sent,
    total_interactions: acc.total_interactions + r.total_interactions,
  }), { calls_made: 0, calls_successful: 0, calls_unsuccessful: 0, messages_sent: 0, total_interactions: 0 });

  const togglePurpose = (p: string) =>
    setSelectedPurposes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const loadInteractions = useCallback((rep: string, s: string, e: string, purposes: string[]) => {
    setLoadingInteractions(true);
    getDailyActivityInteractions(rep, s, e, purposes.length > 0 ? purposes : undefined)
      .then(rows => setInteractions(rows))
      .catch(() => setInteractions([]))
      .finally(() => setLoadingInteractions(false));
  }, []);

  const handleOpenDrawer = (rep: string) => {
    setDrawer({ rep, startDate, endDate });
    setSearchQuery('');
    setInteractions([]);
    loadInteractions(rep, startDate, endDate, selectedPurposes);
  };

  // Re-fetch drawer interactions if purposes are toggled while drawer is open
  useEffect(() => {
    if (drawer) {
      loadInteractions(drawer.rep, drawer.startDate, drawer.endDate, selectedPurposes);
    }
  }, [drawer?.rep, drawer?.startDate, drawer?.endDate, selectedPurposes, loadInteractions]);

  const filteredInteractions = useMemo(() => {
    if (!searchQuery.trim()) return interactions;
    const q = searchQuery.toLowerCase().trim();
    return interactions.filter(item => {
      const cubName = `${item.cub_first_name ?? ''} ${item.cub_last_name ?? ''}`.toLowerCase();
      const cubId = (item.cub_id ?? '').toLowerCase();
      const parentName = `${item.parent_first_name ?? ''} ${item.parent_last_name ?? ''}`.toLowerCase();
      const handledBy = (item.handled_by ?? '').toLowerCase();
      const purpose = (item.purpose ?? '').toLowerCase();
      const type = (item.type ?? '').toLowerCase();
      const status = (item.status ?? '').toLowerCase();
      const feedback = (item.feedback ?? '').toLowerCase();
      const action = (item.action ?? '').toLowerCase();

      return (
        cubName.includes(q) ||
        cubId.includes(q) ||
        parentName.includes(q) ||
        handledBy.includes(q) ||
        purpose.includes(q) ||
        type.includes(q) ||
        status.includes(q) ||
        feedback.includes(q) ||
        action.includes(q)
      );
    });
  }, [interactions, searchQuery]);

  return (
    <div>
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem', opacity: loadingTable ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <KpiCard label="Total Calls"         value={totals.calls_made}         icon={Phone}         iconClass={styles.iconPrimary} />
        <KpiCard label="Successful (Reached)" value={totals.calls_successful}   icon={CheckCircle2}  iconClass={styles.iconGreen}  valueClass={styles.valueGreen} />
        <KpiCard label="Unsuccessful"         value={totals.calls_unsuccessful} icon={PhoneOff}      iconClass={styles.iconRed}    valueClass={styles.valueRed} />
        <KpiCard label="Messages Sent"        value={totals.messages_sent}      icon={MessageSquare} iconClass={styles.iconBlue} />
        <KpiCard label="Total Interactions Logged" value={totals.total_interactions} icon={BarChart2} iconClass={styles.iconPrimary} />
      </div>

      {/* ── Purpose Filter ──────────────────────────────────────── */}
      {allPurposes.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
              Filter by Purpose:
            </span>
            {allPurposes.map(p => {
              const active = selectedPurposes.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePurpose(p)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                    background: active ? 'var(--primary)' : 'var(--bg-card)',
                    color: active ? '#fff' : 'var(--text-2)',
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {p}
                </button>
              );
            })}
            {selectedPurposes.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedPurposes([])}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}
              >
                Clear all
              </button>
            )}
          </div>
          {selectedPurposes.length > 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, marginBottom: 0 }}>
              Showing activity filtered for <strong>{selectedPurposes.join(', ')}</strong>. Click any rep row to view details.
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('daily-activity', tableData, ['rep','calls_made','calls_successful','calls_unsuccessful','messages_sent','total_interactions'])}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div style={{ opacity: loadingTable ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <DataTable
          onRowClick={row => handleOpenDrawer(row.rep)}
          columns={[
            { key: 'rep', label: 'Rep' },
            { key: 'calls_made', label: 'Total Calls', align: 'center' },
            { key: 'calls_successful', label: 'Reached', align: 'center', render: v => <span style={{ color: 'var(--green)', fontWeight: 600 }}>{v}</span> },
            { key: 'calls_unsuccessful', label: 'Not Reached', align: 'center', render: v => <span style={{ color: 'var(--red)' }}>{v}</span> },
            { key: 'messages_sent', label: 'Messages Sent', align: 'center' },
            { key: 'total_interactions', label: 'Total Interactions', align: 'center', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          ]}
          rows={tableData}
        />
      </div>

      <DetailDrawer
        title={`Interactions — ${drawer?.rep ?? ''}`}
        isOpen={!!drawer}
        onClose={() => {
          setDrawer(null);
          setSearchQuery('');
        }}
      >
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 12 }}>
          Showing all interactions logged by <strong>{drawer?.rep}</strong>{' '}
          {selectedPurposes.length > 0 && (
            <>for <strong>{selectedPurposes.join(', ')}</strong>{' '}</>
          )}
          {drawer?.startDate && drawer?.endDate && drawer.startDate !== drawer.endDate
            ? `from ${formatDate(drawer.startDate)} to ${formatDate(drawer.endDate)}`
            : `for ${formatDate(drawer?.startDate)}`}.
        </p>

        {/* Purpose Dropdown Filter inside Drawer */}
        {allPurposes.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="drawer-purpose-select" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-3)', marginBottom: 5 }}>
              Filter by Purpose
            </label>
            <div style={{ position: 'relative' }}>
              <select
                id="drawer-purpose-select"
                value={selectedPurposes.length === 1 ? selectedPurposes[0] : (selectedPurposes.length > 1 ? '__multiple__' : '')}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedPurposes(val && val !== '__multiple__' ? [val] : []);
                }}
                style={{
                  width: '100%',
                  padding: '8px 32px 8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-1)',
                  fontSize: 13,
                  fontWeight: selectedPurposes.length > 0 ? 600 : 400,
                  appearance: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">All Purposes</option>
                {selectedPurposes.length > 1 && (
                  <option value="__multiple__" disabled>
                    Multiple Selected ({selectedPurposes.length})
                  </option>
                )}
                {allPurposes.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-3)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-3)',
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by cub, parent, purpose, status, notes..."
              style={{
                width: '100%',
                paddingLeft: 34,
                paddingRight: 12,
                paddingTop: 9,
                paddingBottom: 9,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: '#ffffff',
                color: 'var(--text-1)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {searchQuery && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Showing {filteredInteractions.length} of {interactions.length} interactions</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, padding: 0 }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {loadingInteractions ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading interactions...
          </div>
        ) : interactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No interactions logged for this period.
          </div>
        ) : filteredInteractions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No interactions match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredInteractions.map(item => (
              <div
                key={item.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>
                      {item.cub_first_name} {item.cub_last_name}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>
                      ({item.cub_id})
                    </span>
                  </div>
                  <Badge
                    label={item.status || item.type}
                    variant={item.status === 'Reached' ? 'green' : item.status === 'Not Reached' ? 'red' : 'blue'}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                  Parent: {item.parent_first_name} {item.parent_last_name} · Purpose: {item.purpose}
                </div>
                {item.feedback && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', background: 'var(--bg-input)', padding: '6px 8px', borderRadius: 6, marginTop: 6 }}>
                    &ldquo;{item.feedback}&rdquo;
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                  {formatDateTime(item.date)}
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}

// ─── Tab: Flags (Call Parents Accountability) ──────────────────

function FlagsCallParentsTab({ data }: { data: CallParentsReportData }) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Reached' | 'Not Reached' | 'Not Called' | 'Multi-Cub'>('All');
  const [search, setSearch] = useState('');
  const [selectedRep, setSelectedRep] = useState('All');

  const [lazyDetail, setLazyDetail] = useState<CallParentsFamilyDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const totalFamiliesDue = data.summary.reduce((s, r) => s + (r.total_families_due || 0), 0);
  const totalCubsDue = data.summary.reduce((s, r) => s + (r.total_cubs_due || 0), 0);
  const totalFamiliesCalled = data.summary.reduce((s, r) => s + (r.families_called || 0), 0);
  const totalFamiliesReached = data.summary.reduce((s, r) => s + (r.families_reached || 0), 0);
  const totalFamiliesNotReached = data.summary.reduce((s, r) => s + (r.families_not_reached || 0), 0);
  const totalFamiliesNotCalled = data.summary.reduce((s, r) => s + (r.families_not_called || 0), 0);
  const totalCubsCovered = data.summary.reduce((s, r) => s + (r.cubs_covered || 0), 0);
  const totalCubsNotCalled = data.summary.reduce((s, r) => s + (r.cubs_not_called || 0), 0);
  const totalCubsReached = data.summary.reduce((s, r) => s + (r.cubs_reached || 0), 0);
  const totalCubsNotReached = data.summary.reduce((s, r) => s + (r.cubs_not_reached || 0), 0);
  const totalMessagesSent = data.summary.reduce((s, r) => s + (r.messages_sent || 0), 0);

  const callRate = totalFamiliesDue > 0 ? Math.round((100 * totalFamiliesCalled) / totalFamiliesDue) : 0;
  const successRate = totalFamiliesCalled > 0 ? Math.round((100 * totalFamiliesReached) / totalFamiliesCalled) : 0;

  const filteredDetail = lazyDetail.filter(row => {
    if (selectedRep !== 'All' && row.rep !== selectedRep) return false;
    if (statusFilter === 'Reached' && row.call_status !== 'Reached') return false;
    if (statusFilter === 'Not Reached' && row.call_status !== 'Not Reached') return false;
    if (statusFilter === 'Not Called' && row.call_status !== 'Not Called') return false;
    if (statusFilter === 'Multi-Cub' && row.cubs_count <= 1) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchParent = row.parent_name?.toLowerCase().includes(q);
      const matchPhone = row.parent_phone?.includes(q);
      const matchRep = row.rep?.toLowerCase().includes(q);
      const matchCubs = row.cubs?.some(c => c.cub_name?.toLowerCase().includes(q) || c.cub_id?.toLowerCase().includes(q));
      if (!matchParent && !matchPhone && !matchRep && !matchCubs) return false;
    }
    return true;
  });

  const openDrawerWithFilter = (filter: 'All' | 'Reached' | 'Not Reached' | 'Not Called' | 'Multi-Cub', rep = 'All') => {
    setStatusFilter(filter);
    setSelectedRep(rep);
    setShowDrawer(true);
    if (lazyDetail.length === 0 && !detailLoading) {
      setDetailLoading(true);
      setDetailError(null);
      getCallParentsDetail(null, new Date().toISOString().slice(0, 10))
        .then(rows => setLazyDetail(rows))
        .catch(err => setDetailError(err.message ?? 'Failed to load detail'))
        .finally(() => setDetailLoading(false));
    }
  };

  const reachedCount   = lazyDetail.filter(r => r.call_status === 'Reached').length;
  const notReachedCount = lazyDetail.filter(r => r.call_status === 'Not Reached').length;
  const notCalledCount  = lazyDetail.filter(r => r.call_status === 'Not Called').length;
  const multiCubCount   = lazyDetail.filter(r => r.cubs_count > 1).length;

  return (
    <div>
      {/* 4 Stat Boxes (consolidated so table moves up) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.25rem',
      }}>
        {/* Card 1: Families Due */}
        <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Families Due</span>
              <div className={`${styles.statIcon} ${styles.iconPrimary}`}>
                <Users size={16} />
              </div>
            </div>
            <div className={styles.statValue}>{totalFamiliesDue}</div>
          </div>
          <div className={styles.statSub}>{totalCubsDue} cubs represented</div>
        </div>

        {/* Card 2: Families Called (Split: Called on Left, Not Called on Right) */}
        <div
          className={styles.statCard}
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => openDrawerWithFilter('All')}
        >
          <div className={styles.statHeader} style={{ marginBottom: 6 }}>
            <span className={styles.statLabel}>Families Called</span>
            <Badge label={`${callRate}% Rate`} variant={callRate >= 80 ? 'green' : callRate >= 50 ? 'orange' : 'red'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            {/* Left: Called */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Called</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>{totalFamiliesCalled}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{totalCubsCovered} cubs</div>
            </div>
            {/* Divider */}
            <div style={{ width: 1, height: 38, background: 'var(--border)' }} />
            {/* Right: Not Called */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Not Called</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalFamiliesNotCalled > 0 ? 'var(--red)' : 'var(--text-1)', lineHeight: 1.1 }}>
                {totalFamiliesNotCalled}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{totalCubsNotCalled} cubs</div>
            </div>
          </div>
          <div className={styles.statSub} style={{ marginTop: 8 }}>
            Click to view called &amp; pending
          </div>
        </div>

        {/* Card 3: Families Reached */}
        <div
          className={styles.statCard}
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => openDrawerWithFilter('Reached')}
        >
          <div>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Families Reached</span>
              <Badge label={`${successRate}% Success`} variant={successRate >= 70 ? 'green' : successRate >= 40 ? 'orange' : 'red'} />
            </div>
            <div className={`${styles.statValue} ${styles.valueGreen}`}>{totalFamiliesReached}</div>
          </div>
          <div className={styles.statSub}>{totalCubsReached} cubs reached</div>
        </div>

        {/* Card 4: Families Not Reached */}
        <div
          className={styles.statCard}
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => openDrawerWithFilter('Not Reached')}
        >
          <div>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Not Reached</span>
              <div className={`${styles.statIcon} ${styles.iconOrange}`}>
                <PhoneOff size={16} />
              </div>
            </div>
            <div className={`${styles.statValue} ${totalFamiliesNotReached > 0 ? styles.valueOrange : ''}`}>
              {totalFamiliesNotReached}
            </div>
          </div>
          <div className={styles.statSub}>
            {totalCubsNotReached} cubs · <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{totalMessagesSent} msgs sent</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('flags-call-parents-summary', data.summary, [
            'date', 'rep', 'total_families_due', 'total_cubs_due', 'families_called',
            'families_reached', 'families_not_reached', 'families_not_called',
            'cubs_covered', 'call_rate_pct', 'success_rate_pct'
          ])}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      <DataTable
        emptyMsg="No Call Parent flag snapshots for this date range."
        onRowClick={r => openDrawerWithFilter('All', r.rep)}
        columns={[
          { key: 'date', label: 'Date', render: v => <span style={{ fontWeight: 600 }}>{formatDate(v)}</span> },
          { key: 'rep', label: 'Rep', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: 'total_families_due', label: 'Families Due', align: 'center' },
          { key: 'total_cubs_due', label: 'Cubs Due', align: 'center' },
          {
            key: 'families_called',
            label: 'Called',
            align: 'center',
            render: v => <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{v}</span>,
          },
          {
            key: 'families_reached',
            label: 'Reached',
            align: 'center',
            render: v => <span style={{ color: 'var(--green)', fontWeight: 700 }}>{v}</span>,
          },
          {
            key: 'families_not_reached',
            label: 'Not Reached',
            align: 'center',
            render: v => (
              <span style={{ color: v > 0 ? 'var(--orange)' : 'var(--text-3)', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
            ),
          },
          {
            key: 'families_not_called',
            label: 'Not Called',
            align: 'center',
            render: v => (
              <span style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontWeight: v > 0 ? 700 : 400 }}>{v}</span>
            ),
          },
          {
            key: 'cubs_covered',
            label: 'Cubs Covered',
            align: 'center',
            render: (v, r: any) => (
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v} / {r.total_cubs_due}</span>
            ),
          },
          {
            key: 'call_rate_pct',
            label: 'Call Rate',
            align: 'center',
            render: v => (
              <Badge label={`${v ?? 0}%`} variant={v >= 80 ? 'green' : v >= 50 ? 'orange' : 'red'} />
            ),
          },
        ]}
        rows={data.summary}
      />

      {/* Detail Drawer */}
      <DetailDrawer
        title="Call Parents — Families &amp; Cubs"
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by parent name, phone, rep, or cub..."
              style={{
                width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
                borderRadius: 8, border: '1px solid var(--border)', background: '#ffffff',
                color: 'var(--text-1)', fontSize: 13, outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { id: 'All',         label: `All (${lazyDetail.length})` },
            { id: 'Reached',     label: `Reached (${reachedCount})` },
            { id: 'Not Reached', label: `Not Reached (${notReachedCount})` },
            { id: 'Not Called',  label: `Not Called (${notCalledCount})` },
            { id: 'Multi-Cub',   label: `Multi-Cub (${multiCubCount})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: statusFilter === f.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: statusFilter === f.id ? 'var(--primary-dim)' : 'var(--bg-card)',
                color: statusFilter === f.id ? 'var(--primary)' : 'var(--text-2)',
                cursor: 'pointer'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {detailLoading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading family details...
          </div>
        )}

        {detailError && (
          <div style={{ padding: '1rem', color: 'var(--red)', fontSize: 13, background: 'var(--red-dim)', borderRadius: 8, marginBottom: 12 }}>
            {detailError}
          </div>
        )}

        {!detailLoading && filteredDetail.map((fam, i) => (
          <div key={i} style={{
            padding: '12px 14px', borderRadius: 10, background: 'var(--bg-card)',
            border: '1px solid var(--border)', marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>
                  {fam.parent_name}
                </div>
                {fam.parent_phone && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    📞 {fam.parent_phone}
                  </div>
                )}
              </div>
              <Badge
                label={fam.call_status}
                variant={fam.call_status === 'Reached' ? 'green' : fam.call_status === 'Not Reached' ? 'orange' : 'red'}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
              Rep: <strong>{fam.rep}</strong> · Cubs: {fam.cubs.map(c => c.cub_name).join(', ')}
            </div>
            {fam.last_call_feedback && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', background: 'var(--bg-input)', padding: '6px 8px', borderRadius: 6 }}>
                &ldquo;{fam.last_call_feedback}&rdquo;
              </div>
            )}
            {fam.last_call_date && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Last call: {formatDate(fam.last_call_date)} by {fam.last_call_rep}
              </div>
            )}
          </div>
        ))}
      </DetailDrawer>
    </div>
  );
}

// ─── Tab: Reading Circle ──────────────────────────────────────

function RCReportTab({
  data, startDate, endDate
}: {
  data: {
    session_summary: RCSessionSummaryRow[];
    rep_metrics: { rep: string; total_enrolled: number; never_attended: number; attended_in_period: number }[];
    cub_detail: RCCubDetailRow[];
  };
  startDate: string;
  endDate: string;
}) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [lazyRoster, setLazyRoster] = useState<RCSessionRosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [neverAttendedDrawer, setNeverAttendedDrawer] = useState(false);
  const [lazyNeverAttended, setLazyNeverAttended] = useState<RCSessionRosterRow[]>([]);
  const [neverLoading, setNeverLoading] = useState(false);
  const [search, setSearch] = useState('');

  const sortedSessions = [...data.session_summary].sort((a, b) =>
    compareRCSessionStrings(a.session, b.session)
  );

  const totalExpected = data.session_summary.reduce((s, r) => s + r.expected_cubs, 0);
  const totalPresent  = data.session_summary.reduce((s, r) => s + r.present_count, 0);
  const totalAbsent   = data.session_summary.reduce((s, r) => s + r.absent_count, 0);
  const totalMarked   = totalPresent + totalAbsent;
  const overallRate   = totalExpected > 0 ? Math.round(100 * totalPresent / totalExpected) : 0;
  const neverAttended = data.rep_metrics.reduce((s, r) => s + r.never_attended, 0);

  const openSessionDrawer = (session: string) => {
    setSelectedSession(session);
    setSearch('');
    setLazyRoster([]);
    setRosterLoading(true);
    getRCSessionRoster(null, session, startDate, endDate)
      .then(rows => setLazyRoster(rows))
      .catch(() => setLazyRoster([]))
      .finally(() => setRosterLoading(false));
  };

  const openNeverAttendedDrawer = () => {
    setNeverAttendedDrawer(true);
    if (lazyNeverAttended.length === 0 && !neverLoading) {
      setNeverLoading(true);
      getRCSessionRoster(null, null, startDate, endDate)
        .then(rows => setLazyNeverAttended(rows.filter(c => c.total_present_ever === 0)))
        .catch(() => {})
        .finally(() => setNeverLoading(false));
    }
  };

  const filteredSessionCubs = lazyRoster.filter(c => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.cub_first_name?.toLowerCase().includes(q) ||
      c.cub_last_name?.toLowerCase().includes(q) ||
      c.parent_first_name?.toLowerCase().includes(q) ||
      c.parent_last_name?.toLowerCase().includes(q) ||
      c.parent_phone?.includes(q)
    );
  });

  const avgSessionRate = sortedSessions.length > 0
    ? Math.round(sortedSessions.reduce((sum, s) => sum + (s.attendance_rate_pct || 0), 0) / sortedSessions.length)
    : 0;

  return (
    <div>
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        <KpiCard
          label="Expected in Sessions"
          value={totalExpected}
          sub={`${sortedSessions.length} active sessions`}
          icon={BookOpenCheck}
          iconClass={styles.iconPrimary}
        />
        <KpiCard
          label="Present (Attended)"
          value={totalPresent}
          sub={`${overallRate}% of expected cubs`}
          icon={CheckCircle2}
          iconClass={styles.iconGreen}
          valueClass={styles.valueGreen}
        />
        <KpiCard
          label="Absent"
          value={totalAbsent}
          sub={`${totalMarked} records logged`}
          icon={AlertTriangle}
          iconClass={styles.iconOrange}
          valueClass={styles.valueOrange}
        />
        <KpiCard
          label="Never Attended"
          value={neverAttended}
          sub="Click to view inactive cubs"
          icon={AlertTriangle}
          iconClass={styles.iconRed}
          valueClass={styles.valueRed}
          onClick={() => openNeverAttendedDrawer()}
        />
        <KpiCard
          label="Overall Attendance Rate"
          value={`${overallRate}%`}
          sub={`Avg session: ${avgSessionRate}%`}
          icon={TrendingUp}
          iconClass={overallRate >= 70 ? styles.iconGreen : overallRate >= 40 ? styles.iconOrange : styles.iconRed}
          valueClass={overallRate >= 70 ? styles.valueGreen : overallRate >= 40 ? styles.valueOrange : styles.valueRed}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('rc-session-attendance', sortedSessions, [
            'session', 'expected_cubs', 'records_marked', 'present_count', 'absent_count', 'attendance_rate_pct'
          ])}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div style={{ paddingBottom: '2.5rem' }}>
        <DataTable
          emptyMsg="No reading circle sessions found for this date range."
          onRowClick={r => openSessionDrawer(r.session)}
          columns={[
            {
              key: 'session',
              label: 'Session',
              render: v => <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{v}</span>,
            },
            { key: 'expected_cubs', label: 'Expected', align: 'center' },
            { key: 'records_marked', label: 'Marked', align: 'center' },
            {
              key: 'present_count',
              label: 'Present',
              align: 'center',
              render: v => <span style={{ color: 'var(--green)', fontWeight: 700 }}>{v}</span>,
            },
            {
              key: 'absent_count',
              label: 'Absent',
              align: 'center',
              render: v => <span style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)' }}>{v}</span>,
            },
            {
              key: 'attendance_rate_pct',
              label: 'Rate',
              align: 'center',
              render: v => (
                <Badge label={`${v ?? 0}%`} variant={v >= 70 ? 'green' : v >= 40 ? 'orange' : 'red'} />
              ),
            },
          ]}
          rows={sortedSessions}
        />
      </div>

      {/* Session Roster Drawer */}
      <DetailDrawer
        title={`Session Roster — ${selectedSession ?? ''}`}
        isOpen={!!selectedSession}
        onClose={() => setSelectedSession(null)}
      >
        <div style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cubs in this session..."
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 13, outline: 'none'
            }}
          />
        </div>
        {rosterLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading session roster...
          </div>
        ) : filteredSessionCubs.map((cub, i) => (
          <div key={i} style={{
            padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)',
            border: '1px solid var(--border)', marginBottom: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{cub.cub_first_name} {cub.cub_last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Parent: {cub.parent_first_name} {cub.parent_last_name}</div>
                {cub.parent_phone && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>📞 {cub.parent_phone}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <Badge
                  label={cub.present_in_period > 0 ? 'Attended' : 'Absent'}
                  variant={cub.present_in_period > 0 ? 'green' : 'red'}
                />
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Rep: {cub.rep}
                </div>
              </div>
            </div>
          </div>
        ))}
      </DetailDrawer>

      {/* Never Attended Drawer */}
      <DetailDrawer
        title="Cubs Who Have Never Attended Reading Circle"
        isOpen={neverAttendedDrawer}
        onClose={() => setNeverAttendedDrawer(false)}
      >
        {neverLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading cubs...
          </div>
        ) : lazyNeverAttended.map((cub, i) => (
          <div key={i} style={{
            padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)',
            border: '1px solid var(--border)', marginBottom: 8
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{cub.cub_first_name} {cub.cub_last_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Session: {cub.session || 'Unassigned'} · Rep: {cub.rep}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Parent: {cub.parent_first_name} {cub.parent_last_name} {cub.parent_phone && `(📞 ${cub.parent_phone})`}</div>
          </div>
        ))}
      </DetailDrawer>
    </div>
  );
}

// ─── Tab: Orientation (General Community Focus) ────────────────

function OrientationReportTab({
  data
}: {
  data: {
    funnel: OrientationFunnelRow[];
    not_completed_detail: OrientationDetailRow[];
  };
}) {
  const [drawer, setDrawer] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'in_progress' | 'not_started'>('all');
  const [selectedDrawerRep, setSelectedDrawerRep] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const totals = data.funnel.reduce((acc, r) => ({
    total_gen_comm:   acc.total_gen_comm + (r.total_gen_comm || 0),
    completed:        acc.completed + (r.completed || 0),
    not_completed:    acc.not_completed + (r.not_completed || 0),
    in_progress:      acc.in_progress + (r.in_progress || 0),
    not_started:      acc.not_started + (r.not_started || 0),
    attended_present: acc.attended_present + (r.attended_present || 0),
    booked_count:     acc.booked_count + (r.booked_count || 0),
  }), {
    total_gen_comm: 0, completed: 0, not_completed: 0,
    in_progress: 0, not_started: 0, attended_present: 0, booked_count: 0
  });

  const completionRate = totals.total_gen_comm > 0 ? Math.round(100 * totals.completed / totals.total_gen_comm) : 0;
  const overallShowRate = totals.booked_count > 0 ? Math.round(100 * totals.attended_present / totals.booked_count) : 0;

  const inProgressCount = data.not_completed_detail.filter(c => c.progress_status === 'In Progress').length;
  const notStartedCount = data.not_completed_detail.filter(c => c.progress_status === 'Not Started').length;

  const filteredCubs = data.not_completed_detail.filter(c => {
    if (selectedDrawerRep && c.rep !== selectedDrawerRep) return false;
    if (filterMode === 'in_progress' && c.progress_status !== 'In Progress') return false;
    if (filterMode === 'not_started' && c.progress_status !== 'Not Started') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCub = `${c.cub_first_name} ${c.cub_last_name}`.toLowerCase().includes(q);
      const matchParent = `${c.parent_first_name} ${c.parent_last_name}`.toLowerCase().includes(q);
      const matchPhone = c.parent_phone?.includes(q);
      const matchRep = c.rep?.toLowerCase().includes(q);
      if (!matchCub && !matchParent && !matchPhone && !matchRep) return false;
    }
    return true;
  });

  const handleOpenDrawerWithMode = (mode: 'all' | 'in_progress' | 'not_started') => {
    setSelectedDrawerRep(null);
    setFilterMode(mode);
    setDrawer(true);
  };

  return (
    <div>
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        <KpiCard
          label="Total Gen. Comm."
          value={totals.total_gen_comm}
          sub="General Community cohort"
          icon={Users}
          iconClass={styles.iconPrimary}
        />
        <KpiCard
          label="Completed"
          value={totals.completed}
          sub={`${completionRate}% finished journey`}
          icon={CheckCircle2}
          iconClass={styles.iconGreen}
          valueClass={styles.valueGreen}
        />
        <KpiCard
          label="Left (Not Completed)"
          value={totals.not_completed}
          sub="Click to view pending cubs"
          icon={AlertCircle}
          iconClass={styles.iconOrange}
          valueClass={styles.valueOrange}
          onClick={() => handleOpenDrawerWithMode('all')}
        />
        <KpiCard
          label="In Progress"
          value={totals.in_progress}
          sub="Invited / Booked"
          icon={Compass}
          iconClass={styles.iconBlue}
          onClick={() => handleOpenDrawerWithMode('in_progress')}
        />
        <KpiCard
          label="Not Started"
          value={totals.not_started}
          sub="Yet to begin orientation"
          icon={AlertTriangle}
          iconClass={styles.iconRed}
          valueClass={totals.not_started > 0 ? styles.valueRed : undefined}
          onClick={() => handleOpenDrawerWithMode('not_started')}
        />
        <KpiCard
          label="Show Rate"
          value={`${overallShowRate}%`}
          sub={`${totals.attended_present} present / ${totals.booked_count} booked`}
          icon={BarChart2}
          iconClass={overallShowRate >= 70 ? styles.iconGreen : overallShowRate >= 40 ? styles.iconOrange : styles.iconRed}
          valueClass={overallShowRate >= 70 ? styles.valueGreen : overallShowRate >= 40 ? styles.valueOrange : styles.valueRed}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionTitle>General Community Orientation — Rep Breakdown</SectionTitle>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => handleOpenDrawerWithMode('all')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <Users size={13} /> View Pending Cubs ({totals.not_completed})
          </button>
          <button
            onClick={() => exportCSV('orientation-gen-comm-funnel', data.funnel, [
              'rep', 'total_gen_comm', 'completed', 'not_completed', 'in_progress', 'not_started', 'attended_present', 'show_rate_pct'
            ])}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      <DataTable
        onRowClick={r => {
          setSelectedDrawerRep(r.rep);
          setDrawer(true);
        }}
        columns={[
          { key: 'rep', label: 'Rep', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: 'total_gen_comm', label: 'Total Gen Comm', align: 'center' },
          {
            key: 'completed',
            label: 'Completed',
            align: 'center',
            render: v => <span style={{ color: 'var(--green)', fontWeight: 700 }}>{v}</span>,
          },
          {
            key: 'not_completed',
            label: 'Left (Pending)',
            align: 'center',
            render: v => <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{v}</span>,
          },
          {
            key: 'in_progress',
            label: 'In Progress',
            align: 'center',
            render: v => <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{v}</span>,
          },
          {
            key: 'not_started',
            label: 'Not Started',
            align: 'center',
            render: v => <span style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontWeight: v > 0 ? 700 : 400 }}>{v}</span>,
          },
          { key: 'attended_present', label: 'Attended (Present)', align: 'center' },
          {
            key: 'show_rate_pct',
            label: 'Show Rate',
            align: 'center',
            render: v => (
              <Badge label={`${v ?? 0}%`} variant={(v ?? 0) >= 70 ? 'green' : (v ?? 0) >= 40 ? 'orange' : 'red'} />
            ),
          },
        ]}
        rows={data.funnel}
      />

      {/* Pending Cubs Drawer */}
      <DetailDrawer
        title="Gen. Comm. Cubs — Left to Complete Orientation"
        isOpen={drawer}
        onClose={() => setDrawer(false)}
      >
        <div style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pending cubs by name, parent, phone..."
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 13, outline: 'none'
            }}
          />
        </div>

        {selectedDrawerRep && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Filtered by Rep:</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 12, background: 'var(--primary-dim)',
              color: 'var(--primary)', fontSize: 12, fontWeight: 600,
            }}>
              {selectedDrawerRep}
              <button
                onClick={() => setSelectedDrawerRep(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', padding: 0 }}
                title="Clear rep filter"
              >
                <X size={12} />
              </button>
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { id: 'all',         label: `All Left (${data.not_completed_detail.length})` },
            { id: 'in_progress', label: `In Progress (${inProgressCount})` },
            { id: 'not_started', label: `Not Started (${notStartedCount})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id as any)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: filterMode === f.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: filterMode === f.id ? 'var(--primary-dim)' : 'var(--bg-card)',
                color: filterMode === f.id ? 'var(--primary)' : 'var(--text-2)',
                cursor: 'pointer'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => exportCSV('orientation-pending-cubs', filteredCubs, [
              'rep', 'cub_first_name', 'cub_last_name', 'parent_first_name', 'parent_last_name',
              'parent_phone', 'stage', 'session', 'booked_date', 'date_onboarded', 'progress_status'
            ])}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <Download size={12} /> Export CSV ({filteredCubs.length})
          </button>
        </div>

        {filteredCubs.map((c, i) => (
          <div key={i} style={{
            padding: '12px 14px', borderRadius: 10, background: 'var(--bg-card)',
            border: '1px solid var(--border)', marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>
                  {c.cub_first_name} {c.cub_last_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Parent: {c.parent_first_name} {c.parent_last_name} {c.parent_phone && `(📞 ${c.parent_phone})`}
                </div>
              </div>
              <Badge
                label={c.progress_status}
                variant={c.progress_status === 'In Progress' ? 'blue' : 'red'}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
              Rep: <strong>{c.rep}</strong> · Stage: <strong>{c.stage || 'New'}</strong>
              {c.session && ` · Session: ${c.session}`}
              {c.booked_date && ` · Booked: ${formatDate(c.booked_date)}`}
            </div>
            {c.date_onboarded && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Onboarded: {formatDate(c.date_onboarded)}
              </div>
            )}
          </div>
        ))}
      </DetailDrawer>
    </div>
  );
}

// ─── Tab: Expiry & Retention (General Community Focus) ─────────

function ExpiryReportTab({
  data
}: {
  data: {
    retention_metrics: RetentionMetricsRow[];
    expiring_soon_detail: ExpiredDetailRow[];
    expired_detail: ExpiredDetailRow[];
  };
}) {
  const [drawer, setDrawer] = useState<'expiring' | 'expired' | null>(null);

  const totals = data.retention_metrics.reduce((acc, r) => ({
    total_cubs:   acc.total_cubs + r.total_cubs,
    active_count: acc.active_count + r.active_count,
    expiring_7d:  acc.expiring_7d + r.expiring_7d,
    expiring_30d: acc.expiring_30d + r.expiring_30d,
    expired:      acc.expired + r.expired_count,
  }), { total_cubs: 0, active_count: 0, expiring_7d: 0, expiring_30d: 0, expired: 0 });

  const overallRate = totals.total_cubs > 0 ? Math.round(100 * totals.active_count / totals.total_cubs) : 0;

  return (
    <div>
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        <KpiCard
          label="Total Gen. Comm."
          value={totals.total_cubs}
          sub="General Community cohort"
          icon={Users}
          iconClass={styles.iconPrimary}
        />
        <KpiCard
          label="Active Cubs"
          value={totals.active_count}
          sub={`${overallRate}% retention rate`}
          icon={CheckCircle2}
          iconClass={styles.iconGreen}
          valueClass={styles.valueGreen}
        />
        <KpiCard
          label="Expiring in 7 Days"
          value={totals.expiring_7d}
          sub="Click to view urgent renewals"
          icon={AlertTriangle}
          iconClass={styles.iconRed}
          valueClass={totals.expiring_7d > 0 ? styles.valueRed : undefined}
          onClick={() => setDrawer('expiring')}
        />
        <KpiCard
          label="Expiring in 30 Days"
          value={totals.expiring_30d}
          sub="Renewal pipeline"
          icon={AlertTriangle}
          iconClass={styles.iconOrange}
          valueClass={totals.expiring_30d > 0 ? styles.valueOrange : undefined}
          onClick={() => setDrawer('expiring')}
        />
        <KpiCard
          label="Expired"
          value={totals.expired}
          sub="Click to view expired cubs"
          icon={TrendingDown}
          iconClass={styles.iconRed}
          valueClass={styles.valueRed}
          onClick={() => setDrawer('expired')}
        />
        <KpiCard
          label="Retention Rate"
          value={`${overallRate}%`}
          sub="Active / Total Gen Comm"
          icon={BarChart2}
          iconClass={overallRate >= 70 ? styles.iconGreen : overallRate >= 50 ? styles.iconOrange : styles.iconRed}
          valueClass={overallRate >= 70 ? styles.valueGreen : overallRate >= 50 ? styles.valueOrange : styles.valueRed}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('retention-metrics-gen-comm', data.retention_metrics, [
            'rep', 'total_cubs', 'active_count', 'expiring_7d', 'expiring_30d', 'expired_count', 'retention_rate_pct'
          ])}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      <DataTable
        columns={[
          { key: 'rep', label: 'Rep', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: 'total_cubs', label: 'Total Gen Comm', align: 'center' },
          {
            key: 'active_count',
            label: 'Active',
            align: 'center',
            render: v => <span style={{ color: 'var(--green)', fontWeight: 600 }}>{v}</span>,
          },
          {
            key: 'expiring_7d',
            label: 'Expiring ≤ 7d',
            align: 'center',
            render: v => (
              <span style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontWeight: v > 0 ? 700 : 400 }}>{v}</span>
            ),
          },
          {
            key: 'expiring_30d',
            label: 'Expiring ≤ 30d',
            align: 'center',
            render: v => (
              <span style={{ color: v > 0 ? 'var(--orange)' : 'var(--text-3)', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
            ),
          },
          {
            key: 'expired_count',
            label: 'Expired',
            align: 'center',
            render: v => <span style={{ color: 'var(--red)' }}>{v}</span>,
          },
          {
            key: 'retention_rate_pct',
            label: 'Retention Rate',
            align: 'center',
            render: v => (
              <Badge label={`${v ?? 0}%`} variant={(v ?? 0) >= 70 ? 'green' : (v ?? 0) >= 50 ? 'orange' : 'red'} />
            ),
          },
        ]}
        rows={data.retention_metrics}
      />

      {/* Expiring Soon Detail Drawer */}
      <DetailDrawer
        title="Gen. Comm. Cubs — Expiring Soon"
        isOpen={drawer === 'expiring'}
        onClose={() => setDrawer(null)}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => exportCSV('expiring-soon-cubs', data.expiring_soon_detail, [
              'rep', 'cub_first_name', 'cub_last_name', 'parent_first_name', 'parent_last_name', 'parent_phone', 'sub_end_date'
            ])}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 11, cursor: 'pointer' }}
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
        {data.expiring_soon_detail.map((c, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.cub_first_name} {c.cub_last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Parent: {c.parent_first_name} {c.parent_last_name} {c.parent_phone && `(📞 ${c.parent_phone})`}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Rep: {c.rep}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>
                  Expires: {formatDate(c.sub_end_date)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </DetailDrawer>

      {/* Expired Detail Drawer */}
      <DetailDrawer
        title="Gen. Comm. Cubs — Expired"
        isOpen={drawer === 'expired'}
        onClose={() => setDrawer(null)}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => exportCSV('expired-cubs', data.expired_detail, [
              'rep', 'cub_first_name', 'cub_last_name', 'parent_first_name', 'parent_last_name', 'parent_phone', 'sub_end_date', 'attended_orientation', 'enrolled_rc'
            ])}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 11, cursor: 'pointer' }}
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
        {data.expired_detail.map((c, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.cub_first_name} {c.cub_last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Parent: {c.parent_first_name} {c.parent_last_name} {c.parent_phone && `(📞 ${c.parent_phone})`}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Rep: {c.rep}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                  Expired: {formatDate(c.sub_end_date)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </DetailDrawer>
    </div>
  );
}

// ─── Main ReportsClient ────────────────────────────────────────

interface ReportsClientProps {
  isAdmin: boolean;
  currentRep: string;
  allReps: string[];
  allPurposes?: string[];
  activeTab: string;
  dateParam?: string;
  startParam?: string;
  endParam?: string;
  dailyActivity: DailyActivityRow[];
  callParentsReport: CallParentsReportData;
  rcReport: {
    session_summary: RCSessionSummaryRow[];
    rep_metrics: { rep: string; total_enrolled: number; never_attended: number; attended_in_period: number }[];
    cub_detail: RCCubDetailRow[];
  };
  orientationReport: {
    funnel: OrientationFunnelRow[];
    not_completed_detail: OrientationDetailRow[];
  };
  expiryReport: {
    retention_metrics: RetentionMetricsRow[];
    expiring_soon_detail: ExpiredDetailRow[];
    expired_detail: ExpiredDetailRow[];
  };
}

export default function ReportsClient({
  isAdmin, currentRep, allReps, allPurposes = [], activeTab,
  dateParam, startParam, endParam,
  dailyActivity, callParentsReport, rcReport,
  orientationReport, expiryReport,
}: ReportsClientProps) {
  const searchParams = useSearchParams();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [currentTab, setCurrentTab] = useState<string>(activeTab);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = currentTab;
  }, [currentTab]);

  const [start, setStart] = useState(startParam ?? dateParam ?? todayStr);
  const [end, setEnd]     = useState(endParam ?? dateParam ?? todayStr);

  const [dailyData, setDailyData] = useState<DailyActivityRow[] | null>(dailyActivity.length > 0 || activeTab === 'daily' ? dailyActivity : null);
  const [flagsData, setFlagsData] = useState<CallParentsReportData | null>(callParentsReport.summary.length > 0 || activeTab === 'flags' ? callParentsReport : null);
  const [rcData, setRcData] = useState<typeof rcReport | null>(rcReport.session_summary.length > 0 || activeTab === 'rc' ? rcReport : null);
  const [orientationData, setOrientationData] = useState<typeof orientationReport | null>(orientationReport.funnel.length > 0 || activeTab === 'orientation' ? orientationReport : null);
  const [expiryData, setExpiryData] = useState<typeof expiryReport | null>(expiryReport.retention_metrics.length > 0 || activeTab === 'expiry' ? expiryReport : null);

  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  // Sync if initial props change
  useEffect(() => {
    setCurrentTab(activeTab);
    activeTabRef.current = activeTab;
    if (activeTab === 'daily' && dailyActivity.length > 0) setDailyData(dailyActivity);
    if (activeTab === 'flags' && callParentsReport.summary.length > 0) setFlagsData(callParentsReport);
    if (activeTab === 'rc' && rcReport.session_summary.length > 0) setRcData(rcReport);
    if (activeTab === 'orientation' && orientationReport.funnel.length > 0) setOrientationData(orientationReport);
    if (activeTab === 'expiry' && expiryReport.retention_metrics.length > 0) setExpiryData(expiryReport);
  }, [activeTab, dailyActivity, callParentsReport, rcReport, orientationReport, expiryReport]);

  const repFilter = isAdmin ? (searchParams.get('rep') || undefined) : (currentRep && currentRep !== 'All Reps' ? currentRep : undefined);

  const setTab = useCallback((t: string) => {
    setCurrentTab(t);
    activeTabRef.current = t;

    let nextStart = start;
    let nextEnd = end;
    if (t === 'daily' || t === 'flags') {
      nextStart = todayStr;
      nextEnd = todayStr;
      setStart(todayStr);
      setEnd(todayStr);
    } else if (t === 'rc') {
      const sunWeek = getSundayWeek();
      nextStart = sunWeek.start;
      nextEnd = sunWeek.end;
      setStart(sunWeek.start);
      setEnd(sunWeek.end);
    } else if (t === 'orientation' || t === 'expiry') {
      nextStart = '';
      nextEnd = '';
      setStart('');
      setEnd('');
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      if (nextStart) url.searchParams.set('start', nextStart); else url.searchParams.delete('start');
      if (nextEnd) url.searchParams.set('end', nextEnd); else url.searchParams.delete('end');
      if (t === 'daily' || t === 'flags') url.searchParams.set('date', nextStart); else url.searchParams.delete('date');
      window.history.replaceState(null, '', url.pathname + url.search);
    }

    // On-demand fetch if tab data not yet loaded
    if (t === 'daily') {
      if (!dailyData || dailyData.length === 0) {
        setLoadingTab('daily');
        getDailyActivityReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'daily') setDailyData(res); })
          .catch(() => { if (activeTabRef.current === 'daily') setDailyData([]); })
          .finally(() => { if (activeTabRef.current === 'daily') setLoadingTab(null); });
      }
    } else if (t === 'flags') {
      if (!flagsData || flagsData.summary.length === 0) {
        setLoadingTab('flags');
        getCallParentsReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'flags') setFlagsData(res); })
          .catch(() => { if (activeTabRef.current === 'flags') setFlagsData({ summary: [], detail: [] }); })
          .finally(() => { if (activeTabRef.current === 'flags') setLoadingTab(null); });
      }
    } else if (t === 'rc') {
      if (!rcData || rcData.session_summary.length === 0) {
        setLoadingTab('rc');
        getRCAttendanceReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'rc') setRcData(res); })
          .catch(() => { if (activeTabRef.current === 'rc') setRcData({ session_summary: [], rep_metrics: [], cub_detail: [] }); })
          .finally(() => { if (activeTabRef.current === 'rc') setLoadingTab(null); });
      }
    } else if (t === 'orientation') {
      if (!orientationData || orientationData.funnel.length === 0) {
        setLoadingTab('orientation');
        getOrientationReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'orientation') setOrientationData(res); })
          .catch(() => { if (activeTabRef.current === 'orientation') setOrientationData({ funnel: [], not_completed_detail: [] }); })
          .finally(() => { if (activeTabRef.current === 'orientation') setLoadingTab(null); });
      }
    } else if (t === 'expiry') {
      if (!expiryData || expiryData.retention_metrics.length === 0) {
        setLoadingTab('expiry');
        getExpiryRetentionReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'expiry') setExpiryData(res); })
          .catch(() => { if (activeTabRef.current === 'expiry') setExpiryData({ retention_metrics: [], expiring_soon_detail: [], expired_detail: [] }); })
          .finally(() => { if (activeTabRef.current === 'expiry') setLoadingTab(null); });
      }
    }
  }, [start, end, todayStr, repFilter, dailyData, flagsData, rcData, orientationData, expiryData]);

  const applyRange = useCallback((s: string, e: string) => {
    setStart(s);
    setEnd(e);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (s) url.searchParams.set('start', s); else url.searchParams.delete('start');
      if (e) url.searchParams.set('end', e); else url.searchParams.delete('end');
      if (currentTab === 'daily' || currentTab === 'flags') url.searchParams.set('date', s); else url.searchParams.delete('date');
      window.history.replaceState(null, '', url.pathname + url.search);
    }

    setLoadingTab(currentTab);

    if (currentTab === 'daily') {
      getDailyActivityReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'daily') setDailyData(res); })
        .finally(() => { if (activeTabRef.current === 'daily') setLoadingTab(null); });
    } else if (currentTab === 'flags') {
      getCallParentsReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'flags') setFlagsData(res); })
        .finally(() => { if (activeTabRef.current === 'flags') setLoadingTab(null); });
    } else if (currentTab === 'rc') {
      getRCAttendanceReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'rc') setRcData(res); })
        .finally(() => { if (activeTabRef.current === 'rc') setLoadingTab(null); });
    } else if (currentTab === 'orientation') {
      getOrientationReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'orientation') setOrientationData(res); })
        .finally(() => { if (activeTabRef.current === 'orientation') setLoadingTab(null); });
    } else if (currentTab === 'expiry') {
      getExpiryRetentionReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'expiry') setExpiryData(res); })
        .finally(() => { if (activeTabRef.current === 'expiry') setLoadingTab(null); });
    }
  }, [currentTab, repFilter]);

  const isContentLoading = loadingTab === currentTab;

  return (
    <div>
      {/* ── Navigation Tabs (First at the Top) ── */}
      <div className={tabStyles.tabs} style={{ marginBottom: '1.25rem' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`${tabStyles.tabBtn} ${active ? tabStyles.tabBtnActive : ''}`}
            >
              <Icon size={14} style={{ marginRight: 6 }} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filter Dropdown Module (Below Tabs) ── */}
      <FilterDropdownModule
        activeTab={currentTab}
        startDate={start}
        endDate={end}
        onApplyRange={applyRange}
      />

      {/* ── Tab Content or Exact Tab-Specific Skeleton Transition ── */}
      {isContentLoading ? (
        <ReportsTabContentSkeleton tab={currentTab} />
      ) : (
        <>
          {currentTab === 'daily'       && (dailyData ? <DailyActivityTab data={dailyData} startDate={start} endDate={end} allPurposes={allPurposes} repFilter={repFilter} /> : <ReportsTabContentSkeleton tab="daily" />)}
          {currentTab === 'flags'       && (flagsData ? <FlagsCallParentsTab data={flagsData} /> : <ReportsTabContentSkeleton tab="flags" />)}
          {currentTab === 'rc'          && (rcData ? <RCReportTab data={rcData} startDate={start} endDate={end} /> : <ReportsTabContentSkeleton tab="rc" />)}
          {currentTab === 'orientation' && (orientationData ? <OrientationReportTab data={orientationData} /> : <ReportsTabContentSkeleton tab="orientation" />)}
          {currentTab === 'expiry'      && (expiryData ? <ExpiryReportTab data={expiryData} /> : <ReportsTabContentSkeleton tab="expiry" />)}
        </>
      )}
    </div>
  );
}
