'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ChevronLeft, ChevronRight, X, User, Phone, MessageCircle, Mail, Clock, Plus, ExternalLink, Activity, AlertCircle, Baby, Users } from 'lucide-react';
import type { Cub, Family, Profile, Interaction, Action } from '@/lib/types';
import { getCubActivity, getCubsForFamily } from '@/lib/actions/directory';

import sharedStyles from '@/components/ui/dashboard.module.css';
import tabStyles from '../engagements/engagements.module.css';
import { useInteractionStore } from '@/lib/store';
import { formatDate } from '@/lib/utils/date';

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
  const [tab, setTab] = useState<'overview' | 'activity' | 'email'>('overview');
  const [activityTab, setActivityTab] = useState<'interactions' | 'actions'>('interactions');
  const [activity, setActivity] = useState<{ interactions: Interaction[]; actions: Action[]; email_history?: any }>({ interactions: [], actions: [] });
  const [loadingActivity, setLoadingActivity] = useState(true);
  const openInteractionDrawer = useInteractionStore(state => state.openDrawer);

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
          </div>

          {tab === 'overview' && (
            <div>
              {/* Reading Stats */}
              <div className={sharedStyles.drawerSection}>
                <div className={sharedStyles.drawerSectionTitle}>Reading Stats</div>
                <div className={sharedStyles.statChips} style={{ marginBottom: 8 }}>
                  <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{cub.cumulative_points || 0}</div><div className={sharedStyles.statChipLbl}>Total Points</div></div>
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
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)' }}>Loading activity...</div>
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

  if (!family) return null;

  // Load cubs from DB for this family
  useEffect(() => {
    setLoadingCubs(true);
    getCubsForFamily(family.parent_phone ?? null, family.parent_email ?? null).then(cubs => {
      setFamilyCubs(cubs);
      setLoadingCubs(false);
    });
  }, [family.parent_phone, family.parent_email]);

  // Fetch combined activity for all cubs in family
  useEffect(() => {
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
  }, [familyCubs, loadingCubs]);

  const handleCubClick = (cub: any) => {
    setSelectedCubForDrawer(cub);
  };

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
              <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '12px 0' }}>Loading cubs...</div>
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
  initialCubs: (Cub & { cub_first_name: string; cub_last_name: string })[];
  initialFamilies: Family[];
  profile: Profile;
  isAdmin?: boolean;
  allReps?: string[];
  currentRep?: string;
  dropdowns?: Record<string, string[]>;
}

