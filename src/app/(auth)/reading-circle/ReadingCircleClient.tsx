'use client';

import { useState, useMemo, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  BookOpen, Calendar, Save, RefreshCw, X, Link2, Clock, Sparkles, AlertCircle, Loader2, Users,
} from 'lucide-react';
import type { ReadingCircle, PendingSignup, Cub, Profile } from '@/lib/types';
import { processRCSignup, changeCubRCSession } from '@/lib/actions/reading-circle';
import ProcessPendingDrawer from '@/components/drawers/ProcessPendingDrawer';
import RCAttendanceDrawer from '@/components/drawers/RCAttendanceDrawer';
import RCChangeSessionDrawer from '@/components/drawers/RCChangeSessionDrawer';
import sharedStyles from '@/components/ui/dashboard.module.css';
import tabStyles from '../engagements/engagements.module.css';
import { formatDate, formatTime } from '@/lib/utils/date';
import { sortRCSessions, isBareDaySession } from '@/lib/utils/rc';
import { DEFAULT_RC_SESSION_OPTIONS } from '@/lib/constants/forms';
import { toast } from 'sonner';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

const PAGE_SIZE = 20;

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

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const cls = confidence === 'High' ? sharedStyles.badgeGreen
    : confidence === 'Medium' ? sharedStyles.badgeOrange
    : confidence === 'Low' ? sharedStyles.badgeRed
    : sharedStyles.badgeGray;
  return <span className={`${sharedStyles.badge} ${cls}`}>{confidence}</span>;
}

