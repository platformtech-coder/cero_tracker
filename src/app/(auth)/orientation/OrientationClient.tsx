'use client';

import { useState, useMemo, useTransition, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Sparkles, AlertCircle, Users, BookOpen,
  Target, BarChart3, CalendarCheck, Calendar, Loader2,
  AlertTriangle, ArrowUpDown, Download, Filter, X,
  Phone, CheckCircle, Compass, Baby
} from 'lucide-react';
import type { Orientation, PendingSignup, Cub, Profile } from '@/lib/types';
import {
  getOrientationScorecardMetrics,
  getOrientationMaster,
  type OrientationScorecardMetrics,
} from '@/lib/actions/orientation';
import ProcessPendingDrawer from '@/components/drawers/ProcessPendingDrawer';
import OrientationJourneyDrawer from '@/components/drawers/OrientationJourneyDrawer';

import sharedStyles from '@/components/ui/dashboard.module.css';
import {
  OrientationFilterDrawer,
  applyOrientationFilters,
  emptyOrientationFilterState,
  countOrientationFilters,
  type OrientationFilterState,
} from '@/components/ui/OrientationFilterDrawer';
import tabStyles from '../engagements/engagements.module.css';
import { formatDate, formatDateTime } from '@/lib/utils/date';
import { toast } from 'sonner';
import { useTableSort } from '@/hooks/useTableSort';

const PAGE_SIZE = 20;

export type OrientationMasterItem = Orientation & {
  cubs: Pick<Cub, 'cub_first_name' | 'cub_last_name' | 'segment' | 'relationship_owner' | 'parent_first_name' | 'parent_last_name' | 'parent_phone' | 'parent_email'> & {
    sub_status?: string | null;
    date_onboarded?: string | null;
    cumulative_points?: number;
    last_reading_activity?: string | null;
    reading_circle_category?: string | null;
    orientation_completion_date?: string | null;
  };
};

function Pagination({ page, total, pageSize, onChange }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let i = start; i <= Math.min(totalPages, start + 4); i++) pages.push(i);
  return (
    <div className={sharedStyles.pagination}>
      <span>Page {page} of {totalPages} — {total} rows</span>
      <div className={sharedStyles.paginationBtns}>
        <button className={sharedStyles.pageBtn} onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}><ChevronLeft size={14} /></button>
        {pages.map(p => <button key={p} className={`${sharedStyles.pageBtn} ${p === page ? sharedStyles.pageBtnActive : ''}`} onClick={() => onChange(p)}>{p}</button>)}
        <button className={sharedStyles.pageBtn} onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

export const STANDARDIZED_ORIENTATION_STAGES = ['Invited', 'Booked', 'Attended', 'RC Selected', 'Completed'] as const;
export const STANDARDIZED_ORIENTATION_STATUSES = ['Completed', 'Pending'] as const;

function StageBadge({ stage, stageStatus }: { stage: string | null; stageStatus: string | null }) {
  if (!stage) return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGray}`}>—</span>;
  const displayStage = stage === 'Reading Circle Selected' ? 'RC Selected' : stage;
  const isCompleted = (stageStatus ?? '').trim().toLowerCase() === 'completed';
  const cls = isCompleted ? sharedStyles.badgeGreen
    : stageStatus === 'In Progress' ? sharedStyles.badgeOrange
    : sharedStyles.badgeBlue;
  return <span className={`${sharedStyles.badge} ${cls}`}>{displayStage}</span>;
}

function AttendanceBadge({ status }: { status: string | null }) {
  if (status === 'Present') {
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGreen}`}>Present</span>;
  }
  if (status === 'Absent') {
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeRed}`}>Absent</span>;
  }
  if (status === 'Rescheduled') {
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeOrange}`}>Rescheduled</span>;
  }
  return <span className={`${sharedStyles.badge} ${sharedStyles.badgeBlue}`}>Booked</span>;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cls = confidence === 'High' ? sharedStyles.badgeGreen
    : confidence === 'Medium' ? sharedStyles.badgeOrange
    : confidence === 'Low' ? sharedStyles.badgeRed
    : sharedStyles.badgeGray;
  return <span className={`${sharedStyles.badge} ${cls}`}>{confidence}</span>;
}

function getDaysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const target = new Date(y, m, d);
      return Math.max(0, Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24)));
    }
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
}

