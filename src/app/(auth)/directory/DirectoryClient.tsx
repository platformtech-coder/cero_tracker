'use client';

import { useState, useMemo, useEffect, useCallback, useRef, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ChevronLeft, ChevronRight, X, User, Phone, MessageCircle, Mail, Clock, Plus, ExternalLink, Activity, AlertCircle, Baby, Users, ArrowUpDown, BookMarked, Loader2, Calendar } from 'lucide-react';
import type { Cub, Family, Profile, Interaction, Action } from '@/lib/types';
import { getCubActivity, getCubsForFamily, getDirectoryCubs, getDirectoryFamilies } from '@/lib/actions/directory';
import { getCubReadingAudit, type ReadingAuditResult } from '@/lib/actions/perbicubs-api';

import sharedStyles from '@/components/ui/dashboard.module.css';
import tabStyles from '../engagements/engagements.module.css';
import { useInteractionStore } from '@/lib/store';
import { formatDate } from '@/lib/utils/date';
import { useTableSort } from '@/hooks/useTableSort';
import {
  DirectoryCubFilter,
  applyCubFilters,
  emptyCubFilterState,
  countCubFilters,
  type CubFilterState,
} from '@/components/ui/DirectoryCubFilter';
import {
  DirectoryFamilyFilter,
  applyFamilyFilters,
  emptyFamilyFilterState,
  countFamilyFilters,
  type FamilyFilterState,
} from '@/components/ui/DirectoryFamilyFilter';
import { Skeleton, SkeletonActivityTimeline, SkeletonTable } from '@/components/ui/Skeleton';

const PAGE_SIZE = 25;

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let i = start; i <= Math.min(totalPages, start + 4); i++) pages.push(i);
  return (
    <div className={sharedStyles.pagination}>
      <span>Page {page} of {totalPages} — {total} entries</span>
      <div className={sharedStyles.paginationBtns}>
        <button className={sharedStyles.pageBtn} onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}><ChevronLeft size={14} /></button>
        {pages.map(p => (
          <button key={p} className={`${sharedStyles.pageBtn} ${p === page ? sharedStyles.pageBtnActive : ''}`} onClick={() => onChange(p)}>{p}</button>
        ))}
        <button className={sharedStyles.pageBtn} onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

function SubStatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? sharedStyles.badgeGreen
    : status === 'expired' ? sharedStyles.badgeRed
    : sharedStyles.badgeOrange;
  const displayStatus = status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return <span className={`${sharedStyles.badge} ${cls}`}>{displayStatus}</span>;
}

