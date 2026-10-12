'use client';

import { useState, useMemo, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Sparkles, AlertCircle, Users, BookOpen,
  Target, BarChart3, CalendarCheck, Calendar, Loader2,
  AlertTriangle
} from 'lucide-react';
import type { Orientation, PendingSignup, Cub, Profile } from '@/lib/types';
import {
  getOrientationScorecardMetrics,
  type OrientationScorecardMetrics,
} from '@/lib/actions/orientation';
import ProcessPendingDrawer from '@/components/drawers/ProcessPendingDrawer';
import OrientationJourneyDrawer from '@/components/drawers/OrientationJourneyDrawer';

import sharedStyles from '@/components/ui/dashboard.module.css';
import tabStyles from '../engagements/engagements.module.css';
import { formatDate, formatDateTime } from '@/lib/utils/date';
import { toast } from 'sonner';

const PAGE_SIZE = 20;

export type OrientationMasterItem = Orientation & {
  cubs: Pick<Cub, 'cub_first_name' | 'cub_last_name' | 'segment' | 'relationship_owner' | 'parent_first_name' | 'parent_last_name' | 'parent_phone' | 'parent_email'> & {
    sub_status?: string | null;
    date_onboarded?: string | null;
    cumulative_points?: number;
    last_reading_activity?: string | null;
    reading_circle_category?: string | null;
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

function StageBadge({ stage, stageStatus }: { stage: string | null; stageStatus: string | null }) {
  if (!stage) return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGray}`}>—</span>;
  const cls = stageStatus === 'Completed' ? sharedStyles.badgeGreen
    : stageStatus === 'In Progress' ? sharedStyles.badgeOrange
    : sharedStyles.badgeBlue;
  return <span className={`${sharedStyles.badge} ${cls}`}>{stage}</span>;
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
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const diffTime = now.getTime() - d.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
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

// ─── Scorecard Stats Panel with Interactive Cohort Date Filters ──
const PRESET_OPTIONS = [
  { id: 'all', label: 'All Time' },
  { id: 'last7', label: 'Last 7 Days' },
  { id: 'last14', label: 'Last 14 Days' },
  { id: 'last30', label: 'Last 30 Days' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'custom', label: 'Custom Range' },
] as const;

function computePresetDates(preset: string) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (preset === 'last7') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return { start: d.toISOString().slice(0, 10), end: todayStr };
  }
  if (preset === 'last14') {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return { start: d.toISOString().slice(0, 10), end: todayStr };
  }
  if (preset === 'last30') {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return { start: d.toISOString().slice(0, 10), end: todayStr };
  }
  if (preset === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    return { start, end: todayStr };
  }
  return { start: '', end: '' };
}

function ScorecardStatsPanel({
  initialMetrics,
  isAdmin,
  allReps = [],
  currentRep = 'All Reps',
}: {
  initialMetrics: OrientationScorecardMetrics;
  isAdmin?: boolean;
  allReps?: string[];
  currentRep?: string;
}) {
  const [metrics, setMetrics] = useState<OrientationScorecardMetrics>(initialMetrics);
  const [preset, setPreset] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRep, setSelectedRep] = useState(currentRep);
  const [isPending, startTransition] = useTransition();

  const fetchMetrics = useCallback((start: string, end: string, rep: string) => {
    startTransition(async () => {
      try {
        const res = await getOrientationScorecardMetrics(
          start || null,
          end || null,
          rep && rep !== 'All Reps' ? rep : null
        );
        setMetrics(res);
      } catch (err: any) {
        toast.error('Failed to update metrics: ' + (err?.message || 'Error'));
      }
    });
  }, []);

  const handlePresetSelect = (id: string) => {
    setPreset(id);
    if (id === 'custom') return;
    const { start, end } = computePresetDates(id);
    setStartDate(start);
    setEndDate(end);
    fetchMetrics(start, end, selectedRep);
  };

  const handleApplyCustom = () => {
    fetchMetrics(startDate, endDate, selectedRep);
  };

  const handleRepChange = (rep: string) => {
    setSelectedRep(rep);
    fetchMetrics(startDate, endDate, rep);
  };

  const completionRateColor = metrics.completion_rate >= 70 ? 'var(--green)' : metrics.completion_rate >= 40 ? 'var(--orange)' : 'var(--red, #ef4444)';

  return (
    <div>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Calendar size={15} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-1)' }}>
              Cohort Date Filter (Date Onboarded)
            </span>
            {isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary)' }} />}
          </div>

          {isAdmin && allReps.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Rep:</span>
              <select
                value={selectedRep}
                onChange={(e) => handleRepChange(e.target.value)}
                className={sharedStyles.filterSelect}
                style={{ width: 'auto' }}
              >
                <option value="All Reps">All Reps</option>
                {allReps.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {PRESET_OPTIONS.map((p) => {
            const isActive = preset === p.id;
            return (
              <button
                key={p.id}
                onClick={() => handlePresetSelect(p.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                  borderRadius: 20,
                  border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: isActive ? 'var(--primary-dim)' : 'var(--bg-2)',
                  color: isActive ? 'var(--primary)' : 'var(--text-2)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {preset === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
              onClick={handleApplyCustom}
              disabled={isPending}
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
              Apply Filter
            </button>
          </div>
        )}
      </div>

      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14,
        padding: '1.5rem', marginBottom: '1.25rem', textAlign: 'center',
        opacity: isPending ? 0.7 : 1, transition: 'opacity 0.2s',
      }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>
          7-Day Orientation Completion Rate
        </div>
        <div style={{ fontSize: '2.75rem', fontWeight: 800, color: completionRateColor, lineHeight: 1 }}>
          {metrics.completion_rate}%
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', marginTop: '0.5rem' }}>
          {metrics.completed_within_7d} of {metrics.window_elapsed} evaluated Cubs completed within 7 days
        </div>
        {metrics.in_window > 0 && (
          <div style={{ fontSize: '0.72rem', color: 'var(--blue)', marginTop: '0.25rem' }}>
            {metrics.in_window} Cubs currently in 7-day evaluation window (not yet evaluated)
          </div>
        )}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem',
        opacity: isPending ? 0.7 : 1, transition: 'opacity 0.2s',
      }}>
        {[
          { label: 'Total Gen. Comm', value: metrics.total_eligible, icon: Users, color: 'var(--primary)', bg: 'var(--primary-dim)' },
          { label: 'Awaiting Invite', value: metrics.awaiting_invitation, icon: Clock, color: 'var(--orange)', bg: 'var(--orange-dim)' },
          { label: 'Invited / Booking', value: metrics.invited_not_booked, icon: CalendarCheck, color: 'var(--blue)', bg: 'var(--blue-dim)' },
          { label: 'Booked', value: metrics.booked_confirmed, icon: CheckCircle2, color: 'var(--green)', bg: 'var(--green-dim)' },
          { label: 'Attended', value: metrics.attended, icon: Users, color: 'var(--primary)', bg: 'var(--primary-dim)' },
          { label: 'Completed Journey', value: metrics.completed, icon: Sparkles, color: 'var(--green)', bg: 'var(--green-dim)' },
          { label: 'On-Time (≤7d)', value: metrics.completed_within_7d, icon: Target, color: 'var(--green)', bg: 'var(--green-dim)' },
          { label: 'Late (>7d)', value: metrics.completed_late, icon: Clock, color: 'var(--orange)', bg: 'var(--orange-dim)' },
          { label: 'Missed Target', value: metrics.missed_target, icon: AlertCircle, color: 'var(--red, #ef4444)', bg: 'var(--red-dim, #fee2e2)' },
          { label: 'Pending RC', value: metrics.pending_rc, icon: BookOpen, color: 'var(--blue)', bg: 'var(--blue-dim)' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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

      {metrics.missing_onboarding_date > 0 && (
        <div style={{
          background: 'var(--orange-dim)', border: '1px solid var(--orange)',
          borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-2)',
        }}>
          <AlertCircle size={14} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          <strong>{metrics.missing_onboarding_date}</strong> Cubs are missing an onboarding date and are excluded from scorecard calculations.
        </div>
      )}
    </div>
  );
}

// ─── Main Component Props ───────────────────────────────────────
type TabType = 'pending' | 'newCubs' | 'upcoming' | 'master' | 'stats';

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
  const tab: TabType =
    rawTab === 'newCubs' ? 'newCubs'
    : rawTab === 'upcoming' ? 'upcoming'
    : rawTab === 'master' ? 'master'
    : rawTab === 'stats' ? 'stats'
    : 'pending';

  const setTab = useCallback((t: TabType) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`/orientation?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const [pending, setPending] = useState(initialPending);
  const [master, setMaster] = useState(initialMaster);

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

  // Dynamic stages
  const availableStages = useMemo(() => {
    const defaultStages = ['Invited', 'Booked', 'Attended', 'Reading Circle Selected', 'First Win Milestone', 'Completed'];
    const set = new Set<string>(defaultStages);
    master.forEach(m => {
      if (m.stage) set.add(m.stage);
    });
    return Array.from(set);
  }, [master]);

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

  const paginatedPending = filteredPending.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE);

  // ─── TAB 2: New Cubs Pipeline State ─────────────────────────────
  // Active cubs only from Gen. Comm awaiting orientation booking
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

        // Awaiting booking
        return !m.session || m.stage === 'Invited' || m.booked_status !== 'Completed';
      })
      .sort((a, b) => {
        const da = a.cubs.date_onboarded ? new Date(a.cubs.date_onboarded).getTime() : 0;
        const db = b.cubs.date_onboarded ? new Date(b.cubs.date_onboarded).getTime() : 0;
        return db - da;
      });
  }, [master]);

  const [newCubsSearch, setNewCubsSearch] = useState('');
  const [newCubsPrimaryFilter, setNewCubsPrimaryFilter] = useState('');
  const [newCubsSecondaryFilter, setNewCubsSecondaryFilter] = useState('');
  const [newCubsPage, setNewCubsPage] = useState(1);

  const handleNewCubsPrimaryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNewCubsPrimaryFilter(e.target.value);
    setNewCubsSecondaryFilter('');
    setNewCubsPage(1);
  };

  const handleNewCubsSecondaryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setNewCubsSecondaryFilter(e.target.value);
    setNewCubsPage(1);
  };

  const filteredNewCubs = useMemo(() => {
    const q = newCubsSearch.toLowerCase().trim();
    return newCubsList.filter(m => {
      // Dynamic cascading filters
      if (newCubsPrimaryFilter === 'rep' && newCubsSecondaryFilter) {
        if (m.cubs.relationship_owner !== newCubsSecondaryFilter) return false;
      }
      if (newCubsPrimaryFilter === 'sla' && newCubsSecondaryFilter) {
        const days = getDaysSince(m.cubs.date_onboarded);
        if (newCubsSecondaryFilter === 'fresh' && (days === null || days > 3)) return false;
        if (newCubsSecondaryFilter === 'approaching' && (days === null || days <= 3 || days > 7)) return false;
        if (newCubsSecondaryFilter === 'overdue' && (days === null || days <= 7)) return false;
      }

      if (!q) return true;
      return (
        `${m.cubs.cub_first_name} ${m.cubs.cub_last_name} ${m.cub_id}`.toLowerCase().includes(q) ||
        `${m.cubs.parent_first_name} ${m.cubs.parent_last_name} ${m.cubs.parent_phone ?? ''}`.toLowerCase().includes(q) ||
        (m.cubs.relationship_owner || '').toLowerCase().includes(q)
      );
    });
  }, [newCubsList, newCubsSearch, newCubsPrimaryFilter, newCubsSecondaryFilter]);

  const paginatedNewCubs = filteredNewCubs.slice((newCubsPage - 1) * PAGE_SIZE, newCubsPage * PAGE_SIZE);

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
  const [masterPrimaryFilter, setMasterPrimaryFilter] = useState(currentRep && currentRep !== 'All Reps' ? 'rep' : '');
  const [masterSecondaryFilter, setMasterSecondaryFilter] = useState(currentRep && currentRep !== 'All Reps' ? currentRep : '');
  const [masterPage, setMasterPage] = useState(1);

  const handleMasterPrimaryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMasterPrimaryFilter(e.target.value);
    setMasterSecondaryFilter('');
    setMasterPage(1);
  };

  const handleMasterSecondaryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMasterSecondaryFilter(e.target.value);
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
    const q = masterSearch.toLowerCase().trim();
    return activeMaster.filter(m => {
      // Dynamic cascading filters
      if (masterPrimaryFilter === 'rep' && masterSecondaryFilter) {
        if (m.cubs.relationship_owner !== masterSecondaryFilter) return false;
      }
      if (masterPrimaryFilter === 'session' && masterSecondaryFilter) {
        if (masterSecondaryFilter === 'Not Booked') {
          if (m.session) return false;
        } else if (m.session !== masterSecondaryFilter) {
          return false;
        }
      }
      if (masterPrimaryFilter === 'stage' && masterSecondaryFilter) {
        if (m.stage !== masterSecondaryFilter) return false;
      }
      if (masterPrimaryFilter === 'alert' && masterSecondaryFilter) {
        if (masterSecondaryFilter === 'overdue_7d') {
          const days = getDaysSince(m.cubs.date_onboarded);
          if (days === null || days <= 7 || m.completion_date || m.stage === 'Completed') return false;
        } else if (masterSecondaryFilter === 'at_risk_14d') {
          const days = getDaysSince(m.cubs.date_onboarded);
          if (days === null || days <= 14 || m.attended_status === 'Present' || (m.cubs.cumulative_points || 0) > 0) return false;
        } else if (masterSecondaryFilter === 'needs_rc') {
          if (m.attended_status !== 'Present' || m.rc_selected_status === 'Completed') return false;
        } else if (masterSecondaryFilter === 'unbooked') {
          if (m.session) return false;
        }
      }

      // Search Query
      if (!q) return true;
      return (
        `${m.cubs.cub_first_name} ${m.cubs.cub_last_name} ${m.cub_id}`.toLowerCase().includes(q) ||
        `${m.cubs.parent_first_name} ${m.cubs.parent_last_name} ${m.cubs.parent_phone ?? ''} ${m.cubs.parent_email ?? ''}`.toLowerCase().includes(q) ||
        (m.session || '').toLowerCase().includes(q) ||
        (m.stage || '').toLowerCase().includes(q) ||
        (m.cubs.relationship_owner || '').toLowerCase().includes(q)
      );
    });
  }, [activeMaster, masterSearch, masterPrimaryFilter, masterSecondaryFilter]);

  const paginatedMaster = filteredMaster.slice((masterPage - 1) * PAGE_SIZE, masterPage * PAGE_SIZE);

  // ─── Handlers ──────────────────────────────────────────────────
  const handlePendingProcessed = (id: number, status: 'Confirmed' | 'Rejected') => {
    setPending(prev => prev.filter(p => p.id !== id));
    if (status === 'Confirmed') {
      router.refresh();
    }
  };

  const handleJourneyUpdated = (updates: Partial<Orientation>) => {
    if (!drawerRecord) return;
    // Optimistic update — immediately reflects in all derived tabs (newCubs, upcoming, master)
    setMaster(prev => prev.map(m =>
      m.cub_id === drawerRecord.cub_id ? { ...m, ...updates } : m
    ));
    setDrawerRecord(prev => prev ? { ...prev, ...updates } : null);
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
          className={`${tabStyles.tabBtn} ${tab === 'pending' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('pending')}
        >
          Booking Confirmation {pending.length > 0 && <span className={tabStyles.tabBadge}>{pending.length}</span>}
        </button>

        <button
          className={`${tabStyles.tabBtn} ${tab === 'newCubs' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('newCubs')}
        >
          New Cubs Pipeline {newCubsList.length > 0 && (
            <span className={tabStyles.tabBadge} style={{ background: 'var(--orange)', color: '#fff' }}>
              {newCubsList.length}
            </span>
          )}
        </button>

        <button
          className={`${tabStyles.tabBtn} ${tab === 'upcoming' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Upcoming Sessions {upcomingList.length > 0 && <span className={tabStyles.tabBadge}>{upcomingList.length}</span>}
        </button>

        <button
          className={`${tabStyles.tabBtn} ${tab === 'master' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('master')}
        >
          Master Journey <span className={tabStyles.tabBadge}>{activeMaster.length}</span>
        </button>

        <button
          className={`${tabStyles.tabBtn} ${tab === 'stats' ? tabStyles.tabBtnActive : ''}`}
          onClick={() => setTab('stats')}
        >
          <BarChart3 size={13} style={{ marginRight: 4 }} /> Stats
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: BOOKING CONFIRMATION
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
                      <th>Submitted</th>
                      <th>Cub Name</th>
                      <th>Parent Name</th>
                      <th>Phone</th>
                      <th>Preferred Day</th>
                      <th>Match Confidence</th>
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
                          {p.matched_cub_id && (
                            <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>
                              Matched: {p.matched_cub_id}
                            </div>
                          )}
                        </td>
                        <td>{p.parent_name}</td>
                        <td style={{ fontSize: '0.82rem' }}>{p.parent_phone}</td>
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
          TAB 2: NEW CUBS PIPELINE (ACTIVE CUBS ONLY)
          Dynamic cascading filters like Cubs Directory: All -> Rep / SLA Status
      ───────────────────────────────────────────────────────────── */}
      {tab === 'newCubs' && (
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
                    placeholder="Search new cubs, parents, phone..."
                    value={newCubsSearch}
                    onChange={e => { setNewCubsSearch(e.target.value); setNewCubsPage(1); }}
                  />
                </div>

                {/* Primary Filter Select */}
                <select
                  className={sharedStyles.filterSelect}
                  value={newCubsPrimaryFilter}
                  onChange={handleNewCubsPrimaryChange}
                  style={{ width: '150px' }}
                >
                  <option value="">All</option>
                  <option value="rep">Rep</option>
                  <option value="sla">SLA Status</option>
                </select>

                {/* Secondary Cascading Filter Select */}
                {newCubsPrimaryFilter === 'rep' && (
                  <select
                    className={sharedStyles.filterSelect}
                    value={newCubsSecondaryFilter}
                    onChange={handleNewCubsSecondaryChange}
                    style={{ width: '180px' }}
                  >
                    <option value="">All Reps</option>
                    {dynamicReps.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}

                {newCubsPrimaryFilter === 'sla' && (
                  <select
                    className={sharedStyles.filterSelect}
                    value={newCubsSecondaryFilter}
                    onChange={handleNewCubsSecondaryChange}
                    style={{ width: '190px' }}
                  >
                    <option value="">All SLA Statuses</option>
                    <option value="fresh">Fresh (≤3 days)</option>
                    <option value="approaching">Approaching (4–7 days)</option>
                    <option value="overdue">Overdue (&gt;7 days)</option>
                  </select>
                )}
              </div>

              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredNewCubs.length} of {newCubsList.length}</span>
              </div>
            </div>

            {paginatedNewCubs.length === 0 ? (
              <div className={sharedStyles.emptyState}>
                <div className={sharedStyles.emptyStateTitle}>
                  {newCubsSearch || newCubsPrimaryFilter ? 'No matches' : 'All Active Cubs Booked!'}
                </div>
                <div className={sharedStyles.emptyStateSub}>
                  {newCubsSearch || newCubsPrimaryFilter
                    ? 'Try adjusting your search or dynamic filter'
                    : 'No active Gen. Comm cubs are waiting to be booked for orientation.'}
                </div>
              </div>
            ) : (
              <div className={sharedStyles.tableScrollBody}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th>Cub</th>
                      <th>Parent</th>
                      <th>Onboarded</th>
                      <th>SLA Window</th>
                      <th>Current Stage</th>
                      <th>Next Stage</th>
                      <th>Rep</th>
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
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {m.cubs.date_onboarded ? formatDate(m.cubs.date_onboarded) : '—'}
                        </td>
                        <td>
                          <DaysElapsedBadge dateStr={m.cubs.date_onboarded} />
                        </td>
                        <td>
                          <StageBadge stage={m.stage || 'Invited'} stageStatus="Completed" />
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600 }}>
                          {m.next_stage || 'Booked'}
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
            <Pagination page={newCubsPage} total={filteredNewCubs.length} pageSize={PAGE_SIZE} onChange={setNewCubsPage} />
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: UPCOMING SESSIONS
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

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: MASTER JOURNEY (ACTIVE SUBSCRIBERS ONLY)
          Dynamic cascading filters like Cubs Directory: All -> Rep / Session / Stage / Status Alert
      ───────────────────────────────────────────────────────────── */}
      {tab === 'master' && (
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
                    placeholder="Search cubs, parents, phone..."
                    value={masterSearch}
                    onChange={e => { setMasterSearch(e.target.value); setMasterPage(1); }}
                  />
                </div>

                {/* Primary Filter Select */}
                <select
                  className={sharedStyles.filterSelect}
                  value={masterPrimaryFilter}
                  onChange={handleMasterPrimaryChange}
                  style={{ width: '160px' }}
                >
                  <option value="">All</option>
                  <option value="rep">Rep</option>
                  <option value="session">Session Day</option>
                  <option value="stage">Stage</option>
                  <option value="alert">Status Alert</option>
                </select>

                {/* Secondary Cascading Filter Select */}
                {masterPrimaryFilter === 'rep' && (
                  <select
                    className={sharedStyles.filterSelect}
                    value={masterSecondaryFilter}
                    onChange={handleMasterSecondaryChange}
                    style={{ width: '180px' }}
                  >
                    <option value="">All Reps</option>
                    {dynamicReps.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}

                {masterPrimaryFilter === 'session' && (
                  <select
                    className={sharedStyles.filterSelect}
                    value={masterSecondaryFilter}
                    onChange={handleMasterSecondaryChange}
                    style={{ width: '180px' }}
                  >
                    <option value="">All Sessions</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Sunday">Sunday</option>
                    <option value="Not Booked">Not Booked</option>
                  </select>
                )}

                {masterPrimaryFilter === 'stage' && (
                  <select
                    className={sharedStyles.filterSelect}
                    value={masterSecondaryFilter}
                    onChange={handleMasterSecondaryChange}
                    style={{ width: '200px' }}
                  >
                    <option value="">All Stages</option>
                    {availableStages.map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                )}

                {masterPrimaryFilter === 'alert' && (
                  <select
                    className={sharedStyles.filterSelect}
                    value={masterSecondaryFilter}
                    onChange={handleMasterSecondaryChange}
                    style={{ width: '220px' }}
                  >
                    <option value="">All Status Alerts</option>
                    <option value="overdue_7d">Overdue (&gt;7d Incomplete)</option>
                    <option value="at_risk_14d">At Risk (&gt;14d, 0 Points)</option>
                    <option value="needs_rc">Attended, Needs RC</option>
                    <option value="unbooked">Not Yet Booked</option>
                  </select>
                )}
              </div>

              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredMaster.length} of {activeMaster.length}</span>
              </div>
            </div>

            {paginatedMaster.length === 0 ? (
              <div className={sharedStyles.emptyState}>
                <div className={sharedStyles.emptyStateTitle}>
                  {masterSearch || masterPrimaryFilter
                    ? 'No matches found'
                    : 'No active subscribers in journey'}
                </div>
                <div className={sharedStyles.emptyStateSub}>Try adjusting search or dynamic filter criteria</div>
              </div>
            ) : (
              <div className={sharedStyles.tableScrollBody}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th>Cub</th>
                      <th>Parent</th>
                      <th>Onboarded</th>
                      <th>Session</th>
                      <th>Stage</th>
                      <th>Next Stage</th>
                      <th>Sub Status</th>
                      <th>Rep</th>
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
                        <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                          {m.cubs.date_onboarded ? formatDate(m.cubs.date_onboarded) : '—'}
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          {m.session ? (
                            <span style={{ fontWeight: 600, color: m.session === 'Tuesday' ? 'var(--blue)' : 'var(--orange)' }}>
                              {m.session}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-3)' }}>— Not Booked</span>
                          )}
                        </td>
                        <td><StageBadge stage={m.stage} stageStatus={m.stage_status} /></td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-3)' }}>{m.next_stage || '—'}</td>
                        <td>
                          <span className={`${sharedStyles.badge} ${sharedStyles.badgeGreen}`}>Active</span>
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
            <Pagination page={masterPage} total={filteredMaster.length} pageSize={PAGE_SIZE} onChange={setMasterPage} />
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 5: STATS & SCORECARD
      ───────────────────────────────────────────────────────────── */}
      {tab === 'stats' && (
        <ScorecardStatsPanel
          initialMetrics={initialScorecardMetrics}
          isAdmin={isAdmin}
          allReps={allReps}
          currentRep={currentRep}
        />
      )}
    </div>
  );
}