function getCalendarDayDiff(fromStr?: string | null, toStr?: string | null): number | null {
  if (!fromStr || !toStr) return null;
  const p1 = fromStr.slice(0, 10).split('-');
  const p2 = toStr.slice(0, 10).split('-');
  if (p1.length === 3 && p2.length === 3) {
    const y1 = parseInt(p1[0], 10);
    const m1 = parseInt(p1[1], 10) - 1;
    const d1 = parseInt(p1[2], 10);
    const y2 = parseInt(p2[0], 10);
    const m2 = parseInt(p2[1], 10) - 1;
    const d2 = parseInt(p2[2], 10);
    if (!isNaN(y1) && !isNaN(m1) && !isNaN(d1) && !isNaN(y2) && !isNaN(m2) && !isNaN(d2)) {
      const date1 = new Date(y1, m1, d1);
      const date2 = new Date(y2, m2, d2);
      return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
    }
  }
  const date1 = new Date(fromStr);
  const date2 = new Date(toStr);
  if (isNaN(date1.getTime()) || isNaN(date2.getTime())) return null;
  return Math.round((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}

function isCompletedWithin7Days(m: OrientationMasterItem): boolean {
  if (!m.cubs.date_onboarded) return false;

  // 1. Full orientation journey completed within 7 calendar days
  const isJourneyDone = Boolean(m.completion_date) || Boolean(m.cubs.orientation_completion_date) || (m.stage || '').toLowerCase().includes('completed');
  if (isJourneyDone) {
    const compDate = m.completion_date || m.cubs.orientation_completion_date || m.first_win_date;
    if (compDate) {
      const diff = getCalendarDayDiff(m.cubs.date_onboarded, compDate);
      if (diff !== null && diff <= 7) return true;
    } else {
      const daysSince = getDaysSince(m.cubs.date_onboarded);
      if (daysSince !== null && daysSince <= 7) return true;
    }
  }

  // 2. Attended orientation session within 7 calendar days
  const hasAttended = m.attended_status === 'Present' || Boolean(m.attended_date);
  if (hasAttended) {
    if (m.attended_date) {
      const diff = getCalendarDayDiff(m.cubs.date_onboarded, m.attended_date);
      if (diff !== null && diff <= 7) return true;
    } else {
      const daysSince = getDaysSince(m.cubs.date_onboarded);
      if (daysSince !== null && daysSince <= 7) return true;
    }
  }

  return false;
}

function DaysElapsedBadge({ dateStr }: { dateStr?: string | null }) {
  const days = getDaysSince(dateStr);
  if (days === null) {
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGray}`}>No Date</span>;
  }
  if (days <= 3) {
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGreen}`}>Day {days} of 7</span>;
  }
  if (days <= 7) {
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeOrange}`}>Day {days} of 7</span>;
  }
  return (
    <span className={`${sharedStyles.badge} ${sharedStyles.badgeRed}`} title={`${days} days since onboarding`}>
      {days}d Overdue
    </span>
  );
}

// ─── Pending Signups Stats ─────────────────────────────────────
function OrientationPendingStats({ pending }: { pending: PendingSignup[] }) {
  const total = pending.length;
  const linked = pending.filter(p => Boolean(p.matched_cub_id)).length;
  const unlinked = total - linked;
  const highConfidence = pending.filter(p => p.match_confidence === 'High').length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {[
        { label: 'Pending Bookings', value: total, icon: Clock, color: 'var(--primary)', bg: 'var(--primary-dim)' },
        { label: 'Auto-Matched Cubs', value: linked, icon: CheckCircle2, color: 'var(--green)', bg: 'var(--green-dim)' },
        { label: 'Unlinked / Review', value: unlinked, icon: AlertCircle, color: unlinked > 0 ? 'var(--orange)' : 'var(--text-3)', bg: unlinked > 0 ? 'var(--orange-dim)' : 'var(--bg-2)' },
        { label: 'High Confidence', value: highConfidence, icon: Sparkles, color: 'var(--blue)', bg: 'var(--blue-dim)' },
      ].map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: bg, color, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Scorecard Stats Panel with Interactive Cubs Date Filters ──
function toYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const PRESET_OPTIONS = [
  { id: 'all', label: 'All Time' },
  { id: 'thisWeek', label: 'This week' },
  { id: 'lastWeek', label: 'Last week' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'custom', label: 'Custom Date' },
] as const;

function computePresetDates(preset: string) {
  const now = new Date();

  if (preset === 'thisWeek') {
    // Week starts on Sunday (day 0) and ends on Saturday (day 6)
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const saturday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 6);
    return { start: toYMD(sunday), end: toYMD(saturday) };
  }

  if (preset === 'lastWeek') {
    // Previous week Sunday through Saturday
    const lastSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
    const lastSaturday = new Date(lastSunday.getFullYear(), lastSunday.getMonth(), lastSunday.getDate() + 6);
    return { start: toYMD(lastSunday), end: toYMD(lastSaturday) };
  }

  if (preset === 'thisMonth') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: toYMD(firstDay), end: toYMD(lastDay) };
  }

  return { start: '', end: '' };
}

// ─── Orientation Status Alerts Definition ──────────────────────
export type OrientationAlertKey = 'suspend_14d' | 'at_risk_8_14' | 'overdue_1on1' | 'unbooked' | 'pending_rc';

export interface AlertBadgeMeta {
  key: OrientationAlertKey;
  label: string;
  badgeClass: string;
  icon: React.ElementType;
  description: string;
}

export const ALERT_METAS: Record<OrientationAlertKey, AlertBadgeMeta> = {
  suspend_14d: {
    key: 'suspend_14d',
    label: 'To Suspend',
    badgeClass: sharedStyles.badgeRed,
    icon: AlertTriangle,
    description: '>14 days, 0 points earned',
  },
  at_risk_8_14: {
    key: 'at_risk_8_14',
    label: 'At Risk (0 Pts)',
    badgeClass: sharedStyles.badgeOrange,
    icon: AlertCircle,
    description: 'Day 8–14, 0 points earned',
  },
  overdue_1on1: {
    key: 'overdue_1on1',
    label: '1-on-1 Needed',
    badgeClass: sharedStyles.badgeOrange,
    icon: Clock,
    description: '>7d incomplete orientation',
  },
  unbooked: {
    key: 'unbooked',
    label: 'Not Yet Booked',
    badgeClass: sharedStyles.badgeBlue,
    icon: Calendar,
    description: 'Awaiting session booking',
  },
  pending_rc: {
    key: 'pending_rc',
    label: 'Pending RC',
    badgeClass: sharedStyles.badgePrimary,
    icon: BookOpen,
    description: 'Attended, needs RC selection',
  },
};

export function getCubAlert(m: OrientationMasterItem): AlertBadgeMeta | null {
  const isDone = Boolean(m.completion_date) || Boolean(m.cubs.orientation_completion_date) || (m.stage || '').toLowerCase().includes('completed');
  if (isDone) return null;

  const days = getDaysSince(m.cubs.date_onboarded);
  const pts = m.cubs.cumulative_points || 0;
  const hasAttended = m.attended_status === 'Present' || Boolean(m.attended_date) || m.stage === 'Attended' || m.stage === 'RC Selected' || m.rc_selected_status === 'Completed';
  const hasRC = m.rc_selected_status === 'Completed' || Boolean(m.rc_selected_date) || Boolean(m.cubs.reading_circle_category) || m.stage === 'RC Selected';

  // 1. To Suspend: >14 days since onboarding, incomplete, 0 points
  if (days !== null && days > 14 && pts === 0) {
    return ALERT_METAS.suspend_14d;
  }

  // 2. At Risk: Day 8-14 since onboarding, incomplete, 0 points
  if (days !== null && days >= 8 && days <= 14 && pts === 0) {
    return ALERT_METAS.at_risk_8_14;
  }

  // 3. Pending RC Selection: Attended orientation session but has not selected Reading Circle
  if (hasAttended && !hasRC) {
    return ALERT_METAS.pending_rc;
  }

  // 4. Overdue 1-on-1 Needed: >7 days since onboarding, did not attend orientation session
  if (days !== null && days > 7 && !hasAttended) {
    return ALERT_METAS.overdue_1on1;
  }

  // 5. Not Yet Booked: Incomplete and no orientation session booked
  if (!m.session) {
    return ALERT_METAS.unbooked;
  }

  return null;
}

// ─── CSV Export Function ───────────────────────────────────────
function downloadCubsCSV(cubs: OrientationMasterItem[], filterLabel: string) {
  const headers = [
    'Cub ID',
    'Cub Name',
    'Parent Name',
    'Parent Phone',
    'Parent Email',
    'Date Onboarded',
    'Days Elapsed',
    'Status Alert',
    'Orientation Session',
    'Current Stage',
    'Attended Status',
    'RC Selected Status',
    'First Win Status',
    'Points',
    'Relationship Owner'
  ];

  const rows = cubs.map(m => {
    const days = getDaysSince(m.cubs.date_onboarded);
    const alert = getCubAlert(m);
    return [
      m.cub_id,
      `"${(m.cubs.cub_first_name || '') + ' ' + (m.cubs.cub_last_name || '')}"`,
      `"${(m.cubs.parent_first_name || '') + ' ' + (m.cubs.parent_last_name || '')}"`,
      `"${m.cubs.parent_phone || ''}"`,
      `"${m.cubs.parent_email || ''}"`,
      m.cubs.date_onboarded || '',
      days !== null ? days : '',
      `"${alert ? alert.label : 'None'}"`,
      m.session || 'None',
      `"${m.stage || ''}"`,
      m.attended_status || '—',
      m.rc_selected_status || '—',
      m.first_win_status || '—',
      m.cubs.cumulative_points || 0,
      `"${m.cubs.relationship_owner || ''}"`,
    ];
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().slice(0, 10);
  const safeName = filterLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
  a.download = `orientation_cubs_${safeName}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast.success(`Exported ${cubs.length} cubs to CSV`);
}

// ─── Comprehensive Orientation Stats Dashboard ────────────────
interface OrientationStatsDashboardProps {
  master: OrientationMasterItem[];
  isAdmin?: boolean;
  allReps?: string[];
  currentRep?: string;
  onSelectRecord: (record: OrientationMasterItem) => void;
}