// ─── Cub Profile Drawer ──────────────────────────────────────────
function CubProfileDrawer({ cub, onClose }: { cub: any; onClose: () => void }) {
  const [tab, setTab] = useState<'overview' | 'activity' | 'email' | 'reading_audit'>('overview');
  const [activityTab, setActivityTab] = useState<'interactions' | 'actions'>('interactions');
  const [activity, setActivity] = useState<{ interactions: Interaction[]; actions: Action[]; email_history?: any }>({ interactions: [], actions: [] });
  const [loadingActivity, setLoadingActivity] = useState(true);
  const openInteractionDrawer = useInteractionStore(state => state.openDrawer);

  // Reading Audit state
  const [auditStart, setAuditStart] = useState('');
  const [auditEnd, setAuditEnd] = useState('');
  const [auditResult, setAuditResult] = useState<ReadingAuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPending, startAuditTransition] = useTransition();

  const handleQuickPick = useCallback((type: 'week' | '30d' | '90d') => {
    const d = new Date();
    const t = d.toISOString().slice(0, 10);
    if (type === 'week') {
      d.setDate(d.getDate() - d.getDay());
      setAuditStart(d.toISOString().slice(0, 10));
    } else if (type === '30d') {
      d.setDate(d.getDate() - 30);
      setAuditStart(d.toISOString().slice(0, 10));
    } else {
      d.setDate(d.getDate() - 90);
      setAuditStart(d.toISOString().slice(0, 10));
    }
    setAuditEnd(t);
  }, []);

  useEffect(() => {
    handleQuickPick('week');
  }, [handleQuickPick]);

  const runAudit = () => {
    setAuditResult(null);
    setAuditError(null);
    startAuditTransition(async () => {
      const res = await getCubReadingAudit(cub.cub_id, auditStart, auditEnd);
      if (res.success) {
        setAuditResult(res.data);
      } else {
        setAuditError(res.error);
      }
    });
  };

  // Fetch live activity when opened
  useEffect(() => {
    if (cub?.cub_id) {
      setLoadingActivity(true);
      getCubActivity(cub.cub_id).then(res => {
        setActivity(res);
        setLoadingActivity(false);
      });
    }
  }, [cub?.cub_id]);

  if (!cub) return null;

  return (
    <>
      <div className={`${sharedStyles.drawerOverlay} ${sharedStyles.drawerOverlayActive}`} onClick={onClose} />
      <div className={`${sharedStyles.drawer} ${sharedStyles.drawerActive}`}>
        {/* Header */}
        <div className={sharedStyles.drawerHeader}>
          <h2 className={sharedStyles.drawerTitle}>Cub Profile</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button 
              className={`${sharedStyles.btn} ${sharedStyles.btnPrimary}`} 
              style={{ padding: '8px 12px', fontSize: 12 }}
              onClick={() => openInteractionDrawer({
                cubId: cub.cub_id,
                cubFirstName: cub.cub_first_name,
                cubLastName: cub.cub_last_name,
                parentFirstName: cub.parent_first_name,
                parentLastName: cub.parent_last_name
              })}
            >
              <Plus size={14} style={{ marginRight: 6 }}/> Log Interaction
            </button>
            <button className={sharedStyles.drawerClose} onClick={onClose}><X size={18}/></button>
          </div>
        </div>

        <div className={sharedStyles.drawerBody}>
          {/* Hero */}
          <div className={sharedStyles.drawerHero}>
            <div className={sharedStyles.drawerHeroTop}>
              <div className={sharedStyles.drawerHeroIdentity}>
                <div className={`${sharedStyles.profileAvatar} ${sharedStyles.cubAvatar}`}>
                  {cub.cub_first_name?.[0]}{cub.cub_last_name?.[0]}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className={sharedStyles.drawerHeroName}>{cub.cub_first_name} {cub.cub_last_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, letterSpacing: '0.3px', marginTop: 2 }}>{cub.cub_id}</div>
                  <div className={sharedStyles.drawerHeroMeta}>
                    <span>{cub.school_name || '—'}</span>
                    <span className={sharedStyles.dot}>·</span>
                    <span>{cub.grade || '—'}</span>
                    <span className={sharedStyles.dot}>·</span>
                    <span>{cub.stream || '—'}</span>
                    <span className={sharedStyles.dot}>·</span>
                    <span>{cub.gender || '—'}</span>
                  </div>
                </div>
              </div>
              <div className={sharedStyles.drawerHeroBadges}>
                {cub.segment && <span className={`${sharedStyles.badge} ${sharedStyles.badgePrimary}`}>{cub.segment}</span>}
                <SubStatusBadge status={cub.sub_status} />
                <div className={sharedStyles.drawerHeroSubEnd}>
                  {cub.sub_end_date ? formatDate(cub.sub_end_date) : ''}
                </div>
              </div>
            </div>
          </div>

          {/* Parent Contact */}
          <div className={sharedStyles.drawerSection}>
            <div className={sharedStyles.drawerSectionTitle}>Parent</div>
            <div className={sharedStyles.infoRow}>
              <div className={sharedStyles.infoItem}><User size={13}/> <strong>{cub.parent_first_name} {cub.parent_last_name}</strong></div>
              <div className={sharedStyles.infoItem}><Phone size={13}/> <strong>{cub.parent_phone || '—'}</strong></div>
              <div className={sharedStyles.infoItem}><MessageCircle size={13}/> <strong>{cub.parent_whatsapp || '—'}</strong></div>
              <div className={sharedStyles.infoItem}><Mail size={13}/> <strong>{cub.parent_email || '—'}</strong></div>
            </div>
          </div>

          <div className={tabStyles.tabs} style={{ marginBottom: '16px' }}>
            <button className={`${tabStyles.tabBtn} ${tab === 'overview' ? tabStyles.tabBtnActive : ''}`} onClick={() => setTab('overview')} style={{ padding: '8px 12px', fontSize: 13 }}>Overview</button>
            <button className={`${tabStyles.tabBtn} ${tab === 'activity' ? tabStyles.tabBtnActive : ''}`} onClick={() => setTab('activity')} style={{ padding: '8px 12px', fontSize: 13 }}>Activity</button>
            <button className={`${tabStyles.tabBtn} ${tab === 'email' ? tabStyles.tabBtnActive : ''}`} onClick={() => setTab('email')} style={{ padding: '8px 12px', fontSize: 13 }}>Email History</button>
            <button
              className={`${tabStyles.tabBtn} ${tab === 'reading_audit' ? tabStyles.tabBtnActive : ''}`}
              onClick={() => { setTab('reading_audit'); setAuditResult(null); setAuditError(null); }}
              style={{ padding: '8px 12px', fontSize: 13 }}
            >
              Reading Audit
            </button>
          </div>

          {tab === 'overview' && (
            <div>
              {/* Reading Stats */}
              <div className={sharedStyles.drawerSection}>
                <div className={sharedStyles.drawerSectionTitle}>Reading Stats</div>
                <div className={sharedStyles.statChips} style={{ marginBottom: 8 }}>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{cub.cum_term_points ?? cub.cumulative_points ?? 0}</div><div className={sharedStyles.statChipLbl}>Cum. Termly Points</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{cub.cumulative_weekly_points || 0}</div><div className={sharedStyles.statChipLbl}>Weekly Points</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.last_reading_activity ? formatDate(cub.last_reading_activity) : '—'}</div><div className={sharedStyles.statChipLbl}>Last Reading Activity</div></div>
                </div>
                <div className={sharedStyles.statChips} style={{ marginBottom: 8 }}>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.streak_label || '—'}</div><div className={sharedStyles.statChipLbl}>Streak Label</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{cub.current_streak || 0}</div><div className={sharedStyles.statChipLbl}>Current Streak</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{cub.longest_streak || 0}</div><div className={sharedStyles.statChipLbl}>Longest Streak</div></div>
                </div>
                <div className={sharedStyles.statChips}>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.current_league || '—'}</div><div className={sharedStyles.statChipLbl}>League</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.medallion || '—'}</div><div className={sharedStyles.statChipLbl}>Medallion</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.flag || '—'}</div><div className={sharedStyles.statChipLbl}>Flag</div></div>
                </div>
              </div>

              {/* Orientation Journey */}
              <div className={sharedStyles.drawerSection}>
                <div className={sharedStyles.drawerSectionTitle}>Orientation Journey</div>
                <div className={sharedStyles.statChips} style={{ marginBottom: 8 }}>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.orientation_stage || '—'}</div><div className={sharedStyles.statChipLbl}>Stage</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.orientation_stage_status || '—'}</div><div className={sharedStyles.statChipLbl}>Stage Status</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.orientation_next_stage || '—'}</div><div className={sharedStyles.statChipLbl}>Next Stage</div></div>
                </div>
                <div className={sharedStyles.statChips}>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.orientation_completion_date ? formatDate(cub.orientation_completion_date) : '—'}</div><div className={sharedStyles.statChipLbl}>Completion Date</div></div>
                </div>
              </div>

              {/* Reading Circle */}
              <div className={sharedStyles.drawerSection}>
                <div className={sharedStyles.drawerSectionTitle}>Reading Circle</div>
                <div className={sharedStyles.statChips}>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.reading_circle_category || '—'}</div><div className={sharedStyles.statChipLbl}>Category</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{cub.no_present || 0}</div><div className={sharedStyles.statChipLbl}>No. Present</div></div>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.last_attendance_date ? formatDate(cub.last_attendance_date) : '—'}</div><div className={sharedStyles.statChipLbl}>Last Attendance</div></div>
                </div>
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className={tabStyles.tabs} style={{ marginTop: '4px', marginBottom: '16px' }}>
                <button className={`${tabStyles.tabBtn} ${activityTab === 'interactions' ? tabStyles.tabBtnActive : ''}`} onClick={() => setActivityTab('interactions')} style={{ padding: '6px 12px', fontSize: 12 }}>Interactions</button>
                <button className={`${tabStyles.tabBtn} ${activityTab === 'actions' ? tabStyles.tabBtnActive : ''}`} onClick={() => setActivityTab('actions')} style={{ padding: '6px 12px', fontSize: 12 }}>Actions</button>
              </div>
              
              {loadingActivity ? (
                <div style={{ padding: '8px 0' }}>
                  <SkeletonActivityTimeline count={3} />
                </div>
              ) : (
                <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  {activityTab === 'interactions' && (
                    <table className={sharedStyles.miniTable}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Handled By</th>
                          <th>Type</th>
                          <th>Status</th>
                          <th>Purpose</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activity.interactions.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No interactions</td></tr> : null}
                        {activity.interactions.map(int => (
                          <tr key={int.id}>
                            <td>{formatDate(int.date)}</td>
                            <td>{int.handled_by || '—'}</td>
                            <td>{int.type}</td>
                            <td>{int.status || '—'}</td>
                            <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{int.purpose}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {activityTab === 'actions' && (
                    <table className={sharedStyles.miniTable}>
                      <thead>
                        <tr>
                          <th>Deadline</th>
                          <th>Handled By</th>
                          <th>Action</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activity.actions.length === 0 ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No pending actions</td></tr> : null}
                        {activity.actions.map(act => (
                          <tr key={act.id}>
                            <td style={{ color: act.action_deadline ? 'var(--red)' : 'inherit' }}>
                              {act.action_deadline ? formatDate(act.action_deadline) : '—'}
                            </td>
                            <td>{act.handled_by || '—'}</td>
                            <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{act.action}</td>
                            <td>{act.action_status || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'email' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <table className={sharedStyles.miniTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Message Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.email_history ? (
                      (() => {
                        const msgs = [];
                        for (let i = 1; i <= 7; i++) {
                          const date = activity.email_history[`msg_${i}_date`];
                          const type = activity.email_history[`msg_${i}_type`];
                          if (date || type) msgs.push({ id: i, date, type });
                        }
                        if (msgs.length === 0) {
                          return <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '2rem' }}>No email history found.</td></tr>;
                        }
                        return msgs.map(m => (
                          <tr key={m.id}>
                            <td>{m.date ? formatDate(m.date) : '—'}</td>
                            <td>{m.type ? String(m.type).split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—'}</td>
                          </tr>
                        ));
                      })()
                    ) : (
                      <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-3)', padding: '2rem' }}>Email history not available.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'reading_audit' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: '1rem' }}>
              {/* Date Range Pickers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                    From
                  </label>
                  <input
                    type="date"
                    value={auditStart}
                    max={auditEnd}
                    onChange={e => setAuditStart(e.target.value)}
                    style={{
                      width: '100%', padding: '0.5rem 0.75rem', borderRadius: 7,
                      border: '1px solid var(--border)', background: 'var(--bg-card)',
                      color: 'var(--text-1)', fontSize: '0.85rem',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                    To
                  </label>
                  <input
                    type="date"
                    value={auditEnd}
                    min={auditStart}
                    onChange={e => setAuditEnd(e.target.value)}
                    style={{
                      width: '100%', padding: '0.5rem 0.75rem', borderRadius: 7,
                      border: '1px solid var(--border)', background: 'var(--bg-card)',
                      color: 'var(--text-1)', fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              {/* Quick-pick: Current Week */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => handleQuickPick('week')}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  This Week (Sun–Sat)
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPick('30d')}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickPick('90d')}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Last 90 Days
                </button>
              </div>

              {/* Fetch Button */}
              <button
                onClick={runAudit}
                disabled={auditPending || !auditStart || !auditEnd}
                className={`${sharedStyles.btn} ${sharedStyles.btnPrimary}`}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center', padding: '0.65rem 1rem' }}
              >
                {auditPending
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Fetching from Perbicubs...</>
                  : <><BookMarked size={14} /> Get Reading Data</>}
              </button>

              {/* Error */}
              {auditError && (
                <div style={{
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                  borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.82rem',
                  color: 'var(--red, #ef4444)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
                }}>
                  <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  {auditError}
                </div>
              )}

              {/* Results */}
              {auditResult && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: '0.75rem' }}>
                  {/* Summary chip */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '1rem',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: '0.75rem 1rem',
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
                        {auditResult.total_points}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                        Total Points
                      </div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--green)', lineHeight: 1 }}>
                        {auditResult.books.filter(b => b.status === 'completed').length}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                        Books Passed
                      </div>
                    </div>
                    <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-2)', lineHeight: 1 }}>
                        {auditResult.books.length}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>
                        Quizzes Taken
                      </div>
                    </div>
                  </div>

                  {/* Books table */}
                  <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    {auditResult.books.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: '0.85rem' }}>
                        No quiz records found for this period.
                      </div>
                    ) : (
                      <table className={sharedStyles.miniTable}>
                        <thead>
                          <tr>
                            <th>Book</th>
                            <th>Quiz Date</th>
                            <th style={{ textAlign: 'center' }}>Score</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditResult.books.map((b, i) => (
                            <tr key={i}>
                              <td style={{ whiteSpace: 'normal', minWidth: 140, fontWeight: 500 }}>{b.book}</td>
                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                                {b.quiz_date ? formatDate(b.quiz_date) : '—'}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span style={{
                                  display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                                  fontSize: '0.75rem', fontWeight: 700,
                                  background: b.score > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
                                  color: b.score > 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)',
                                }}>
                                  {b.score}
                                </span>
                              </td>
                              <td>
                                <span style={{
                                  fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize',
                                  color: b.status === 'completed' ? 'var(--green, #22c55e)' : 'var(--text-3)',
                                }}>
                                  {b.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Family Profile Drawer ───────────────────────────────────────
function FamilyDrawer({ family, onClose }: { family: any; onClose: () => void }) {
  const [selectedCubForDrawer, setSelectedCubForDrawer] = useState<any | null>(null);
  const [activityTab, setActivityTab] = useState<'interactions' | 'actions'>('interactions');
  const [activity, setActivity] = useState<{ interactions: Interaction[]; actions: Action[]; email_history?: any }>({ interactions: [], actions: [] });
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [familyCubs, setFamilyCubs] = useState<any[]>([]);
  const [loadingCubs, setLoadingCubs] = useState(true);

  // Load cubs from DB for this family
  useEffect(() => {
    if (!family) return;
    setLoadingCubs(true);
    getCubsForFamily(family.parent_phone ?? null, family.parent_email ?? null).then(cubs => {
      setFamilyCubs(cubs);
      setLoadingCubs(false);
    });
  }, [family?.parent_phone, family?.parent_email]);

  // Fetch combined activity for all cubs in family
  useEffect(() => {
    if (!family) return;
    const ids = familyCubs.map((c: any) => c.cub_id).filter(Boolean);
    if (ids.length > 0) {
      setLoadingActivity(true);
      Promise.all(ids.map((cubId: string) => getCubActivity(cubId))).then(results => {
        const combined = results.reduce((acc, res) => ({
          interactions: [...acc.interactions, ...res.interactions],
          actions: [...acc.actions, ...res.actions]
        }), { interactions: [] as Interaction[], actions: [] as Action[] });
        combined.interactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        combined.actions.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
        setActivity(combined);
        setLoadingActivity(false);
      });
    } else if (!loadingCubs) {
      setLoadingActivity(false);
    }
  }, [family, familyCubs, loadingCubs]);

  const handleCubClick = (cub: any) => {
    setSelectedCubForDrawer(cub);
  };

  if (!family) return null;

  return (
    <>
      <div className={`${sharedStyles.drawerOverlay} ${sharedStyles.drawerOverlayActive}`} onClick={onClose} />
      <div className={`${sharedStyles.drawer} ${sharedStyles.drawerActive}`}>
        <div className={sharedStyles.drawerHeader}>
          <h2 className={sharedStyles.drawerTitle}>Family Profile</h2>
          <button className={sharedStyles.drawerClose} onClick={onClose}><X size={18}/></button>
        </div>

        <div className={sharedStyles.drawerBody}>
          <div className={sharedStyles.drawerHero}>
            <div className={sharedStyles.drawerHeroTop}>
              <div className={sharedStyles.drawerHeroIdentity}>
                <div className={`${sharedStyles.profileAvatar}`} style={{ background: 'var(--green)' }}>
                  {family.parent_first_name?.[0]}{family.parent_last_name?.[0]}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className={sharedStyles.drawerHeroName}>{family.parent_first_name} {family.parent_last_name}</div>
                  <div className={sharedStyles.drawerHeroMeta}>
                    <span>{family.no_cubs} Cub(s) Enrolled</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={sharedStyles.drawerSection}>
            <div className={sharedStyles.drawerSectionTitle}>Contact Info</div>
            <div className={sharedStyles.infoRow}>
              <div className={sharedStyles.infoItem}><Phone size={13}/> <strong>{family.parent_phone || '—'}</strong></div>
              <div className={sharedStyles.infoItem}><MessageCircle size={13}/> <strong>{family.parent_whatsapp || '—'}</strong></div>
              <div className={sharedStyles.infoItem}><Mail size={13}/> <strong>{family.parent_email || '—'}</strong></div>
            </div>
          </div>

          <div className={sharedStyles.drawerSectionTitle} style={{ marginTop: 24, marginBottom: 12 }}>
            Cubs in Family {loadingCubs ? <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>(Loading...)</span> : <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}>({familyCubs.length})</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingCubs ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg-input)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton width="45%" height={14} borderRadius={4} />
                  <Skeleton width="60%" height={11} borderRadius={3} />
                </div>
                <div style={{ padding: '12px 16px', background: 'var(--bg-input)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Skeleton width="40%" height={14} borderRadius={4} />
                  <Skeleton width="55%" height={11} borderRadius={3} />
                </div>
              </div>
            ) : familyCubs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No cubs found for this parent contact.</div>
            ) : familyCubs.map((cub: any) => (
              <div
                key={cub.id}
                onClick={() => handleCubClick(cub)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-input)', borderRadius: 12, cursor: 'pointer', transition: 'background 0.15s' }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{cub.cub_first_name} {cub.cub_last_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{cub.cub_id} • {cub.school_name || 'No School'}</div>
                </div>
                <SubStatusBadge status={cub.sub_status} />
                <ExternalLink size={14} style={{ color: 'var(--text-3)', opacity: 0.6 }} />
              </div>
            ))}
          </div>

          {/* Recent Interactions & Actions */}
          <div className={sharedStyles.drawerSectionTitle} style={{ marginTop: 24, marginBottom: 12 }}>Recent Activity</div>
          <div className={tabStyles.tabs} style={{ marginBottom: '16px' }}>
            <button className={`${tabStyles.tabBtn} ${activityTab === 'interactions' ? tabStyles.tabBtnActive : ''}`} onClick={() => setActivityTab('interactions')} style={{ padding: '6px 12px', fontSize: 12 }}>Interactions</button>
            <button className={`${tabStyles.tabBtn} ${activityTab === 'actions' ? tabStyles.tabBtnActive : ''}`} onClick={() => setActivityTab('actions')} style={{ padding: '6px 12px', fontSize: 12 }}>Actions</button>
          </div>

          {loadingActivity ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)' }}>Loading activity...</div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
              {activityTab === 'interactions' && (
                <table className={sharedStyles.miniTable}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Cub</th>
                      <th>Handled By</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Purpose</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.interactions.length === 0 ? <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No interactions</td></tr> : null}
                    {activity.interactions.slice(0, 20).map(int => (
                      <tr key={int.id}>
                        <td>{formatDate(int.date)}</td>
                        <td>{int.cub_first_name} {int.cub_last_name}</td>
                        <td>{int.handled_by || '—'}</td>
                        <td>{int.type}</td>
                        <td>{int.status || '—'}</td>
                        <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{int.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {activityTab === 'actions' && (
                <table className={sharedStyles.miniTable}>
                  <thead>
                    <tr>
                      <th>Deadline</th>
                      <th>Cub</th>
                      <th>Handled By</th>
                      <th>Action</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.actions.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-3)' }}>No pending actions</td></tr> : null}
                    {activity.actions.slice(0, 20).map(act => (
                      <tr key={act.id}>
                        <td style={{ color: act.action_deadline ? 'var(--red)' : 'inherit' }}>
                          {act.action_deadline ? formatDate(act.action_deadline) : '—'}
                        </td>
                        <td>{act.cub_first_name} {act.cub_last_name}</td>
                        <td>{act.handled_by || '—'}</td>
                        <td style={{ whiteSpace: 'normal', minWidth: 200 }}>{act.action}</td>
                        <td>{act.action_status || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedCubForDrawer && <CubProfileDrawer cub={selectedCubForDrawer} onClose={() => setSelectedCubForDrawer(null)} />}
    </>
  );
}

interface Props {
  initialCubs: (Cub & { cub_first_name: string; cub_last_name: string })[] | null;
  initialFamilies: Family[] | null;
  initialTab?: 'cubs' | 'families';
  profile: Profile;
  isAdmin?: boolean;
  allReps?: string[];
  currentRep?: string;
  dropdowns?: Record<string, string[]>;
}

export default function DirectoryClient({ initialCubs, initialFamilies, initialTab = 'cubs', profile, isAdmin, allReps, currentRep, dropdowns }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  
  const [tab, setTabState] = useState<'cubs' | 'families'>(() => {
    return (rawTab === 'families' || initialTab === 'families') ? 'families' : 'cubs';
  });

  const [cubs, setCubs] = useState(initialCubs);
  const [families, setFamilies] = useState(initialFamilies);
  const [loadingTab, setLoadingTab] = useState<'cubs' | 'families' | null>(null);

  // Sync state if initial props change (e.g. rep filter changed)
  useEffect(() => {
    if (initialCubs !== null) setCubs(initialCubs);
  }, [initialCubs]);

  useEffect(() => {
    if (initialFamilies !== null) setFamilies(initialFamilies);
  }, [initialFamilies]);

  // Invalidate inactive tab cache when currentRep filter changes
  const prevRepRef = useRef(currentRep);
  useEffect(() => {
    if (prevRepRef.current !== currentRep) {
      prevRepRef.current = currentRep;
      if (tab === 'cubs') setFamilies(null);
      else setCubs(null);
    }
  }, [currentRep, tab]);

  const repFilterParam = currentRep && currentRep !== 'All Reps' ? currentRep : undefined;

  // Instant, non-blocking tab switch with immediate visual feedback
  const setTab = useCallback((t: 'cubs' | 'families') => {
    setTabState(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url.pathname + url.search);
    }

    if (t === 'families' && !families && loadingTab !== 'families') {
      setLoadingTab('families');
      getDirectoryFamilies(repFilterParam)
        .then(res => setFamilies(res))
        .catch(err => console.error('Failed to load families:', err))
        .finally(() => setLoadingTab(null));
    } else if (t === 'cubs' && !cubs && loadingTab !== 'cubs') {
      setLoadingTab('cubs');
      getDirectoryCubs(repFilterParam)
        .then(res => setCubs(res))
        .catch(err => console.error('Failed to load cubs:', err))
        .finally(() => setLoadingTab(null));
    }
  }, [cubs, families, loadingTab, repFilterParam]);

  // Background prefetch on idle for instant 0ms tab switches
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tab === 'cubs' && !families && loadingTab !== 'families') {
        getDirectoryFamilies(repFilterParam)
          .then(res => setFamilies(prev => prev ?? res))
          .catch(() => {});
      } else if (tab === 'families' && !cubs && loadingTab !== 'cubs') {
        getDirectoryCubs(repFilterParam)
          .then(res => setCubs(prev => prev ?? res))
          .catch(() => {});
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [tab, families, cubs, loadingTab, repFilterParam]);

  const [selectedCub, setSelectedCub] = useState<any | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<any | null>(null);

  // Cubs state
  const [cubSearch, setCubSearch] = useState('');
  const [cubPage, setCubPage] = useState(1);

  // Families state
  const [famSearch, setFamSearch] = useState('');
  const [famPage, setFamPage] = useState(1);

  // ── Advanced filter state (Cubs) ───────────────────────────────────────────
  const allSchools = useMemo(() => {
    const s = new Set<string>();
    (cubs ?? []).forEach(c => { if (c.school_name) s.add(c.school_name); });
    return Array.from(s).sort();
  }, [cubs]);

  const allSegments = useMemo(() => {
    const s = new Set<string>();
    (cubs ?? []).forEach(c => { if (c.segment) s.add(c.segment); });
    return Array.from(s).sort();
  }, [cubs]);

  const [cubFilters, setCubFilters] = useState<CubFilterState>(emptyCubFilterState);
  const cubFiltersActive = countCubFilters(cubFilters);

  const resetCubFilters = () => {
    setCubFilters(emptyCubFilterState());
    setCubPage(1);
  };

  // Text search filter
  const searchFilteredCubs = useMemo(() => {
    if (!cubs) return [];
    const q = cubSearch.toLowerCase();
    if (!q) return cubs;
    return cubs.filter(c =>
      `${c.cub_first_name} ${c.cub_last_name} ${c.cub_id} ${c.school_name ?? ''}`.toLowerCase().includes(q)
    );
  }, [cubs, cubSearch]);

  // Advanced multi-filter
  const filteredCubs = useMemo(
    () => applyCubFilters(searchFilteredCubs, cubFilters),
    [searchFilteredCubs, cubFilters]
  );

  const { sortedData: sortedCubs, handleSort: handleCubsSort, getSortIndicator: getCubsSortIndicator } = useTableSort(filteredCubs, {
    sortableKeys: ['last_engagement_activity', 'cub_first_name', 'grade', 'stream', 'segment', 'sub_status', 'sub_end_date', 'no_sub_days', 'orientation_stage', 'orientation_stage_status', 'orientation_next_stage', 'orientation_completion_date', 'flag', 'current_streak', 'streak_label', 'current_league', 'cum_term_points', 'cumulative_points', 'cumulative_weekly_points', 'handled_by_last', 'purpose_last'],
    getSortValue: (item, key) => item[key as keyof typeof item],
  });

  const paginatedCubs = sortedCubs.slice((cubPage - 1) * PAGE_SIZE, cubPage * PAGE_SIZE);

  // ── Advanced filter state (Families) ──────────────────────────────────────
  const allFamilySchools = useMemo(() => {
    const s = new Set<string>();
    (families ?? []).forEach(f => (f.schools ?? []).forEach(sc => s.add(sc)));
    return Array.from(s).sort();
  }, [families]);

  const allFamilySegments = useMemo(() => {
    const s = new Set<string>();
    (families ?? []).forEach(f => (f.segments ?? []).forEach(sg => s.add(sg)));
    return Array.from(s).sort();
  }, [families]);

  const allFamilyReps = useMemo(() => {
    const s = new Set<string>();
    (families ?? []).forEach(f => { if (f.relationship_owner) s.add(f.relationship_owner); });
    return Array.from(s).sort();
  }, [families]);

  const [famFilters, setFamFilters] = useState<FamilyFilterState>(emptyFamilyFilterState);
  const famFiltersActive = countFamilyFilters(famFilters);

  const resetFamFilters = () => {
    setFamFilters(emptyFamilyFilterState());
    setFamPage(1);
  };

  const searchFilteredFamilies = useMemo(() => {
    if (!families) return [];
    const q = famSearch.toLowerCase();
    if (!q) return families;
    return families.filter(f =>
      `${f.parent_first_name} ${f.parent_last_name} ${f.parent_phone ?? ''} ${f.parent_email ?? ''}`.toLowerCase().includes(q)
    );
  }, [families, famSearch]);

  const filteredFamilies = useMemo(
    () => applyFamilyFilters(searchFilteredFamilies, famFilters),
    [searchFilteredFamilies, famFilters]
  );

  const paginatedFamilies = filteredFamilies.slice((famPage - 1) * PAGE_SIZE, famPage * PAGE_SIZE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div className={tabStyles.tabs}>
        <button className={`${tabStyles.tabBtn} ${tab === 'cubs' ? tabStyles.tabBtnActive : ''}`} onClick={() => setTab('cubs')}>
          <Baby size={14} style={{ marginRight: 6 }} /> Cubs
        </button>
        <button className={`${tabStyles.tabBtn} ${tab === 'families' ? tabStyles.tabBtnActive : ''}`} onClick={() => setTab('families')}>
          <Users size={14} style={{ marginRight: 6 }} /> Families
        </button>
      </div>

      {tab === 'cubs' && (
        (!cubs || loadingTab === 'cubs') ? (
          <div className={sharedStyles.tableWrap}>
            <SkeletonTable
              rows={12}
              columns={[
                { header: 'Last Engagement', width: '13%' },
                { header: 'Cub Name', width: '18%' },
                { header: 'Grade', width: '7%' },
                { header: 'Stream', width: '7%' },
                { header: 'Segment', width: '10%' },
                { header: 'Sub Status', width: '10%' },
                { header: 'Stage', width: '12%' },
                { header: 'Stage Status', width: '11%' },
                { header: 'Flag', width: '12%' },
              ]}
              showSearch={true}
              showFilters={true}
            />
          </div>
        ) : (
          <div className={sharedStyles.tableWrap}>
            <div className={sharedStyles.tableControls}>
              <div className={sharedStyles.tableControlsLeft} style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input className={sharedStyles.searchInput} style={{ paddingLeft: '2rem' }} placeholder="Search by name, ID, school..."
                    value={cubSearch} onChange={e => { setCubSearch(e.target.value); setCubPage(1); }} />
                </div>
                <DirectoryCubFilter
                  allSchools={allSchools}
                  allSegments={allSegments}
                  value={cubFilters}
                  onChange={(next) => { setCubFilters(next); setCubPage(1); }}
                  onReset={resetCubFilters}
                  totalActive={cubFiltersActive}
                />
              </div>
              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredCubs.length} of {(cubs ?? []).length}</span>
              </div>
            </div>

          {paginatedCubs.length === 0 ? (
            <div className={sharedStyles.emptyState}>
              <div className={sharedStyles.emptyStateTitle}>No cubs found</div>
              <div className={sharedStyles.emptyStateSub}>Try adjusting your search or filters</div>
            </div>
          ) : (
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table className={sharedStyles.table}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ textAlign: 'left', position: 'sticky', top: 0, zIndex: 1, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('last_engagement_activity')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Last Engagement
                        {getCubsSortIndicator('last_engagement_activity') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'left', minWidth: '200px', position: 'sticky', top: 0, zIndex: 1, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('cub_first_name')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Cub Name
                        {getCubsSortIndicator('cub_first_name') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '70px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('grade')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Grade
                        {getCubsSortIndicator('grade') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '80px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('stream')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Stream
                        {getCubsSortIndicator('stream') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '120px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('segment')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Segment
                        {getCubsSortIndicator('segment') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '100px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('sub_status')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Sub Status
                        {getCubsSortIndicator('sub_status') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '100px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('sub_end_date')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Sub End Date
                        {getCubsSortIndicator('sub_end_date') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '90px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('no_sub_days')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        No. Sub Days
                        {getCubsSortIndicator('no_sub_days') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '150px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('orientation_stage')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Ori. Stage
                        {getCubsSortIndicator('orientation_stage') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '150px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('orientation_stage_status')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Ori. Stage Status
                        {getCubsSortIndicator('orientation_stage_status') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '150px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('orientation_next_stage')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Ori. Next Stage
                        {getCubsSortIndicator('orientation_next_stage') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '120px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('orientation_completion_date')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Ori. Completion Date
                        {getCubsSortIndicator('orientation_completion_date') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '150px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('flag')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Flag
                        {getCubsSortIndicator('flag') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '80px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('current_streak')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Curr. Streak
                        {getCubsSortIndicator('current_streak') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '90px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('streak_label')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Streak Label
                        {getCubsSortIndicator('streak_label') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '180px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('current_league')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        League
                        {getCubsSortIndicator('current_league') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '90px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('cum_term_points')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Cum. Term Points
                        {getCubsSortIndicator('cum_term_points') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '100px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('cumulative_weekly_points')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Weekly Points
                        {getCubsSortIndicator('cumulative_weekly_points') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '100px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('handled_by_last')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Handled By
                        {getCubsSortIndicator('handled_by_last') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                    <th style={{ textAlign: 'center', minWidth: '200px', cursor: 'pointer', userSelect: 'none' }} onClick={() => handleCubsSort('purpose_last')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        Purpose
                        {getCubsSortIndicator('purpose_last') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCubs.map(cub => (
                    <tr key={cub.id} onClick={() => setSelectedCub(cub)} style={{ cursor: 'pointer' }} className={sharedStyles.tableRowHover}>
                      <td style={{ textAlign: 'left', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                        {cub.last_engagement_activity ? formatDate(cub.last_engagement_activity) : '—'}
                      </td>
                      <td style={{ textAlign: 'left', minWidth: '200px' }}>
                        <div style={{ fontWeight: 600, fontFamily: 'Lexend, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                          {(() => {
                            const fullName = `${cub.cub_first_name} ${cub.cub_last_name}`;
                            const words = fullName.split(' ');
                            return words.length > 3 ? words.slice(0, 3).join(' ') + '…' : fullName;
                          })()}
                        </div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-3)', fontFamily: 'Lexend, sans-serif' }}>{cub.cub_id}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.grade || '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.stream || '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.segment || '—'}</td>
                      <td style={{ textAlign: 'center' }}><SubStatusBadge status={cub.sub_status} /></td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', textAlign: 'center' }}>
                        {cub.sub_end_date ? formatDate(cub.sub_end_date) : '—'}
                      </td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.no_sub_days ?? '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.orientation_stage || '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.orientation_stage_status || '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.orientation_next_stage || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem', textAlign: 'center' }}>
                        {cub.orientation_completion_date ? formatDate(cub.orientation_completion_date) : '—'}
                      </td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.flag || '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.current_streak || 0}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.streak_label || '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.current_league || '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.cum_term_points ?? cub.cumulative_points ?? 0}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.cumulative_weekly_points || 0}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.handled_by_last || '—'}</td>
                      <td style={{ fontSize: '0.82rem', textAlign: 'center', maxWidth: '200px' }}>
                        <div style={{ 
                          overflow: 'hidden', 
                          textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap',
                          maxWidth: '200px'
                        }} title={cub.purpose_last || '—'}>
                          {cub.purpose_last || '—'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={cubPage} total={filteredCubs.length} pageSize={PAGE_SIZE} onChange={setCubPage} />
        </div>
        )
      )}

      {tab === 'families' && (
        (!families || loadingTab === 'families') ? (
          <div className={sharedStyles.tableWrap}>
            <SkeletonTable
              rows={12}
              columns={[
                { header: 'Parent Name', width: '28%' },
                { header: 'No. Cubs', width: '14%', align: 'center' },
                { header: 'Phone', width: '18%' },
                { header: 'WhatsApp', width: '18%' },
                { header: 'Email', width: '22%' },
              ]}
              showSearch={true}
              showFilters={true}
            />
          </div>
        ) : (
          <div className={sharedStyles.tableWrap}>
            <div className={sharedStyles.tableControls}>
              <div className={sharedStyles.tableControlsLeft} style={{ flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ position: 'relative', flex: '0 0 auto' }}>
                  <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                  <input className={sharedStyles.searchInput} style={{ paddingLeft: '2rem' }} placeholder="Search by name or contact..."
                    value={famSearch} onChange={e => { setFamSearch(e.target.value); setFamPage(1); }} />
                </div>
                <DirectoryFamilyFilter
                  allSchools={allFamilySchools}
                  allSegments={allFamilySegments.length > 0 ? allFamilySegments : ['Gen. Comm', 'CDLS', 'RCS']}
                  allReps={allFamilyReps}
                  value={famFilters}
                  onChange={(next) => { setFamFilters(next); setFamPage(1); }}
                  onReset={resetFamFilters}
                  totalActive={famFiltersActive}
                />
              </div>
              <div className={sharedStyles.tableControlsRight}>
                <span className={sharedStyles.sectionCount}>{filteredFamilies.length} of {(families ?? []).length}</span>
              </div>
            </div>

            {paginatedFamilies.length === 0 ? (
              <div className={sharedStyles.emptyState}>
                <div className={sharedStyles.emptyStateTitle}>No families found</div>
                <div className={sharedStyles.emptyStateSub}>Try adjusting your search or filters</div>
              </div>
            ) : (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <table className={sharedStyles.table}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Parent Name</th>
                      <th>No. Cubs</th>
                      <th>Phone</th>
                      <th>WhatsApp</th>
                      <th>Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFamilies.map(fam => (
                      <tr key={fam.id} onClick={() => setSelectedFamily(fam)} style={{ cursor: 'pointer' }} className={sharedStyles.tableRowHover}>
                        <td style={{ fontWeight: 600, textAlign: 'left' }}>{fam.parent_first_name} {fam.parent_last_name}</td>
                        <td><span className={`${sharedStyles.badge} ${sharedStyles.badgePrimary}`}>{fam.no_cubs}</span></td>
                        <td style={{ fontSize: '0.82rem' }}>{fam.parent_phone || '—'}</td>
                        <td style={{ fontSize: '0.82rem' }}>{fam.parent_whatsapp || '—'}</td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-2)' }}>{fam.parent_email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={famPage} total={filteredFamilies.length} pageSize={PAGE_SIZE} onChange={setFamPage} />
          </div>
        )
      )}

      {selectedCub && <CubProfileDrawer cub={selectedCub} onClose={() => setSelectedCub(null)} />}
      {selectedFamily && <FamilyDrawer family={selectedFamily} onClose={() => setSelectedFamily(null)} />}
    </div>
  );
}