export default function DirectoryClient({ initialCubs, initialFamilies, profile, isAdmin, allReps, currentRep, dropdowns }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: 'cubs' | 'families' = rawTab === 'families' ? 'families' : 'cubs';
  const setTab = useCallback((t: 'cubs' | 'families') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`/directory?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
  
  const [selectedCub, setSelectedCub] = useState<any | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<any | null>(null);

  // Cubs state
  const [cubSearch, setCubSearch] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState('');
  const [secondaryFilter, setSecondaryFilter] = useState('');
  const [tertiaryFilter, setTertiaryFilter] = useState('');
  const [cubPage, setCubPage] = useState(1);

  // Families state
  const [famSearch, setFamSearch] = useState('');
  const [famPage, setFamPage] = useState(1);

  const handlePrimaryFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPrimaryFilter(e.target.value);
    setSecondaryFilter('');
    setTertiaryFilter('');
    setCubPage(1);
  };

  const handleSecondaryFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSecondaryFilter(e.target.value);
    setTertiaryFilter('');
    setCubPage(1);
  };

  const secondaryOptions = useMemo(() => {
    if (!primaryFilter) return [];
    const uniqueValues = new Set<string>();
    initialCubs.forEach(c => {
      const val = c[primaryFilter as keyof typeof c];
      if (val) uniqueValues.add(String(val));
    });
    return Array.from(uniqueValues).sort();
  }, [primaryFilter, initialCubs]);

  const filteredCubs = useMemo(() => {
    const q = cubSearch.toLowerCase();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentDay = today.getDay(); // 0 (Sun) to 6 (Sat)
    
    // This Week: Sunday to Saturday
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - currentDay);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekStart.getDate() + 6);
    thisWeekEnd.setHours(23, 59, 59, 999);
    
    // Next Week: Next Sunday to Next Saturday
    const nextWeekStart = new Date(thisWeekEnd);
    nextWeekStart.setDate(thisWeekEnd.getDate() + 1);
    nextWeekStart.setHours(0, 0, 0, 0);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
    nextWeekEnd.setHours(23, 59, 59, 999);
    
    // This Month
    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

    return initialCubs.filter(c => {
      const matchesSearch = !q || `${c.cub_first_name} ${c.cub_last_name} ${c.cub_id} ${c.school_name ?? ''}`.toLowerCase().includes(q);
      const matchesFilter = !primaryFilter || !secondaryFilter || String(c[primaryFilter as keyof typeof c]) === secondaryFilter;
      
      let matchesTertiary = true;
      if (primaryFilter === 'sub_status' && secondaryFilter === 'almost expiring' && tertiaryFilter) {
        const endDate = c.sub_end_date ? new Date(c.sub_end_date) : null;
        if (!endDate) {
          matchesTertiary = false;
        } else {
          if (tertiaryFilter === 'this_week') {
            matchesTertiary = endDate >= thisWeekStart && endDate <= thisWeekEnd;
          } else if (tertiaryFilter === 'next_week') {
            matchesTertiary = endDate >= nextWeekStart && endDate <= nextWeekEnd;
          } else if (tertiaryFilter === 'this_month') {
            matchesTertiary = endDate >= thisMonthStart && endDate <= thisMonthEnd;
          }
        }
      }
      
      return matchesSearch && matchesFilter && matchesTertiary;
    });
  }, [initialCubs, cubSearch, primaryFilter, secondaryFilter, tertiaryFilter]);

  const paginatedCubs = filteredCubs.slice((cubPage - 1) * PAGE_SIZE, cubPage * PAGE_SIZE);

  const filteredFamilies = useMemo(() => {
    const q = famSearch.toLowerCase();
    return initialFamilies.filter(f =>
      !q || `${f.parent_first_name} ${f.parent_last_name} ${f.parent_phone ?? ''} ${f.parent_email ?? ''}`.toLowerCase().includes(q)
    );
  }, [initialFamilies, famSearch]);

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
        <div className={sharedStyles.tableWrap}>
          <div className={sharedStyles.tableControls}>
            <div className={sharedStyles.tableControlsLeft}>
              <div style={{ position: 'relative', flex: 0 }}>
                <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input className={sharedStyles.searchInput} style={{ paddingLeft: '2rem' }} placeholder="Search by name, ID, school..."
                  value={cubSearch} onChange={e => { setCubSearch(e.target.value); setCubPage(1); }} />
              </div>
              
              <select className={sharedStyles.filterSelect} value={primaryFilter} onChange={handlePrimaryFilterChange} style={{ width: '160px' }}>
                <option value="">All</option>
                <option value="segment">Segment</option>
                <option value="orientation_stage">Orientation Stage</option>
                <option value="sub_status">Sub Status</option>
                <option value="flag">Flag</option>
              </select>
              
              {primaryFilter && (
                <select className={sharedStyles.filterSelect} value={secondaryFilter} onChange={handleSecondaryFilterChange} style={{ width: '180px' }}>
                  <option value="">All {primaryFilter.replace('_', ' ')}</option>
                  {secondaryOptions.map(opt => <option key={opt} value={opt}>{opt.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>)}
                </select>
              )}
              
              {primaryFilter === 'sub_status' && secondaryFilter === 'almost expiring' && (
                <select className={sharedStyles.filterSelect} value={tertiaryFilter} onChange={e => { setTertiaryFilter(e.target.value); setCubPage(1); }} style={{ width: '180px' }}>
                  <option value="">Any Time</option>
                  <option value="this_week">This Week</option>
                  <option value="next_week">Next Week</option>
                  <option value="this_month">This Month</option>
                </select>
              )}
            </div>
            <div className={sharedStyles.tableControlsRight}>
              <span className={sharedStyles.sectionCount}>{filteredCubs.length} of {initialCubs.length}</span>
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
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                  <tr>
                    <th style={{ textAlign: 'left', position: 'sticky', top: 0, zIndex: 1 }}>Last Engagement</th>
                    <th style={{ textAlign: 'left', minWidth: '200px', position: 'sticky', top: 0, zIndex: 1 }}>Cub Name</th>
                    <th style={{ textAlign: 'center', minWidth: '70px' }}>Grade</th>
                    <th style={{ textAlign: 'center', minWidth: '80px' }}>Stream</th>
                    <th style={{ textAlign: 'center', minWidth: '120px' }}>Segment</th>
                    <th style={{ textAlign: 'center', minWidth: '100px' }}>Sub Status</th>
                    <th style={{ textAlign: 'center', minWidth: '100px' }}>Sub End Date</th>
                    <th style={{ textAlign: 'center', minWidth: '90px' }}>No. Sub Days</th>
                    <th style={{ textAlign: 'center', minWidth: '150px' }}>Ori. Stage</th>
                    <th style={{ textAlign: 'center', minWidth: '150px' }}>Ori. Stage Status</th>
                    <th style={{ textAlign: 'center', minWidth: '150px' }}>Ori. Next Stage</th>
                    <th style={{ textAlign: 'center', minWidth: '120px' }}>Ori. Completion Date</th>
                    <th style={{ textAlign: 'center', minWidth: '150px' }}>Flag</th>
                    <th style={{ textAlign: 'center', minWidth: '80px' }}>Curr. Streak</th>
                    <th style={{ textAlign: 'center', minWidth: '90px' }}>Streak Label</th>
                    <th style={{ textAlign: 'center', minWidth: '180px' }}>League</th>
                    <th style={{ textAlign: 'center', minWidth: '90px' }}>Cumm. Points</th>
                    <th style={{ textAlign: 'center', minWidth: '100px' }}>Weekly Points</th>
                    <th style={{ textAlign: 'center', minWidth: '100px' }}>Handled By</th>
                    <th style={{ textAlign: 'center', minWidth: '200px' }}>Purpose</th>
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
                      <td style={{ fontSize: '0.82rem', textAlign: 'center' }}>{cub.cumulative_points || 0}</td>
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
      )}

      {tab === 'families' && (
        <div className={sharedStyles.tableWrap}>
          <div className={sharedStyles.tableControls}>
            <div className={sharedStyles.tableControlsLeft}>
              <div style={{ position: 'relative', flex: 0 }}>
                <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
                <input className={sharedStyles.searchInput} style={{ paddingLeft: '2rem' }} placeholder="Search by name or contact..."
                  value={famSearch} onChange={e => { setFamSearch(e.target.value); setFamPage(1); }} />
              </div>
            </div>
            <div className={sharedStyles.tableControlsRight}>
              <span className={sharedStyles.sectionCount}>{filteredFamilies.length} of {initialFamilies.length}</span>
            </div>
          </div>

          {paginatedFamilies.length === 0 ? (
            <div className={sharedStyles.emptyState}>
              <div className={sharedStyles.emptyStateTitle}>No families found</div>
              <div className={sharedStyles.emptyStateSub}>Try adjusting your search</div>
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
      )}

      {selectedCub && <CubProfileDrawer cub={selectedCub} onClose={() => setSelectedCub(null)} />}
      {selectedFamily && <FamilyDrawer family={selectedFamily} onClose={() => setSelectedFamily(null)} />}
    </div>
  );
}