function OrientationStatsDashboard({
  master,
  isAdmin,
  allReps = [],
  currentRep = 'All Reps',
  onSelectRecord,
}: OrientationStatsDashboardProps) {
  const [preset, setPreset] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRep, setSelectedRep] = useState(currentRep);
  const [quickFilter, setQuickFilter] = useState<'all_action' | 'to_suspend' | 'at_risk' | '1on1_needed' | 'unbooked' | 'pending_rc' | 'all_cubs'>('all_action');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const handlePresetSelect = (id: string) => {
    setPreset(id);
    if (id === 'custom') return;
    const { start, end } = computePresetDates(id);
    setStartDate(start);
    setEndDate(end);
    setPage(1);
  };

  // Cubs in active General Community category matching date and rep filter
  const orientationCubs = useMemo(() => {
    return master.filter(m => {
      // General community active or almost expiring
      const s = (m.cubs.sub_status || '').toLowerCase().trim();
      if (s !== 'active' && s !== 'almost expiring') return false;
      if (m.cubs.segment && m.cubs.segment !== 'Gen. Comm') return false;

      // Rep filter
      if (selectedRep && selectedRep !== 'All Reps' && m.cubs.relationship_owner !== selectedRep) {
        return false;
      }

      // Date onboarded range (normalized YYYY-MM-DD comparison)
      const cubDate = (m.cubs.date_onboarded || '').slice(0, 10);
      if (startDate && (!cubDate || cubDate < startDate)) {
        return false;
      }
      if (endDate && (!cubDate || cubDate > endDate)) {
        return false;
      }

      return true;
    });
  }, [master, selectedRep, startDate, endDate]);

  // Derived stats and cub groups
  const stats = useMemo(() => {
    const total = orientationCubs.length;

    // 1. 7-Day Completion:
    // Numerator: Cubs who completed orientation session or journey within the first 7 days
    const completed7d = orientationCubs.filter(isCompletedWithin7Days);

    // Denominator: Cubs whose tenure has matured (>= 7 days) OR who completed within 7 days
    const evaluated7d = orientationCubs.filter(m => {
      const days = getDaysSince(m.cubs.date_onboarded);
      return (days !== null && days >= 7) || isCompletedWithin7Days(m);
    });

    const rate7d = evaluated7d.length > 0
      ? Math.round((completed7d.length / evaluated7d.length) * 1000) / 10
      : 0;

    // 2. RC Conversion: Cubs who attended orientation and selected RC
    const attended = orientationCubs.filter(m =>
      m.attended_status === 'Present' ||
      Boolean(m.attended_date) ||
      m.stage === 'Attended' ||
      m.stage === 'RC Selected' ||
      (m.stage || '').toLowerCase().includes('completed') ||
      m.rc_selected_status === 'Completed' ||
      m.first_win_status === 'Yes'
    );
    const rcFromAttended = attended.filter(m =>
      m.rc_selected_status === 'Completed' ||
      Boolean(m.rc_selected_date) ||
      Boolean(m.cubs.reading_circle_category) ||
      m.stage === 'RC Selected' ||
      (m.stage || '').toLowerCase().includes('completed') ||
      m.first_win_status === 'Yes'
    );
    const rateRC = attended.length > 0
      ? Math.round((rcFromAttended.length / attended.length) * 1000) / 10
      : 0;

    // 3. Status Alert cohorts (strictly aligned with getCubAlert to avoid mismatch)
    const toSuspend14d = orientationCubs.filter(m => getCubAlert(m)?.key === 'suspend_14d');
    const atRisk8to14 = orientationCubs.filter(m => getCubAlert(m)?.key === 'at_risk_8_14');
    const overdue1on1 = orientationCubs.filter(m => getCubAlert(m)?.key === 'overdue_1on1');
    const pendingRC = orientationCubs.filter(m => getCubAlert(m)?.key === 'pending_rc');
    const unbooked = orientationCubs.filter(m => getCubAlert(m)?.key === 'unbooked');
    const allActionNeeded = orientationCubs.filter(m => getCubAlert(m) !== null);

    // 4. Funnel volume totals
    const booked = orientationCubs.filter(m =>
      Boolean(m.session) ||
      m.booked_status === 'Completed' ||
      m.attended_status === 'Present' ||
      (m.stage || '').toLowerCase().includes('completed')
    );
    const rescheduled = orientationCubs.filter(m => m.attended_status === 'Rescheduled');
    const rcSelected = orientationCubs.filter(m =>
      m.rc_selected_status === 'Completed' ||
      Boolean(m.rc_selected_date) ||
      Boolean(m.cubs.reading_circle_category) ||
      m.stage === 'RC Selected' ||
      (m.stage || '').toLowerCase().includes('completed')
    );
    const firstWin = orientationCubs.filter(m =>
      m.first_win_status === 'Yes' ||
      (m.stage || '').toLowerCase().includes('completed') ||
      Boolean(m.completion_date) ||
      Boolean(m.cubs.orientation_completion_date)
    );

    return {
      total,
      evaluated7d,
      completed7d,
      rate7d,
      attended,
      rcFromAttended,
      rateRC,
      overdue1on1,
      atRisk8to14,
      toSuspend14d,
      booked,
      rescheduled,
      rcSelected,
      firstWin,
      unbooked,
      pendingRC,
      allActionNeeded,
    };
  }, [orientationCubs]);

    // Determine current active cubs list based on selected filter
  const { currentList, currentLabel } = useMemo(() => {
    switch (quickFilter) {
      case 'to_suspend':
        return { currentList: stats.toSuspend14d, currentLabel: 'To Suspend (>14d, 0 Pts)' };
      case 'at_risk':
        return { currentList: stats.atRisk8to14, currentLabel: 'At Risk (Day 8–14, 0 Pts)' };
      case '1on1_needed':
        return { currentList: stats.overdue1on1, currentLabel: '1-on-1 Needed (>7d)' };
      case 'unbooked':
        return { currentList: stats.unbooked, currentLabel: 'Not Yet Booked' };
      case 'pending_rc':
        return { currentList: stats.pendingRC, currentLabel: 'Pending RC Selection' };
      case 'all_cubs':
        return { currentList: orientationCubs, currentLabel: 'All Cubs' };
      case 'all_action':
      default:
        return { currentList: stats.allActionNeeded, currentLabel: 'All Action-Needed Cubs' };
    }
  }, [quickFilter, stats, orientationCubs]);

  // Apply search query
  const filteredCubs = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return currentList;
    return currentList.filter((m: OrientationMasterItem) =>
      `${m.cubs.cub_first_name || ''} ${m.cubs.cub_last_name || ''} ${m.cub_id}`.toLowerCase().includes(q) ||
      `${m.cubs.parent_first_name || ''} ${m.cubs.parent_last_name || ''} ${m.cubs.parent_phone ?? ''} ${m.cubs.parent_email ?? ''}`.toLowerCase().includes(q) ||
      (m.cubs.relationship_owner || '').toLowerCase().includes(q) ||
      (m.session || '').toLowerCase().includes(q) ||
      (m.stage || '').toLowerCase().includes(q)
    );
  }, [currentList, search]);

  const paginatedCubs = filteredCubs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Card styles
  const getCardStyle = (): React.CSSProperties => ({
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '1.1rem 1.25rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    position: 'relative',
    overflow: 'hidden',
  });

  return (
    <div>
      {/* ─── Cubs Date Filter Toolbar ──────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginBottom: '1.25rem',
      }}>
        {/* Date Range Dropdown */}
        <select
          value={preset}
          onChange={(e) => handlePresetSelect(e.target.value)}
          className={sharedStyles.filterSelect}
          style={{ minWidth: '150px', width: 'auto' }}
        >
          {PRESET_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>

        {/* Rep Dropdown */}
        {allReps.length > 0 && (
          <select
            value={selectedRep}
            onChange={(e) => { setSelectedRep(e.target.value); setPage(1); }}
            className={sharedStyles.filterSelect}
            style={{ minWidth: '140px', width: 'auto' }}
          >
            <option value="All Reps">All Reps</option>
            {allReps.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        )}

        {/* Custom Date Range Picker (shown when preset === 'custom') */}
        {preset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  padding: '0.35rem 0.5rem',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-1)',
                  fontSize: '0.8rem',
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  padding: '0.35rem 0.5rem',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-1)',
                  fontSize: '0.8rem',
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setPage(1)}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: 6,
                background: 'var(--primary)',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Apply
            </button>
          </div>
        )}

        {/* Date Active Range Display Badge */}
        {(startDate || endDate) && preset !== 'all' && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', background: 'var(--bg-2)', padding: '0.3rem 0.75rem', borderRadius: 6, border: '1px solid var(--border)' }}>
            Active Range: <strong style={{ color: 'var(--text-1)' }}>{startDate || 'Start'}</strong> to <strong style={{ color: 'var(--text-1)' }}>{endDate || 'End'}</strong>
          </div>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.25rem',
      }}>
        {/* 1. 7-Day Completion */}
        <div style={getCardStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              7-Day Completion
            </span>
            <span style={{ background: 'var(--green-dim)', color: 'var(--green)', borderRadius: 6, padding: '4px', display: 'flex' }}>
              <Target size={15} />
            </span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>
            {stats.rate7d}%
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginTop: '0.4rem' }}>
            <strong>{stats.completed7d.length}</strong> of {stats.evaluated7d.length} evaluated cubs
          </div>
        </div>

        {/* 2. RC Conversion */}
        <div style={getCardStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              RC Conversion
            </span>
            <span style={{ background: 'var(--primary-dim)', color: 'var(--primary)', borderRadius: 6, padding: '4px', display: 'flex' }}>
              <BookOpen size={15} />
            </span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>
            {stats.rateRC}%
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginTop: '0.4rem' }}>
            <strong>{stats.rcFromAttended.length}</strong> of {stats.attended.length} attended cubs
          </div>
        </div>

        {/* 3. 1-on-1 Needed */}
        <div style={getCardStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              1-on-1 Needed
            </span>
            <span style={{ background: 'var(--orange-dim)', color: 'var(--orange)', borderRadius: 6, padding: '4px', display: 'flex' }}>
              <Clock size={15} />
            </span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>
            {stats.overdue1on1.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginTop: '0.4rem' }}>
            &gt;7d incomplete orientation
          </div>
        </div>

        {/* 4. At Risk (0 Pts) */}
        <div style={getCardStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              At Risk (0 Pts)
            </span>
            <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', borderRadius: 6, padding: '4px', display: 'flex' }}>
              <AlertCircle size={15} />
            </span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>
            {stats.atRisk8to14.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginTop: '0.4rem' }}>
            Day 8–14, 0 points earned
          </div>
        </div>

        {/* 5. To Suspend */}
        <div style={getCardStyle()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              To Suspend
            </span>
            <span style={{ background: 'var(--red-dim)', color: 'var(--red)', borderRadius: 6, padding: '4px', display: 'flex' }}>
              <AlertTriangle size={15} />
            </span>
          </div>
          <div style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>
            {stats.toSuspend14d.length}
          </div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-2)', marginTop: '0.4rem' }}>
            &gt;14 days, 0 points earned
          </div>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1.5rem',
      }}>
        {[
          { key: 'total_cubs', label: 'Total Cubs', value: stats.total, icon: Users, color: 'var(--primary)', bg: 'var(--primary-dim)' },
          { key: 'booked', label: 'Booked', value: stats.booked.length, icon: CalendarCheck, color: 'var(--blue)', bg: 'var(--blue-dim)' },
          { key: 'attended', label: 'Attended', value: stats.attended.length, icon: CheckCircle2, color: 'var(--green)', bg: 'var(--green-dim)' },
          { key: 'rescheduled', label: 'Rescheduled', value: stats.rescheduled.length, icon: Clock, color: 'var(--orange)', bg: 'var(--orange-dim)' },
          { key: 'rc_selected', label: 'RC Selected', value: stats.rcSelected.length, icon: BookOpen, color: 'var(--primary)', bg: 'var(--primary-dim)' },
          { key: 'first_win', label: 'First Win Sent', value: stats.firstWin.length, icon: Sparkles, color: 'var(--green)', bg: 'var(--green-dim)' },
        ].map(({ key, label, value, icon: Icon, color, bg }) => (
          <div
            key={key}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '0.75rem 0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
            }}
          >
            <div style={{ background: bg, color, borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon size={15} />
            </div>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── INTERACTIVE ACTION QUEUE & CUBS DIRECTORY ────────── */}
      <div className={sharedStyles.tableWrap}>
        {/* Controls Bar */}
        <div className={sharedStyles.tableControls} style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div className={sharedStyles.tableControlsLeft} style={{ flexWrap: 'wrap', gap: '0.5rem', flex: 1 }}>
            {/* Search Box */}
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input
                className={sharedStyles.searchInput}
                style={{ paddingLeft: '2rem', width: '100%' }}
                placeholder="Search cubs, parents, phone, rep..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>

            {/* Status Alert Filter Dropdown */}
            <select
              className={sharedStyles.filterSelect}
              value={quickFilter}
              onChange={e => {
                setQuickFilter(e.target.value as any);
                setPage(1);
              }}
              style={{ minWidth: '200px', width: 'auto' }}
            >
              <option value="all_action">Action Needed ({stats.allActionNeeded.length})</option>
              <option value="to_suspend">To Suspend ({stats.toSuspend14d.length})</option>
              <option value="at_risk">At Risk ({stats.atRisk8to14.length})</option>
              <option value="1on1_needed">1-on-1 Needed ({stats.overdue1on1.length})</option>
              <option value="unbooked">Not Booked ({stats.unbooked.length})</option>
              <option value="pending_rc">Pending RC ({stats.pendingRC.length})</option>
              <option value="all_cubs">All Cubs ({orientationCubs.length})</option>
            </select>
          </div>

          {/* Right Action: CSV Export */}
          <div className={sharedStyles.tableControlsRight} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => downloadCubsCSV(filteredCubs, currentLabel)}
              style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                borderRadius: 6,
                border: 'none',
                background: 'var(--primary)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
              title="Download currently visible cubs as CSV"
            >
              <Download size={13} />
              <span>Download CSV</span>
            </button>
          </div>
        </div>

        {/* Filter Indicator Banner */}
        <div style={{
          background: 'var(--bg-input)',
          borderBottom: '1px solid var(--border)',
          padding: '0.5rem 1rem',
          fontSize: '0.78rem',
          color: 'var(--text-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            Showing: <strong>{currentLabel}</strong>
            {search && <span style={{ marginLeft: 6, color: 'var(--primary)' }}>(matching &ldquo;{search}&rdquo;)</span>}
          </div>
          <span className={sharedStyles.sectionCount}>
            {filteredCubs.length} {filteredCubs.length === 1 ? 'Cub' : 'Cubs'}
          </span>
        </div>

        {/* Cubs Table */}
        {paginatedCubs.length === 0 ? (
          <div className={sharedStyles.emptyState}>
            <div className={sharedStyles.emptyStateTitle}>No cubs found</div>
            <div className={sharedStyles.emptyStateSub}>No cubs match the current filter and date range.</div>
          </div>
        ) : (
          <div className={sharedStyles.tableScrollBody}>
            <table className={sharedStyles.table}>
              <thead>
                <tr>
                  <th>Cub</th>
                  <th>Parent</th>
                  <th style={{ textAlign: 'center' }}>Onboarded</th>
                  <th style={{ textAlign: 'center' }}>Status Alert</th>
                  <th style={{ textAlign: 'center' }}>Stage</th>
                  <th style={{ textAlign: 'center' }}>Points</th>
                  <th style={{ textAlign: 'center' }}>Rep</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {paginatedCubs.map(m => {
                  const alert = getCubAlert(m);
                  const days = getDaysSince(m.cubs.date_onboarded);
                  const pts = m.cubs.cumulative_points || 0;

                  return (
                    <tr
                      key={m.id}
                      onClick={() => onSelectRecord(m)}
                      style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                      title="Click row to open orientation journey drawer"
                    >
                      <td>
                        <div style={{ fontWeight: 600 }}>{m.cubs.cub_first_name} {m.cubs.cub_last_name}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-3)' }}>{m.cub_id}</div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600 }}>{m.cubs.parent_first_name} {m.cubs.parent_last_name}</div>
                        {m.cubs.parent_phone && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Phone size={10} /> {m.cubs.parent_phone}
                          </div>
                        )}
                      </td>

                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.82rem' }}>
                          {m.cubs.date_onboarded ? formatDate(m.cubs.date_onboarded) : '—'}
                        </div>
                        <div style={{ marginTop: '2px' }}>
                          <DaysElapsedBadge dateStr={m.cubs.date_onboarded} />
                        </div>
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        {alert ? (
                          <span className={`${sharedStyles.badge} ${alert.badgeClass}`}>
                            <alert.icon size={11} style={{ marginRight: 3 }} /> {alert.label}
                          </span>
                        ) : (
                          <span className={`${sharedStyles.badge} ${sharedStyles.badgeGray}`}>Normal</span>
                        )}
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <StageBadge stage={m.stage} stageStatus={m.stage_status} />
                      </td>

                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontWeight: 700,
                          fontSize: '0.85rem',
                          color: pts === 0 && days && days > 7 ? 'var(--red)' : 'var(--text-1)'
                        }}>
                          {pts} pts
                        </span>
                      </td>

                      <td style={{ textAlign: 'center', fontSize: '0.82rem' }}>
                        {m.cubs.relationship_owner || '—'}
                      </td>

                      <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>
                        <ChevronRight size={15} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} total={filteredCubs.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}

// ─── Main Component Props ───────────────────────────────────────
type TabType = 'stats' | 'master' | 'newCubs' | 'pending' | 'upcoming';

interface Props {
  initialMaster: OrientationMasterItem[];
  initialPending: PendingSignup[];
  initialScorecardMetrics: OrientationScorecardMetrics;
  initialPendingRC?: any[];
  profile: Profile;
  isAdmin?: boolean;
  allReps?: string[];
  currentRep?: string;
}

export default function OrientationClient({
  initialMaster,
  initialPending,
  initialScorecardMetrics,
  isAdmin,
  allReps = [],
  currentRep = 'All Reps',
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const [tab, setTabState] = useState<TabType>(() => {
    if (rawTab === 'master') return 'master';
    if (rawTab === 'newCubs') return 'newCubs';
    if (rawTab === 'pending') return 'pending';
    if (rawTab === 'upcoming') return 'upcoming';
    return 'stats';
  });

  useEffect(() => {
    if (rawTab && ['master', 'newCubs', 'pending', 'upcoming', 'stats'].includes(rawTab)) {
      setTabState(rawTab as TabType);
    }
  }, [rawTab]);

  const setTab = useCallback((t: TabType) => {
    setTabState(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  const [pending, setPending] = useState(initialPending);
  const [master, setMaster] = useState(initialMaster);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setPending(initialPending);
  }, [initialPending]);

  useEffect(() => {
    setMaster(initialMaster);
  }, [initialMaster]);

  // Drawers state
  const [drawerRecord, setDrawerRecord] = useState<OrientationMasterItem | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingSignup | null>(null);

  // Dynamic available reps extracted from dataset
  const dynamicReps = useMemo(() => {
    const set = new Set<string>();
    master.forEach(m => {
      if (m.cubs.relationship_owner) set.add(m.cubs.relationship_owner);
    });
    allReps.forEach(r => set.add(r));
    return Array.from(set).sort();
  }, [master, allReps]);

  // Standardized orientation stages
  const availableStages = useMemo(() => {
    return Array.from(STANDARDIZED_ORIENTATION_STAGES);
  }, []);

  // ─── TAB 1: Booking Confirmation State ─────────────────────────
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingPage, setPendingPage] = useState(1);

  const filteredPending = useMemo(() => {
    const q = pendingSearch.toLowerCase().trim();
    return pending.filter(p =>
      !q ||
      p.cub_name.toLowerCase().includes(q) ||
      p.parent_name.toLowerCase().includes(q) ||
      (p.parent_phone || '').includes(q) ||
      (p.selected_session || '').toLowerCase().includes(q) ||
      (p.matched_cub_id || '').toLowerCase().includes(q)
    );
  }, [pending, pendingSearch]);

  const { sortedData: sortedPending, handleSort: handlePendingSort, getSortIndicator: getPendingSortIndicator } = useTableSort(filteredPending, {
    sortableKeys: ['created_at', 'cub_name', 'parent_name', 'selected_session', 'match_confidence'],
    getSortValue: (item, key) => item[key as keyof typeof item],
  });

  const paginatedPending = sortedPending.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE);

  // ─── TAB 2: New Cubs Pipeline State ─────────────────────────────
  // Active cubs from Gen. Comm who have NOT yet been booked for orientation.
  // A cub leaves this tab as soon as their booking is confirmed.
  const newCubsList = useMemo(() => {
    return master
      .filter(m => {
        // Active cubs only
        const s = (m.cubs.sub_status || '').toLowerCase().trim();
        const isActive = s === 'active' || s === 'almost expiring';
        if (!isActive) return false;

        // Has not completed orientation journey
        const isCompleted = (m.stage || '').toLowerCase().includes('completed') || Boolean(m.completion_date);
        if (isCompleted) return false;

        // Leave New Cubs the moment their booking is confirmed:
        // — booked_status is 'Completed', OR
        // — they have a session AND stage has moved past 'Invited'
        const isBooked =
          m.booked_status === 'Completed' ||
          (Boolean(m.session) && m.stage !== 'Invited' && Boolean(m.stage));
        return !isBooked;
      })
      .sort((a, b) => {
        const da = a.cubs.date_onboarded ? new Date(a.cubs.date_onboarded).getTime() : 0;
        const db = b.cubs.date_onboarded ? new Date(b.cubs.date_onboarded).getTime() : 0;
        return db - da;
      });
  }, [master]);

  const [newCubsSearch, setNewCubsSearch] = useState('');
  const [newCubsPage, setNewCubsPage] = useState(1);

  const [newCubsFilters, setNewCubsFilters] = useState<OrientationFilterState>(() => {
    const init = emptyOrientationFilterState();
    if (currentRep && currentRep !== 'All Reps') {
      init.reps = new Set([currentRep]);
    }
    return init;
  });

  const newCubsFiltersActive = useMemo(() => countOrientationFilters(newCubsFilters), [newCubsFilters]);

  const resetNewCubsFilters = () => {
    setNewCubsFilters(emptyOrientationFilterState());
    setNewCubsPage(1);
  };

  const filteredNewCubs = useMemo(() => {
    const afterDrawer = applyOrientationFilters(newCubsList, newCubsFilters, getCubAlert);
    const q = newCubsSearch.toLowerCase().trim();
    if (!q) return afterDrawer;
    return afterDrawer.filter(m =>
      `${m.cubs.cub_first_name} ${m.cubs.cub_last_name} ${m.cub_id}`.toLowerCase().includes(q) ||
      `${m.cubs.parent_first_name} ${m.cubs.parent_last_name} ${m.cubs.parent_phone ?? ''}`.toLowerCase().includes(q) ||
      (m.cubs.relationship_owner || '').toLowerCase().includes(q)
    );
  }, [newCubsList, newCubsSearch, newCubsFilters]);

  const { sortedData: sortedNewCubs, handleSort: handleNewCubsSort, getSortIndicator: getNewCubsSortIndicator } = useTableSort(filteredNewCubs, {
    sortableKeys: ['cubs.cub_first_name', 'cubs.parent_first_name', 'cubs.date_onboarded', 'cubs.relationship_owner', 'stage', 'next_stage'],
    getSortValue: (item, key) => {
      if (key === 'cubs.cub_first_name') return item.cubs.cub_first_name;
      if (key === 'cubs.parent_first_name') return item.cubs.parent_first_name;
      if (key === 'cubs.date_onboarded') return item.cubs.date_onboarded;
      if (key === 'cubs.relationship_owner') return item.cubs.relationship_owner;
      return item[key as keyof typeof item];
    },
  });

  const paginatedNewCubs = sortedNewCubs.slice((newCubsPage - 1) * PAGE_SIZE, newCubsPage * PAGE_SIZE);

  // ─── TAB 3: Upcoming Sessions State ─────────────────────────────
  // Active cubs booked for a session who have NOT completed orientation yet.
  // Immediately they complete orientation, they leave this tab.
  const upcomingList = useMemo(() => {
    return master.filter(m => {
      // Must have booked session
      if (!m.session) return false;

      // Active cubs only
      const s = (m.cubs.sub_status || '').toLowerCase().trim();
      const isActive = s === 'active' || s === 'almost expiring';
      if (!isActive) return false;

      // Immediately they complete their orientation, they leave this tab
      const isCompleted = (m.stage || '').toLowerCase().includes('completed') || Boolean(m.completion_date);
      return !isCompleted;
    });
  }, [master]);

  // Dynamic session days from settings / records
  const upcomingSessionDays = useMemo(() => {
    const set = new Set<string>(['Tuesday', 'Sunday']);
    upcomingList.forEach(m => {
      if (m.session) set.add(m.session);
    });
    return Array.from(set).sort();
  }, [upcomingList]);

  const [upcomingSearch, setUpcomingSearch] = useState('');
  const [upcomingPrimaryFilter, setUpcomingPrimaryFilter] = useState('');
  const [upcomingSecondaryFilter, setUpcomingSecondaryFilter] = useState('');
  const [upcomingPage, setUpcomingPage] = useState(1);

  const handleUpcomingPrimaryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUpcomingPrimaryFilter(e.target.value);
    setUpcomingSecondaryFilter('');
    setUpcomingPage(1);
  };

  const handleUpcomingSecondaryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setUpcomingSecondaryFilter(e.target.value);
    setUpcomingPage(1);
  };

  const filteredUpcoming = useMemo(() => {
    const q = upcomingSearch.toLowerCase().trim();
    return upcomingList.filter(m => {
      if (upcomingPrimaryFilter === 'session' && upcomingSecondaryFilter) {
        if (m.session !== upcomingSecondaryFilter) return false;
      }
      if (upcomingPrimaryFilter === 'rep' && upcomingSecondaryFilter) {
        if (m.cubs.relationship_owner !== upcomingSecondaryFilter) return false;
      }

      if (!q) return true;
      return (
        `${m.cubs.cub_first_name} ${m.cubs.cub_last_name} ${m.cub_id}`.toLowerCase().includes(q) ||
        `${m.cubs.parent_first_name} ${m.cubs.parent_last_name} ${m.cubs.parent_phone ?? ''}`.toLowerCase().includes(q) ||
        (m.session || '').toLowerCase().includes(q) ||
        (m.cubs.relationship_owner || '').toLowerCase().includes(q)
      );
    });
  }, [upcomingList, upcomingSearch, upcomingPrimaryFilter, upcomingSecondaryFilter]);

  const paginatedUpcoming = filteredUpcoming.slice((upcomingPage - 1) * PAGE_SIZE, upcomingPage * PAGE_SIZE);

  // ─── TAB 4: Master Journey State (ACTIVE SUBSCRIBERS ONLY) ──────
  const activeMaster = useMemo(() => {
    return master.filter(m => {
      const s = (m.cubs.sub_status || '').toLowerCase().trim();
      return s === 'active' || s === 'almost expiring';
    });
  }, [master]);

  const [masterSearch, setMasterSearch] = useState('');
  const [masterPage, setMasterPage] = useState(1);

  const [masterFilters, setMasterFilters] = useState<OrientationFilterState>(() => {
    const init = emptyOrientationFilterState();
    if (currentRep && currentRep !== 'All Reps') {
      init.reps = new Set([currentRep]);
    }
    return init;
  });

  const masterFiltersActive = useMemo(() => countOrientationFilters(masterFilters), [masterFilters]);

  const resetMasterFilters = () => {
    setMasterFilters(emptyOrientationFilterState());
    setMasterPage(1);
  };

  // Master Journey smart counts for stats
  const masterStats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let firstWins = 0;
    let atRisk14d = 0;

    activeMaster.forEach(m => {
      const isDone = (m.stage || '').toLowerCase().includes('completed') || Boolean(m.completion_date);
      if (isDone) completed++;
      else inProgress++;

      if (m.first_win_status === 'Yes') firstWins++;

      const days = getDaysSince(m.cubs.date_onboarded);
      if (days !== null && days > 14 && m.attended_status !== 'Present' && (m.cubs.cumulative_points || 0) === 0) {
        atRisk14d++;
      }
    });

    return { completed, inProgress, firstWins, atRisk14d };
  }, [activeMaster]);

  const filteredMaster = useMemo(() => {
    const afterDrawer = applyOrientationFilters(activeMaster, masterFilters, getCubAlert);
    const q = masterSearch.toLowerCase().trim();
    if (!q) return afterDrawer;
    return afterDrawer.filter(m =>
      `${m.cubs.cub_first_name} ${m.cubs.cub_last_name} ${m.cub_id}`.toLowerCase().includes(q) ||
      `${m.cubs.parent_first_name} ${m.cubs.parent_last_name} ${m.cubs.parent_phone ?? ''} ${m.cubs.parent_email ?? ''}`.toLowerCase().includes(q) ||
      (m.session || '').toLowerCase().includes(q) ||
      (m.stage || '').toLowerCase().includes(q) ||
      (m.cubs.relationship_owner || '').toLowerCase().includes(q)
    );
  }, [activeMaster, masterSearch, masterFilters]);

  const paginatedMaster = filteredMaster.slice((masterPage - 1) * PAGE_SIZE, masterPage * PAGE_SIZE);

  // ─── Handlers ──────────────────────────────────────────────────
  const handlePendingProcessed = (id: number, status: 'Confirmed' | 'Rejected') => {
    setPending(prev => prev.filter(p => p.id !== id));
    router.refresh();
    if (status === 'Confirmed') {
      startTransition(async () => {
        try {
          const freshMaster = await getOrientationMaster();
          if (freshMaster) setMaster(freshMaster as any);
        } catch {}
      });
    }
  };

  const handleJourneyUpdated = (updates: Partial<Orientation> & { rcCategory?: string; version_ts?: string }) => {
    if (!drawerRecord) return;
    // Optimistic update — immediately reflects in all derived tabs (newCubs, upcoming, master)
    setMaster(prev => prev.map(m => {
      if (m.cub_id !== drawerRecord.cub_id) return m;
      const updatedItem = { ...m, ...updates };
      if (updates.rcCategory) {
        updatedItem.cubs = { ...updatedItem.cubs, reading_circle_category: updates.rcCategory };
      }
      return updatedItem;
    }));
    setDrawerRecord(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...updates };
      if (updates.rcCategory) {
        updated.cubs = { ...updated.cubs, reading_circle_category: updates.rcCategory };
      }
      return updated;
    });
    // Background refresh to sync server state across all tabs
    router.refresh();
  };

  return (
    <div>
      {/* Drawer: Process Pending Signup */}
      {selectedPending && (
        <ProcessPendingDrawer
          pending={selectedPending}
          type="orientation"
          availableSessions={['Tuesday', 'Sunday']}
          onClose={() => setSelectedPending(null)}
          onSuccess={handlePendingProcessed}
        />
      )}

      {/* Drawer: Master Journey Details */}
      {drawerRecord && (
        <OrientationJourneyDrawer
          record={drawerRecord as any}
          availableSessions={['Tuesday', 'Sunday']}
          onClose={() => setDrawerRecord(null)}
          onUpdated={handleJourneyUpdated}
        />
      )}

      {/* Navigation Tabs */}
      <div className={tabStyles.tabs}>
        <button
          className={`${tabStyles.tabBtn} ${tab === 'stats' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('stats')}
        >
          <BarChart3 size={13} style={{ marginRight: 4 }} /> Stats
        </button>

        <button
          className={`${tabStyles.tabBtn} ${tab === 'master' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('master')}
        >
          <Compass size={13} style={{ marginRight: 4 }} /> Master Journey <span className={tabStyles.tabBadge}>{activeMaster.length}</span>
        </button>

        <button
          className={`${tabStyles.tabBtn} ${tab === 'newCubs' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('newCubs')}
        >
          <Baby size={13} style={{ marginRight: 4 }} /> New Cubs {newCubsList.length > 0 && (
            <span className={tabStyles.tabBadge} style={{ background: 'var(--orange)', color: '#fff' }}>
              {newCubsList.length}
            </span>
          )}
        </button>

        <button
          className={`${tabStyles.tabBtn} ${tab === 'pending' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('pending')}
        >
          <CalendarCheck size={13} style={{ marginRight: 4 }} /> Booking Confirmation {pending.length > 0 && <span className={tabStyles.tabBadge}>{pending.length}</span>}
        </button>

        <button
          className={`${tabStyles.tabBtn} ${tab === 'upcoming' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('upcoming')}
        >
          <Calendar size={13} style={{ marginRight: 4 }} /> Upcoming Sessions {upcomingList.length > 0 && <span className={tabStyles.tabBadge}>{upcomingList.length}</span>}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: STATS & ACTION QUEUE DASHBOARD
      ───────────────────────────────────────────────────────────── */}
      {tab === 'stats' && (
        <OrientationStatsDashboard
          master={master}
          isAdmin={isAdmin}
          allReps={dynamicReps}
          currentRep={currentRep}
          onSelectRecord={setDrawerRecord}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: MASTER JOURNEY (ACTIVE SUBSCRIBERS ONLY)
          Dynamic cascading filters like Cubs Directory: All -> Rep / Session / Stage / Status Alert
      ───────────────────────────────────────────────────────────── */}
      {tab === 'master' && (
        <>
          <div className={sharedStyles.tableWrap}>
            {/* Orientation Drawer Filter Controls */}
            <div className={sharedStyles.tableControls}>
              <div className={sharedStyles.tableControlsLeft} style={{ flexWrap: 'wrap', gap: '8px' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input
                    className={sharedStyles.searchInput}
                    style={{ paddingLeft: '2rem' }}
                    placeholder="Search cubs, parents, phone..."
                    value={masterSearch}
                    onChange={e => { setMasterSearch(e.target.value); setMasterPage(1); }}
                  />
                </div>

                <OrientationFilterDrawer
                  allReps={dynamicReps}
                  value={masterFilters}
                  onChange={(next) => { setMasterFilters(next); setMasterPage(1); }}
                  onReset={resetMasterFilters}
                  totalActive={masterFiltersActive}
                />
              </div>

              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredMaster.length} of {activeMaster.length}</span>
              </div>
            </div>

            {paginatedMaster.length === 0 ? (
              <div className={sharedStyles.emptyState}>
                <div className={sharedStyles.emptyStateTitle}>
                  {masterSearch || masterFiltersActive > 0
                    ? 'No matches found'
                    : 'No active subscribers in journey'}
                </div>
                <div className={sharedStyles.emptyStateSub}>Try adjusting search or filters</div>
              </div>
            ) : (
              <div className={sharedStyles.tableScrollBody}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th>Cub</th>
                      <th>Parent</th>
                      <th style={{ textAlign: 'center' }}>Onboarded</th>
                      <th style={{ textAlign: 'center' }}>SLA Window</th>
                      <th style={{ textAlign: 'center' }}>Status Alert</th>
                      <th style={{ textAlign: 'center' }}>Session</th>
                      <th style={{ textAlign: 'center' }}>Stage</th>
                      <th style={{ textAlign: 'center' }}>Next Stage</th>
                      <th style={{ textAlign: 'center' }}>Rep</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedMaster.map(m => (
                      <tr
                        key={m.id}
                        onClick={() => setDrawerRecord(m)}
                        style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                        title="Click row to open orientation journey drawer"
                      >
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.cubs.cub_first_name} {m.cubs.cub_last_name}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>{m.cub_id}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.cubs.parent_first_name} {m.cubs.parent_last_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{m.cubs.parent_phone || '—'}</div>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {m.cubs.date_onboarded ? formatDate(m.cubs.date_onboarded) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <DaysElapsedBadge dateStr={m.cubs.date_onboarded} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {(() => {
                            const alert = getCubAlert(m);
                            if (alert) {
                              const AlertIcon = alert.icon;
                              return (
                                <span className={`${sharedStyles.badge} ${alert.badgeClass}`}>
                                  <AlertIcon size={11} style={{ marginRight: 3 }} /> {alert.label}
                                </span>
                              );
                            }
                            return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGray}`}>Normal</span>;
                          })()}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.82rem' }}>
                          {m.session ? (
                            <span style={{ fontWeight: 600, color: m.session === 'Tuesday' ? 'var(--blue)' : 'var(--orange)' }}>
                              {m.session}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-3)' }}>— Not Booked</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}><StageBadge stage={m.stage} stageStatus={m.stage_status} /></td>
                        <td style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-3)' }}>{m.next_stage || '—'}</td>
                        <td style={{ textAlign: 'center', fontSize: '0.82rem' }}>{m.cubs.relationship_owner}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>
                          <ChevronRight size={15} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={masterPage} total={filteredMaster.length} pageSize={PAGE_SIZE} onChange={setMasterPage} />
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: NEW CUBS PIPELINE (ACTIVE CUBS ONLY)
          Dynamic cascading filters like Cubs Directory: All -> Rep / SLA Status
      ───────────────────────────────────────────────────────────── */}
      {tab === 'newCubs' && (
        <>
          <div className={sharedStyles.tableWrap}>
            {/* Orientation Drawer Filter Controls */}
            <div className={sharedStyles.tableControls}>
              <div className={sharedStyles.tableControlsLeft} style={{ flexWrap: 'wrap', gap: '8px' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input
                    className={sharedStyles.searchInput}
                    style={{ paddingLeft: '2rem' }}
                    placeholder="Search new cubs, parents, phone..."
                    value={newCubsSearch}
                    onChange={e => { setNewCubsSearch(e.target.value); setNewCubsPage(1); }}
                  />
                </div>

                <OrientationFilterDrawer
                  allReps={dynamicReps}
                  value={newCubsFilters}
                  onChange={(next) => { setNewCubsFilters(next); setNewCubsPage(1); }}
                  onReset={resetNewCubsFilters}
                  totalActive={newCubsFiltersActive}
                />
              </div>

              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredNewCubs.length} of {newCubsList.length}</span>
              </div>
            </div>

            {paginatedNewCubs.length === 0 ? (
              <div className={sharedStyles.emptyState}>
                <div className={sharedStyles.emptyStateTitle}>
                  {newCubsSearch || newCubsFiltersActive > 0 ? 'No matches found' : 'All Active Cubs Booked!'}
                </div>
                <div className={sharedStyles.emptyStateSub}>
                  {newCubsSearch || newCubsFiltersActive > 0
                    ? 'Try adjusting your search or filters'
                    : 'No active Gen. Comm cubs are waiting to be booked for orientation.'}
                </div>
              </div>
            ) : (
              <div className={sharedStyles.tableScrollBody}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleNewCubsSort('cubs.cub_first_name')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          Cub
                          {getNewCubsSortIndicator('cubs.cub_first_name') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleNewCubsSort('cubs.parent_first_name')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          Parent
                          {getNewCubsSortIndicator('cubs.parent_first_name') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleNewCubsSort('cubs.date_onboarded')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          Onboarded
                          {getNewCubsSortIndicator('cubs.date_onboarded') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ textAlign: 'center' }}>SLA Window</th>
                      <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleNewCubsSort('stage')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          Current Stage
                          {getNewCubsSortIndicator('stage') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleNewCubsSort('next_stage')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          Next Stage
                          {getNewCubsSortIndicator('next_stage') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'center' }} onClick={() => handleNewCubsSort('cubs.relationship_owner')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                          Rep
                          {getNewCubsSortIndicator('cubs.relationship_owner') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ width: 36, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedNewCubs.map(m => (
                      <tr
                        key={m.id}
                        onClick={() => setDrawerRecord(m)}
                        style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                        title="Click to open journey drawer and book orientation session"
                      >
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.cubs.cub_first_name} {m.cubs.cub_last_name}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>{m.cub_id}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.cubs.parent_first_name} {m.cubs.parent_last_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{m.cubs.parent_phone || '—'}</div>
                        </td>
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {m.cubs.date_onboarded ? formatDate(m.cubs.date_onboarded) : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <DaysElapsedBadge dateStr={m.cubs.date_onboarded} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <StageBadge stage={m.stage || 'Invited'} stageStatus="Completed" />
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600 }}>
                          {m.next_stage || 'Booked'}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.82rem' }}>{m.cubs.relationship_owner}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>
                          <ChevronRight size={15} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={newCubsPage} total={filteredNewCubs.length} pageSize={PAGE_SIZE} onChange={setNewCubsPage} />
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: BOOKING CONFIRMATION
          Action buttons removed, entire row clickable to open drawer
      ───────────────────────────────────────────────────────────── */}
      {tab === 'pending' && (
        <>
          <div className={sharedStyles.tableWrap}>
            <div className={sharedStyles.tableControls}>
              <div className={sharedStyles.tableControlsLeft}>
                <div style={{ position: 'relative', flex: 0 }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input
                    className={sharedStyles.searchInput}
                    style={{ paddingLeft: '2rem' }}
                    placeholder="Search bookings by cub, parent, phone..."
                    value={pendingSearch}
                    onChange={e => { setPendingSearch(e.target.value); setPendingPage(1); }}
                  />
                </div>
              </div>
              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredPending.length} of {pending.length}</span>
              </div>
            </div>

            {paginatedPending.length === 0 ? (
              <div className={sharedStyles.emptyState}>
                <div className={sharedStyles.emptyStateTitle}>{pendingSearch ? 'No matches found' : 'No pending bookings'}</div>
                <div className={sharedStyles.emptyStateSub}>{pendingSearch ? 'Try a different search term' : 'Incoming Google Form orientation submissions will appear here'}</div>
              </div>
            ) : (
              <div className={sharedStyles.tableScrollBody}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handlePendingSort('created_at')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          Submitted
                          {getPendingSortIndicator('created_at') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handlePendingSort('cub_name')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          Cub
                          {getPendingSortIndicator('cub_name') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handlePendingSort('parent_name')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          Parent
                          {getPendingSortIndicator('parent_name') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handlePendingSort('selected_session')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          Preferred Day
                          {getPendingSortIndicator('selected_session') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handlePendingSort('match_confidence')}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          Match Confidence
                          {getPendingSortIndicator('match_confidence') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                        </div>
                      </th>
                      <th style={{ width: 36, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPending.map(p => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedPending(p)}
                        style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                        title="Click row to review and confirm booking"
                      >
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{formatDateTime(p.created_at)}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.cub_name}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                            {p.matched_cub_id ? (
                              `Matched: ${p.matched_cub_id}`
                            ) : p.library_card ? (
                              `ID: ${p.library_card}`
                            ) : (
                              <span style={{ color: 'var(--orange, #eab308)', fontWeight: 500 }}>Unlinked</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>
                            {p.parent_name && p.parent_name !== p.parent_phone && !/^[\d\s+\-()]{6,}$/.test(p.parent_name)
                              ? p.parent_name
                              : '—'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{p.parent_phone || '—'}</div>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{p.selected_session || '—'}</td>
                        <td><ConfidenceBadge confidence={p.match_confidence} /></td>
                        <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>
                          <ChevronRight size={15} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={pendingPage} total={filteredPending.length} pageSize={PAGE_SIZE} onChange={setPendingPage} />
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 5: UPCOMING SESSIONS
          Only cubs with booked sessions who have NOT completed orientation yet.
          Immediately they complete orientation, they leave this tab.
          Dynamic cascading filters: All -> Session Day / Rep
      ───────────────────────────────────────────────────────────── */}
      {tab === 'upcoming' && (
        <>
          <div className={sharedStyles.tableWrap}>
            {/* Dynamic Cascading Filter Controls */}
            <div className={sharedStyles.tableControls}>
              <div className={sharedStyles.tableControlsLeft} style={{ flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{ position: 'relative', flex: 0 }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input
                    className={sharedStyles.searchInput}
                    style={{ paddingLeft: '2rem' }}
                    placeholder="Search booked cubs, parents, phone..."
                    value={upcomingSearch}
                    onChange={e => { setUpcomingSearch(e.target.value); setUpcomingPage(1); }}
                  />
                </div>

                {/* Primary Filter Select */}
                <select
                  className={sharedStyles.filterSelect}
                  value={upcomingPrimaryFilter}
                  onChange={handleUpcomingPrimaryChange}
                  style={{ width: '160px' }}
                >
                  <option value="">All</option>
                  <option value="session">Session Day</option>
                  <option value="rep">Rep</option>
                </select>

                {/* Secondary Cascading Filter Select */}
                {upcomingPrimaryFilter === 'session' && (
                  <select
                    className={sharedStyles.filterSelect}
                    value={upcomingSecondaryFilter}
                    onChange={handleUpcomingSecondaryChange}
                    style={{ width: '180px' }}
                  >
                    <option value="">All Session Days</option>
                    {upcomingSessionDays.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}

                {upcomingPrimaryFilter === 'rep' && (
                  <select
                    className={sharedStyles.filterSelect}
                    value={upcomingSecondaryFilter}
                    onChange={handleUpcomingSecondaryChange}
                    style={{ width: '180px' }}
                  >
                    <option value="">All Reps</option>
                    {dynamicReps.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredUpcoming.length} of {upcomingList.length}</span>
              </div>
            </div>

            {paginatedUpcoming.length === 0 ? (
              <div className={sharedStyles.emptyState}>
                <div className={sharedStyles.emptyStateTitle}>
                  {upcomingSearch || upcomingPrimaryFilter ? 'No matches' : 'No upcoming sessions pending'}
                </div>
                <div className={sharedStyles.emptyStateSub}>
                  {upcomingSearch || upcomingPrimaryFilter
                    ? 'No cubs match the selected session day or filter.'
                    : 'All cubs with completed orientation have moved forward.'}
                </div>
              </div>
            ) : (
              <div className={sharedStyles.tableScrollBody}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th>Cub</th>
                      <th>Parent</th>
                      <th>Session Day</th>
                      <th>Booked Date</th>
                      <th>Attendance Status</th>
                      <th>Stage</th>
                      <th>Rep</th>
                      <th style={{ width: 36, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedUpcoming.map(m => (
                      <tr
                        key={m.id}
                        onClick={() => setDrawerRecord(m)}
                        style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                        title="Click to open journey drawer and take attendance"
                      >
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.cubs.cub_first_name} {m.cubs.cub_last_name}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>{m.cub_id}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{m.cubs.parent_first_name} {m.cubs.parent_last_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{m.cubs.parent_phone || '—'}</div>
                        </td>
                        <td style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                          {m.session ? `${m.session} (${m.session === 'Tuesday' ? '7:00 pm' : '5:00 pm'})` : '—'}
                        </td>
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {m.booked_date ? formatDate(m.booked_date) : '—'}
                        </td>
                        <td>
                          <AttendanceBadge status={m.attended_status} />
                        </td>
                        <td>
                          <StageBadge stage={m.stage} stageStatus={m.stage_status} />
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{m.cubs.relationship_owner}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>
                          <ChevronRight size={15} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={upcomingPage} total={filteredUpcoming.length} pageSize={PAGE_SIZE} onChange={setUpcomingPage} />
          </div>
        </>
      )}
    </div>
  );
}