function ReadingCirclePendingStats({ pending }: { pending: PendingSignup[] }) {
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

function RosterStats({ roster }: { roster: any[] }) {
  const total = roster.length;
  const wordAstronauts = roster.filter(r => (r.rc_category || '').toLowerCase().includes('astronaut')).length;
  const wordMiners = roster.filter(r => (r.rc_category || '').toLowerCase().includes('miner')).length;
  const activeRecently = roster.filter(r => (r.weeks_active || 0) > 0).length;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
      {[
        { label: 'Total Enrolled', value: total, icon: Users, color: 'var(--primary)', bg: 'var(--primary-dim)' },
        { label: 'Word Astronauts', value: wordAstronauts, icon: BookOpen, color: 'var(--blue)', bg: 'var(--blue-dim)' },
        { label: 'Word Miners', value: wordMiners, icon: BookOpen, color: 'var(--orange)', bg: 'var(--orange-dim)' },
        { label: 'Active Readers', value: activeRecently, icon: Sparkles, color: 'var(--green)', bg: 'var(--green-dim)' },
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

const RC_SESSIONS = [
  'Saturday 8:00 am – 8:45 am',
  'Saturday 9:00 am – 9:45 am',
  'Saturday 10:00 am – 10:45 am',
  'Tuesday 5:00 pm – 5:45 pm',
  'Tuesday 6:00 pm – 6:45 pm',
  'Wednesday 5:00 pm – 5:45 pm',
  'Wednesday 6:00 pm – 6:45 pm',
  'Sunday 3:00 pm – 4:45 pm',
  'Sunday 4:00 pm – 4:45 pm',
];

interface PendingRCRecord {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_phone: string | null;
  parent_first_name: string | null;
  parent_last_name: string | null;
  date_onboarded: string | null;
  orientation_stage: string | null;
  orientation_completion_date: string | null;
  relationship_owner: string;
}

// ─── Main Props ─────────────────────────────────────────────────
interface Props {
  initialRoster: (ReadingCircle & {
    cubs: Pick<Cub, 'cub_first_name' | 'cub_last_name' | 'segment' | 'relationship_owner' | 'parent_first_name' | 'parent_last_name' | 'parent_phone' | 'parent_email'>
  })[];
  initialPending: PendingSignup[];
  initialPendingRC?: PendingRCRecord[];
  initialAvailableSessions?: string[];
  profile: Profile;
  isAdmin?: boolean;
  allReps?: string[];
  currentRep?: string;
}

export default function ReadingCircleClient({
  initialRoster,
  initialPending,
  initialPendingRC = [],
  initialAvailableSessions = [],
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: 'pending' | 'roster' | 'pendingRC' =
    rawTab === 'roster' ? 'roster'
    : rawTab === 'pendingRC' ? 'pendingRC'
    : 'pending';
  const setTab = useCallback((t: typeof tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`/reading-circle?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
  const [pending, setPending] = useState(initialPending);
  const [roster, setRoster] = useState(initialRoster);
  const [pendingRCList, setPendingRCList] = useState<PendingRCRecord[]>(initialPendingRC);
  const [selectedCubForRC, setSelectedCubForRC] = useState<PendingRCRecord | null>(null);
  const [pendingRCSearch, setPendingRCSearch] = useState('');
  const [pendingRCPage, setPendingRCPage] = useState(1);
  const [pendingSearch, setPendingSearch] = useState('');
  const [pendingPage, setPendingPage] = useState(1);
  const [rosterSearch, setRosterSearch] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [rosterPage, setRosterPage] = useState(1);
  const [isAttendanceDrawerOpen, setIsAttendanceDrawerOpen] = useState(false);
  const [attendanceSession, setAttendanceSession] = useState<string>('');
  const [isChangeSessionDrawerOpen, setIsChangeSessionDrawerOpen] = useState(false);
  const [selectedCubForChangeSession, setSelectedCubForChangeSession] = useState<(typeof initialRoster)[0] | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingSignup | null>(null);
  const [processSignupId, setProcessSignupId] = useState<number | null>(null);
  const [processSignupStatus, setProcessSignupStatus] = useState<'Confirmed' | 'Rejected' | null>(null);
  const [showProcessConfirm, setShowProcessConfirm] = useState(false);

  const [, startTransition] = useTransition();

  const filteredPending = useMemo(() => {
    const q = pendingSearch.toLowerCase();
    return pending.filter(p =>
      !q || p.cub_name.toLowerCase().includes(q) ||
      p.parent_name.toLowerCase().includes(q) ||
      (p.parent_phone || '').includes(q)
    );
  }, [pending, pendingSearch]);

  const filteredRoster = useMemo(() => {
    const q = rosterSearch.toLowerCase();
    return roster.filter(r =>
      (!q || `${r.cubs.cub_first_name} ${r.cubs.cub_last_name} ${r.cubs.parent_first_name} ${r.cubs.parent_last_name}`.toLowerCase().includes(q) ||
        (r.rc_category || '').toLowerCase().includes(q)) &&
      (!sessionFilter || r.selected_session === sessionFilter) &&
      (!categoryFilter || r.rc_category === categoryFilter)
    );
  }, [roster, rosterSearch, sessionFilter, categoryFilter]);

  const sessions = useMemo(() => {
    const base = initialAvailableSessions.length > 0
      ? initialAvailableSessions
      : DEFAULT_RC_SESSION_OPTIONS;

    const set = new Set<string>();
    base.forEach(s => { if (s && !isBareDaySession(s)) set.add(s.trim()); });
    roster.forEach(r => {
      const s = r.selected_session?.trim();
      if (s && !isBareDaySession(s)) set.add(s);
    });

    return sortRCSessions(Array.from(set));
  }, [initialAvailableSessions, roster]);

  const categories = useMemo(() => Array.from(new Set(roster.map(r => r.rc_category).filter(Boolean))).sort() as string[], [roster]);

  const paginatedPending = filteredPending.slice((pendingPage - 1) * PAGE_SIZE, pendingPage * PAGE_SIZE);
  const paginatedRoster = filteredRoster.slice((rosterPage - 1) * PAGE_SIZE, rosterPage * PAGE_SIZE);

  const handleProcessSignup = (id: number, status: 'Confirmed' | 'Rejected') => {
    setProcessSignupId(id);
    setProcessSignupStatus(status);
    setShowProcessConfirm(true);
  };

  const handleProcessConfirm = () => {
    if (processSignupId === null || processSignupStatus === null) return;
    const id = processSignupId;
    const status = processSignupStatus;
    setShowProcessConfirm(false);
    setProcessSignupId(null);
    setProcessSignupStatus(null);
    startTransition(async () => {
      const res = await processRCSignup({ id, status });
      if (res.success) {
        toast.success(`Signup ${status.toLowerCase()}`);
        setPending(prev => prev.filter(p => p.id !== id));
      } else {
        toast.error('Error: ' + res.error);
      }
    });
  };

  const handlePendingProcessed = (id: number, status: 'Confirmed' | 'Rejected', updatedFields?: any) => {
    setPending(prev => prev.filter(p => p.id !== id));
    if (status === 'Confirmed') {
      router.refresh();
    }
  };

  return (
    <div>
      {selectedPending && (
        <ProcessPendingDrawer
          pending={selectedPending}
          type="reading-circle"
          availableSessions={sessions}
          onClose={() => setSelectedPending(null)}
          onSuccess={handlePendingProcessed}
        />
      )}

      <RCAttendanceDrawer
        isOpen={isAttendanceDrawerOpen}
        initialSession={attendanceSession}
        roster={roster as any}
        availableSessions={sessions}
        onClose={() => setIsAttendanceDrawerOpen(false)}
        onSuccess={() => {
          router.refresh();
        }}
      />

      <RCChangeSessionDrawer
        isOpen={isChangeSessionDrawerOpen}
        selectedCub={selectedCubForChangeSession as any}
        roster={roster as any}
        availableSessions={sessions}
        onClose={() => {
          setIsChangeSessionDrawerOpen(false);
          setSelectedCubForChangeSession(null);
        }}
        onSuccess={(cubId, newSession, newCategory) => {
          setRoster(prev => prev.map(c => c.cub_id === cubId ? {
            ...c,
            selected_session: newSession,
            rc_category: newCategory || c.rc_category
          } : c));
          router.refresh();
        }}
      />

      <div className={tabStyles.tabs}>
        <button className={`${tabStyles.tabBtn} ${tab === 'pending' ? tabStyles.tabBtnActive : ''}`} onClick={() => setTab('pending')}>
          Booking Confirmation {pending.length > 0 && <span className={tabStyles.tabBadge}>{pending.length}</span>}
        </button>
        <button className={`${tabStyles.tabBtn} ${tab === 'roster' ? tabStyles.tabBtnActive : ''}`} onClick={() => setTab('roster')}>
          RC Roster <span className={tabStyles.tabBadge}>{roster.length}</span>
        </button>
        <button className={`${tabStyles.tabBtn} ${tab === 'pendingRC' ? tabStyles.tabBtnActive : ''}`} onClick={() => setTab('pendingRC')}>
          Pending RC Selection {pendingRCList.length > 0 && <span className={tabStyles.tabBadge}>{pendingRCList.length}</span>}
        </button>
      </div>

      {tab === 'pending' && (
        <>
          <ReadingCirclePendingStats pending={pending} />
          <div className={sharedStyles.tableWrap}>
          <div className={sharedStyles.tableControls}>
            <div className={sharedStyles.tableControlsLeft}>
              <div style={{ position: 'relative', flex: 0 }}>
                <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input className={sharedStyles.searchInput} style={{ paddingLeft: '2rem' }} placeholder="Search bookings..."
                  value={pendingSearch} onChange={e => { setPendingSearch(e.target.value); setPendingPage(1); }} />
              </div>
            </div>
            <div className={sharedStyles.tableControlsRight}>
              <span className={sharedStyles.sectionCount}>{filteredPending.length}</span>
            </div>
          </div>

          {paginatedPending.length === 0 ? (
            <div className={sharedStyles.emptyState}>
              <div className={sharedStyles.emptyStateIcon}><BookOpen size={22} color="var(--text-3)" /></div>
              <div className={sharedStyles.emptyStateTitle}>No booking confirmations</div>
              <div className={sharedStyles.emptyStateSub}>{pendingSearch ? 'Try adjusting search' : 'All clear!'}</div>
            </div>
          ) : (
            <div className={sharedStyles.tableScrollBody}>
              <table className={sharedStyles.table}>
                <thead>
                  <tr>
                    <th>Date Logged</th>
                    <th>Parent</th>
                    <th>Cub</th>
                    <th>Session</th>
                    <th>Grade</th>
                    <th>Matched Cub</th>
                    <th>Confidence</th>
                    <th style={{ width: 30 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPending.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPending(p)}
                      style={{ cursor: 'pointer' }}
                      title="Click row to open booking confirmation drawer"
                    >
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        <div>{formatDate(p.timestamp)}</div>
                        <div style={{ color: 'var(--text-3)', fontSize: '0.72rem' }}>{formatTime(p.timestamp)}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.parent_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{p.parent_phone}</div>
                      </td>
                      <td><div style={{ fontWeight: 600 }}>{p.cub_name}</div></td>
                      <td style={{ fontSize: '0.82rem' }}>{p.selected_session || '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{p.grade || '—'}</td>
                      <td>
                        <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                          {p.matched_cub_id || <span style={{ color: 'var(--orange, #eab308)', fontWeight: 600 }}>Unlinked</span>}
                        </div>
                      </td>
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

      {tab === 'roster' && (
        <>
          <RosterStats roster={roster} />

          <div className={sharedStyles.tableWrap}>
            <div className={sharedStyles.tableControls}>
              <div className={sharedStyles.tableControlsLeft}>
                <div style={{ position: 'relative', flex: 0 }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input className={sharedStyles.searchInput} style={{ paddingLeft: '2rem' }} placeholder="Search by name..."
                    value={rosterSearch} onChange={e => { setRosterSearch(e.target.value); setRosterPage(1); }} />
                </div>
                <select className={sharedStyles.filterSelect} value={sessionFilter} onChange={e => { setSessionFilter(e.target.value); setRosterPage(1); }}>
                  <option value="">All Sessions</option>
                  {sessions.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className={sharedStyles.filterSelect} value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setRosterPage(1); }}>
                  <option value="">All Categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>                <button
                  className={`${sharedStyles.btn} ${sharedStyles.btnPrimary}`}
                  onClick={() => {
                    const defaultSession = sessionFilter ||
                      roster.find(r => r.selected_session && sessions.includes(r.selected_session))?.selected_session ||
                      sessions[0] || '';
                    setAttendanceSession(defaultSession);
                    setIsAttendanceDrawerOpen(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}
                >
                  <Calendar size={13} /> Mark Attendance
                </button>
                <button
                  className={sharedStyles.btn}
                  onClick={() => {
                    setSelectedCubForChangeSession(null);
                    setIsChangeSessionDrawerOpen(true);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-1)' }}
                >
                  <RefreshCw size={13} /> Change Session
                </button>
              </div>
              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredRoster.length} of {roster.length}</span>
              </div>
            </div>

            {paginatedRoster.length === 0 ? (
              <div className={sharedStyles.emptyState}>
                <div className={sharedStyles.emptyStateTitle}>No roster entries found</div>
                <div className={sharedStyles.emptyStateSub}>Try adjusting your filters</div>
              </div>
            ) : (
              <div className={sharedStyles.tableScrollBody}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th>Cub</th>
                      <th>Parent</th>
                      <th>Session</th>
                      <th>Category</th>
                      <th>Weeks Active</th>
                      <th>Present</th>
                      <th>Last Attendance</th>
                      <th>Rep</th>
                      <th style={{ width: 32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRoster.map(r => (
                      <tr
                        key={r.id}
                        onClick={() => {
                          setSelectedCubForChangeSession(r as any);
                          setIsChangeSessionDrawerOpen(true);
                        }}
                        style={{ cursor: 'pointer' }}
                        title="Click row to change session or view cub details"
                      >
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.cubs.cub_first_name} {r.cubs.cub_last_name}</div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>{r.cub_id}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.cubs.parent_first_name} {r.cubs.parent_last_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{r.cubs.parent_phone || '—'}</div>
                        </td>
                        <td>
                          <span className={`${sharedStyles.badge} ${sharedStyles.badgeBlue}`}>
                            {r.selected_session || '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{r.rc_category || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`${sharedStyles.badge} ${sharedStyles.badgeBlue}`}>{r.weeks_active}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`${sharedStyles.badge} ${sharedStyles.badgeGreen}`}>{r.no_present}</span>
                        </td>
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                          {r.last_attendance_date ? formatDate(r.last_attendance_date) : '—'}
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{r.cubs.relationship_owner}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-3)' }}>
                          <ChevronRight size={15} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={rosterPage} total={filteredRoster.length} pageSize={PAGE_SIZE} onChange={setRosterPage} />
          </div>

          {/* Process Signup Confirmation Modal */}
          <ConfirmModal
            isOpen={showProcessConfirm}
            onClose={() => { setShowProcessConfirm(false); setProcessSignupId(null); setProcessSignupStatus(null); }}
            onConfirm={handleProcessConfirm}
            title="Mark Signup?"
            message={processSignupStatus ? `Mark this signup as ${processSignupStatus}?` : 'Mark this signup?'}
            confirmText={processSignupStatus || 'Confirm'}
            variant={processSignupStatus === 'Rejected' ? 'danger' : 'primary'}
          />
        </>
      )}

      {tab === 'pendingRC' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {[
              { label: 'Pending RC Selection', value: pendingRCList.length, icon: BookOpen, color: 'var(--orange)', bg: 'var(--orange-dim)' },
              { label: 'Orientation Done', value: pendingRCList.filter(d => d.orientation_completion_date).length, icon: CheckCircle2, color: 'var(--green)', bg: 'var(--green-dim)' },
              { label: 'In Journey', value: pendingRCList.filter(d => !d.orientation_completion_date).length, icon: Clock, color: 'var(--blue)', bg: 'var(--blue-dim)' },
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

          <div className={sharedStyles.tableWrap}>
            <div className={sharedStyles.tableControls}>
              <div className={sharedStyles.tableControlsLeft}>
                <div style={{ position: 'relative', flex: 0 }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input
                    className={sharedStyles.searchInput}
                    style={{ paddingLeft: '2rem' }}
                    placeholder="Search cubs or parents..."
                    value={pendingRCSearch}
                    onChange={e => { setPendingRCSearch(e.target.value); setPendingRCPage(1); }}
                  />
                </div>
              </div>
              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>
                  {pendingRCList.filter(d =>
                    !pendingRCSearch || `${d.cub_first_name} ${d.cub_last_name} ${d.cub_id} ${d.parent_phone ?? ''}`.toLowerCase().includes(pendingRCSearch.toLowerCase())
                  ).length} of {pendingRCList.length}
                </span>
              </div>
            </div>

            {(() => {
              const q = pendingRCSearch.toLowerCase();
              const filtered = pendingRCList.filter(d =>
                !q || `${d.cub_first_name} ${d.cub_last_name} ${d.cub_id} ${d.parent_phone ?? ''}`.toLowerCase().includes(q)
              );
              const paginated = filtered.slice((pendingRCPage - 1) * PAGE_SIZE, pendingRCPage * PAGE_SIZE);

              return (
                <>
                  {paginated.length === 0 ? (
                    <div className={sharedStyles.emptyState}>
                      <div className={sharedStyles.emptyStateTitle}>{pendingRCSearch ? 'No matches' : 'All Gen. Comm cubs have selected a Reading Circle'}</div>
                      <div className={sharedStyles.emptyStateSub}>{pendingRCSearch ? 'Try adjusting search' : 'Great job!'}</div>
                    </div>
                  ) : (
                    <div className={sharedStyles.tableScrollBody}>
                      <table className={sharedStyles.table}>
                        <thead>
                          <tr>
                            <th>Cub</th>
                            <th>Parent</th>
                            <th>Onboarded</th>
                            <th>Orientation Stage</th>
                            <th>Rep</th>
                            <th style={{ textAlign: 'right' }}>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginated.map(d => (
                            <tr key={d.cub_id}>
                              <td>
                                <div style={{ fontWeight: 600 }}>{d.cub_first_name} {d.cub_last_name}</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-3)' }}>{d.cub_id}</div>
                              </td>
                              <td>
                                <div style={{ fontWeight: 600 }}>{d.parent_first_name} {d.parent_last_name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{d.parent_phone || '—'}</div>
                              </td>
                              <td style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                                {d.date_onboarded ? formatDate(d.date_onboarded) : '—'}
                              </td>
                              <td>
                                <span className={`${sharedStyles.badge} ${d.orientation_completion_date ? sharedStyles.badgeGreen : sharedStyles.badgeBlue}`}>
                                  {d.orientation_stage || 'Invited'}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.82rem' }}>{d.relationship_owner}</td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  onClick={() => setSelectedCubForRC(d)}
                                  style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: 6,
                                    background: 'var(--primary)',
                                    color: '#fff',
                                    border: 'none',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                  }}
                                >
                                  <BookOpen size={12} /> Assign Circle
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <Pagination page={pendingRCPage} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPendingRCPage} />
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Assign RC Modal */}
      {selectedCubForRC && (
        <AssignRCSelectionModal
          isOpen={Boolean(selectedCubForRC)}
          cub={selectedCubForRC}
          availableSessions={sessions}
          onClose={() => setSelectedCubForRC(null)}
          onAssigned={(cubId, newSession) => {
            setPendingRCList(prev => prev.filter(c => c.cub_id !== cubId));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Modal to Assign Reading Circle Session ─────────────────────
function AssignRCSelectionModal({
  isOpen,
  cub,
  availableSessions = [],
  onClose,
  onAssigned,
}: {
  isOpen: boolean;
  cub: PendingRCRecord | null;
  availableSessions?: string[];
  onClose: () => void;
  onAssigned: (cubId: string, session: string) => void;
}) {
  const sessionOptions = useMemo(() => {
    return availableSessions.length > 0 ? availableSessions : DEFAULT_RC_SESSION_OPTIONS;
  }, [availableSessions]);

  const [session, setSession] = useState(sessionOptions[0] || '');
  const [isPending, startTransition] = useTransition();

  if (!isOpen || !cub) return null;

  const handleSubmit = () => {
    if (!session) return;
    startTransition(async () => {
      const res = await changeCubRCSession({
        cub_id: cub.cub_id,
        new_session: session,
      });
      if (res.error) {
        toast.error('Error assigning session: ' + res.error);
        return;
      }
      toast.success(`Assigned ${cub.cub_first_name} to ${session} (${res.newCategory || ''})`);
      onAssigned(cub.cub_id, session);
      onClose();
    });
  };

  return (
    <>
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(2px)',
          zIndex: 30000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          background: 'var(--bg-card, #ffffff)', border: '1px solid var(--border)', borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          width: '100%', maxWidth: '440px', zIndex: 30001,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            Assign Reading Circle Session
          </h2>
          <button style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer' }} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ background: 'var(--bg-2)', borderRadius: 10, padding: '0.875rem', marginBottom: '1.25rem' }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-1)' }}>
              {cub.cub_first_name} {cub.cub_last_name}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2 }}>
              ID: {cub.cub_id} • Onboarded: {cub.date_onboarded ? formatDate(cub.date_onboarded) : '—'}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: 4 }}>
              Parent: {cub.parent_first_name} {cub.parent_last_name} ({cub.parent_phone || 'No phone'})
            </div>
          </div>

          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
            Select Reading Circle Session
          </label>
          <select
            value={session}
            onChange={(e) => setSession(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-1)',
              fontSize: '0.9rem',
              marginBottom: '1.5rem',
            }}
          >
            {sessionOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button
              onClick={onClose}
              disabled={isPending}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: 8,
                background: 'var(--bg-2)',
                color: 'var(--text-2)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isPending}
              style={{
                padding: '0.625rem 1.25rem',
                borderRadius: 8,
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {isPending ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}
              Confirm Assignment
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
