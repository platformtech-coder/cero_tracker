'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import {
  X, User, Phone, MessageCircle, Mail, Clock, Plus,
  Pencil, CheckCircle2, AlertCircle, Loader2, BookMarked, Globe
} from 'lucide-react';
import type { Interaction, Action, ContactEditRequest } from '@/lib/types';
import { getCubActivity, getCubById } from '@/lib/actions/directory';
import { getCubReadingAudit, type ReadingAuditResult } from '@/lib/actions/perbicubs-api';
import { savePreferredLanguage } from '@/lib/actions/update-profile';
import { submitContactEditRequest, getPendingRequestForEntity } from '@/lib/actions/edit-requests';
import { useInteractionStore } from '@/lib/store';
import { formatDate } from '@/lib/utils/date';
import { toast } from 'sonner';

import sharedStyles from '@/components/ui/dashboard.module.css';
import tabStyles from '@/app/(auth)/engagements/engagements.module.css';

const EDIT_INPUT: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-input)',
  color: 'var(--text-1)', fontSize: '0.85rem', outline: 'none',
  transition: 'border-color 0.15s',
};

const EDIT_LABEL: React.CSSProperties = {
  display: 'block', fontSize: '0.7rem', fontWeight: 700,
  color: 'var(--text-3)', textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: '0.3rem',
};

function SubStatusBadge({ status }: { status: string }) {
  const cls = status === 'active' ? sharedStyles.badgeGreen
    : status === 'expired' ? sharedStyles.badgeRed
    : sharedStyles.badgeOrange;
  const displayStatus = (status || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return <span className={`${sharedStyles.badge} ${cls}`}>{displayStatus}</span>;
}

export interface CubProfileDrawerProps {
  cub?: any;
  cubId?: string;
  onClose: () => void;
  onUpdated?: (updated: Partial<any>) => void;
  readOnly?: boolean;
}

export default function CubProfileDrawer({
  cub: initialCub,
  cubId,
  onClose,
  onUpdated,
  readOnly = false,
}: CubProfileDrawerProps) {
  const [cub, setCub] = useState<any>(initialCub || null);
  const [loadingCub, setLoadingCub] = useState(!initialCub && Boolean(cubId));

  const [tab, setTab] = useState<'overview' | 'activity' | 'email' | 'reading_audit'>('overview');
  const [isEditing, setIsEditing] = useState(false);
  const [activityTab, setActivityTab] = useState<'interactions' | 'actions'>('interactions');
  const [activity, setActivity] = useState<{ interactions: Interaction[]; actions: Action[]; email_history?: any }>({
    interactions: [],
    actions: [],
  });
  const [loadingActivity, setLoadingActivity] = useState(true);
  const openInteractionDrawer = useInteractionStore(state => state.openDrawer);

  // Reading Audit state
  const [auditStart, setAuditStart] = useState('');
  const [auditEnd, setAuditEnd] = useState('');
  const [auditResult, setAuditResult] = useState<ReadingAuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditPending, startAuditTransition] = useTransition();

  // If initialCub changed, update cub
  useEffect(() => {
    if (initialCub) {
      setCub(initialCub);
    }
  }, [initialCub]);

  // If no cub was passed or incomplete cub, fetch cub by cubId
  useEffect(() => {
    const targetId = cubId || initialCub?.cub_id;
    if (!initialCub && targetId) {
      setLoadingCub(true);
      getCubById(targetId)
        .then(res => {
          if (res) setCub(res);
        })
        .finally(() => setLoadingCub(false));
    }
  }, [cubId, initialCub]);

  // ── Unified Edit State ──
  const [editForm, setEditForm] = useState({
    cub_first_name:            cub?.cub_first_name            ?? '',
    cub_last_name:             cub?.cub_last_name             ?? '',
    grade:                     cub?.grade                     ?? '',
    stream:                    cub?.stream                    ?? '',
    school_name:               cub?.school_name               ?? '',
    parent_first_name:         cub?.parent_first_name         ?? '',
    parent_last_name:          cub?.parent_last_name          ?? '',
    parent_phone:              cub?.parent_phone              ?? '',
    parent_email:              (cub?.parent_email && cub.parent_email !== '-' && cub.parent_email.includes('@')) ? cub.parent_email : '',
    preferred_language:        cub?.preferred_language        ?? '',
    alternative_contact_name:  cub?.alternative_contact_name  ?? '',
    alternative_contact_phone: cub?.alternative_contact_phone ?? '',
  });

  useEffect(() => {
    if (cub) {
      setEditForm({
        cub_first_name:            cub.cub_first_name            ?? '',
        cub_last_name:             cub.cub_last_name             ?? '',
        grade:                     cub.grade                     ?? '',
        stream:                    cub.stream                    ?? '',
        school_name:               cub.school_name               ?? '',
        parent_first_name:         cub.parent_first_name         ?? '',
        parent_last_name:          cub.parent_last_name          ?? '',
        parent_phone:              cub.parent_phone              ?? '',
        parent_email:              (cub.parent_email && cub.parent_email !== '-' && cub.parent_email.includes('@')) ? cub.parent_email : '',
        preferred_language:        cub.preferred_language        ?? '',
        alternative_contact_name:  cub.alternative_contact_name  ?? '',
        alternative_contact_phone: cub.alternative_contact_phone ?? '',
      });
    }
  }, [cub]);

  const [saving, startSave] = useTransition();
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pendingReq, setPendingReq] = useState<ContactEditRequest | null>(null);

  useEffect(() => {
    if (cub?.cub_id && !readOnly) {
      getPendingRequestForEntity('cub', cub.cub_id).then(setPendingReq);
    }
  }, [cub?.cub_id, readOnly]);

  const handleSave = () => {
    if (readOnly) return;
    setSaveResult(null);
    startSave(async () => {
      const res = await submitContactEditRequest({
        entityType: 'cub',
        entityId: cub.cub_id,
        entityName: `${editForm.cub_first_name} ${editForm.cub_last_name}`.trim() || cub.cub_id,
        currentData: {
          cub_first_name: cub.cub_first_name ?? '',
          cub_last_name: cub.cub_last_name ?? '',
          grade: cub.grade ?? '',
          stream: cub.stream ?? '',
          school_name: cub.school_name ?? '',
          parent_first_name: cub.parent_first_name ?? '',
          parent_last_name: cub.parent_last_name ?? '',
          parent_phone: cub.parent_phone ?? '',
          parent_email: cub.parent_email ?? '',
          preferred_language: cub.preferred_language ?? '',
          alternative_contact_name: cub.alternative_contact_name ?? '',
          alternative_contact_phone: cub.alternative_contact_phone ?? '',
        },
        proposedData: editForm,
      });

      if (res.success) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('cero:refresh-notifications'));
        }
        if (res.autoApplied) {
          const updated = { ...editForm };
          setCub((prev: any) => ({ ...prev, ...updated }));
          if (onUpdated) onUpdated(updated);
          const sheetMsg = res.sheetSynced ? ' ✓ Sheet updated.' : res.sheetError ? ` (Sheet: ${res.sheetError})` : '';
          setSaveResult({ ok: true, msg: `Saved successfully.${sheetMsg}` });
          setTimeout(() => setIsEditing(false), 1200);
        } else {
          setSaveResult({ ok: true, msg: res.msg });
          getPendingRequestForEntity('cub', cub.cub_id).then(setPendingReq);
          setTimeout(() => setIsEditing(false), 2500);
        }
      } else {
        setSaveResult({ ok: false, msg: res.error });
      }
    });
  };

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
    if (!cub?.cub_id) return;
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

  if (!cub && !loadingCub) return null;

  return (
    <>
      <div className={`${sharedStyles.drawerOverlay} ${sharedStyles.drawerOverlayActive}`} onClick={onClose} />
      <div className={`${sharedStyles.drawer} ${sharedStyles.drawerActive}`}>
        {/* Header */}
        <div className={sharedStyles.drawerHeader}>
          <h2 className={sharedStyles.drawerTitle}>Cub Profile</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!readOnly && (
              <>
                <button
                  type="button"
                  className={`${sharedStyles.btn} ${isEditing ? sharedStyles.btnPrimary : sharedStyles.btnOutline}`}
                  style={{ padding: '7px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={() => { setIsEditing(prev => !prev); setSaveResult(null); }}
                  title={isEditing ? 'Cancel editing' : 'Edit profile'}
                >
                  <Pencil size={13} /> {isEditing ? 'Cancel' : 'Edit'}
                </button>
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
              </>
            )}
            <button className={sharedStyles.drawerClose} onClick={onClose} title="Close drawer">
              <X size={18}/>
            </button>
          </div>
        </div>

        <div className={sharedStyles.drawerBody}>
          {loadingCub ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem', gap: '0.75rem', color: 'var(--text-3)' }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
              <div style={{ fontSize: '0.85rem' }}>Loading cub profile...</div>
            </div>
          ) : isEditing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
              {saveResult && (
                <div style={{
                  background: saveResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${saveResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.82rem',
                  color: saveResult.ok ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)',
                  display: 'flex', gap: '0.5rem', alignItems: 'center',
                }}>
                  {saveResult.ok ? <CheckCircle2 size={15} style={{ flexShrink: 0 }} /> : <AlertCircle size={15} style={{ flexShrink: 0 }} />}
                  <span>{saveResult.msg}</span>
                </div>
              )}

              {pendingReq && (
                <div style={{
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.3)',
                  borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.82rem',
                  color: 'var(--yellow, #eab308)',
                  display: 'flex', gap: '0.5rem', alignItems: 'center',
                }}>
                  <Clock size={15} style={{ flexShrink: 0 }} />
                  <span>An edit request for this cub was submitted by <strong>{pendingReq.requester_name}</strong> and is currently awaiting Admin approval.</span>
                </div>
              )}

              {/* Cub Information */}
              <div className={sharedStyles.drawerSection} style={{ marginBottom: 0 }}>
                <div className={sharedStyles.drawerSectionTitle} style={{ marginBottom: 12 }}>Cub Details</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={EDIT_LABEL}>Cub First Name</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.cub_first_name}
                      onChange={e => setEditForm(prev => ({ ...prev, cub_first_name: e.target.value }))}
                      placeholder="First Name"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label style={EDIT_LABEL}>Cub Last Name</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.cub_last_name}
                      onChange={e => setEditForm(prev => ({ ...prev, cub_last_name: e.target.value }))}
                      placeholder="Last Name"
                      disabled={saving}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={EDIT_LABEL}>Grade</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.grade}
                      onChange={e => setEditForm(prev => ({ ...prev, grade: e.target.value }))}
                      placeholder="e.g. Grade 3"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label style={EDIT_LABEL}>Stream</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.stream}
                      onChange={e => setEditForm(prev => ({ ...prev, stream: e.target.value }))}
                      placeholder="e.g. Stream A"
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label style={EDIT_LABEL}>School Name</label>
                  <input
                    style={EDIT_INPUT}
                    value={editForm.school_name}
                    onChange={e => setEditForm(prev => ({ ...prev, school_name: e.target.value }))}
                    placeholder="School Name"
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Parent & Emergency Contact */}
              <div className={sharedStyles.drawerSection} style={{ marginBottom: 0 }}>
                <div className={sharedStyles.drawerSectionTitle} style={{ marginBottom: 12 }}>Parent & Emergency Contact</div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={EDIT_LABEL}>Parent First Name</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.parent_first_name}
                      onChange={e => setEditForm(prev => ({ ...prev, parent_first_name: e.target.value }))}
                      placeholder="First Name"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label style={EDIT_LABEL}>Parent Last Name</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.parent_last_name}
                      onChange={e => setEditForm(prev => ({ ...prev, parent_last_name: e.target.value }))}
                      placeholder="Last Name"
                      disabled={saving}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={EDIT_LABEL}>Parent Phone Number</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.parent_phone}
                      onChange={e => setEditForm(prev => ({ ...prev, parent_phone: e.target.value }))}
                      placeholder="e.g. +233..."
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label style={EDIT_LABEL}>Parent Email</label>
                    <input
                      style={EDIT_INPUT}
                      type="email"
                      value={editForm.parent_email}
                      onChange={e => setEditForm(prev => ({ ...prev, parent_email: e.target.value }))}
                      placeholder="parent@example.com"
                      disabled={saving}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={EDIT_LABEL}>Preferred Mode of Language</label>
                  <select
                    style={EDIT_INPUT}
                    value={editForm.preferred_language}
                    onChange={e => setEditForm(prev => ({ ...prev, preferred_language: e.target.value }))}
                    disabled={saving}
                  >
                    <option value="">Select Language...</option>
                    <option value="English">English</option>
                    <option value="Twi">Twi</option>
                    <option value="Ga">Ga</option>
                    <option value="Ewe">Ewe</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={EDIT_LABEL}>Alternative Contact Name</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.alternative_contact_name}
                      onChange={e => setEditForm(prev => ({ ...prev, alternative_contact_name: e.target.value }))}
                      placeholder="e.g. Uncle Kwame / Aunty Jane"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label style={EDIT_LABEL}>Alternative Number</label>
                    <input
                      style={EDIT_INPUT}
                      value={editForm.alternative_contact_phone}
                      onChange={e => setEditForm(prev => ({ ...prev, alternative_contact_phone: e.target.value }))}
                      placeholder="e.g. +233..."
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  className={`${sharedStyles.btn} ${sharedStyles.btnPrimary}`}
                  onClick={handleSave}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.55rem 1.4rem' }}
                >
                  {saving ? <Loader2 size={14} className={sharedStyles.spin} /> : <CheckCircle2 size={14} />}
                  <span>{saving ? 'Submitting...' : 'Submit Changes'}</span>
                </button>
                <button
                  type="button"
                  className={`${sharedStyles.btn} ${sharedStyles.btnOutline}`}
                  onClick={() => setIsEditing(false)}
                  disabled={saving}
                  style={{ padding: '0.55rem 1.2rem' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <div className={sharedStyles.drawerSectionTitle} style={{ margin: 0 }}>Parent & Emergency Contact</div>
                  {/* Vantage Point: Parent Language quick dropdown */}
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    padding: '2px 6px', borderRadius: '6px',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border)',
                  }}>
                    <Globe size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                    <select
                      value={editForm.preferred_language || cub.preferred_language || ''}
                      disabled={readOnly}
                      onChange={async (e) => {
                        if (readOnly) return;
                        const newLang = e.target.value;
                        setEditForm(prev => ({ ...prev, preferred_language: newLang }));
                        if (cub?.cub_id) {
                          const res = await savePreferredLanguage({ cubId: cub.cub_id, language: newLang });
                          if (res.success) {
                            toast.success(`Language updated to ${newLang}`);
                            setCub((prev: any) => ({ ...prev, preferred_language: newLang }));
                            if (onUpdated) onUpdated({ preferred_language: newLang });
                          } else {
                            toast.error(res.error || 'Failed to update language');
                          }
                        }
                      }}
                      style={{
                        padding: '2px 4px', border: 'none',
                        background: 'transparent', color: 'var(--text-1)', fontSize: '11.5px', fontWeight: 600,
                        fontFamily: 'inherit', cursor: readOnly ? 'default' : 'pointer', outline: 'none',
                      }}
                    >
                      <option value="">Language...</option>
                      <option value="English">English</option>
                      <option value="Twi">Twi</option>
                      <option value="Ga">Ga</option>
                      <option value="Ewe">Ewe</option>
                    </select>
                  </div>
                </div>
                <div className={sharedStyles.infoRow} style={{ flexWrap: 'wrap', gap: '8px 16px' }}>
                  <div className={sharedStyles.infoItem}><User size={13}/> <strong>{cub.parent_first_name} {cub.parent_last_name}</strong></div>
                  <div className={sharedStyles.infoItem}><Phone size={13}/> <strong>{cub.parent_phone || '—'}</strong></div>
                  <div className={sharedStyles.infoItem}><MessageCircle size={13}/> <strong>{cub.parent_whatsapp || '—'}</strong></div>
                  <div className={sharedStyles.infoItem}><Mail size={13}/> <strong>{(cub.parent_email && cub.parent_email !== '-' && cub.parent_email.includes('@')) ? cub.parent_email : '—'}</strong></div>
                  {cub.alternative_contact_name && (
                    <div className={sharedStyles.infoItem}>
                      <Phone size={13} style={{ color: 'var(--primary)' }}/>
                      <span>Alt Contact: <strong>{cub.alternative_contact_name}</strong> {cub.alternative_contact_phone ? `(${cub.alternative_contact_phone})` : ''}</span>
                    </div>
                  )}
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
                      <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal} style={{ fontSize: 13 }}>{cub.medallion_status || cub.medallion || '—'}</div><div className={sharedStyles.statChipLbl}>Medallion</div></div>
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
                  ) : activityTab === 'interactions' ? (
                    activity.interactions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)' }}>No interactions logged yet</div>
                    ) : (
                      <div className={sharedStyles.timeline}>
                        {activity.interactions.map(item => (
                          <div key={item.id} className={sharedStyles.timelineItem}>
                            <div className={sharedStyles.timelineDate}>{formatDate(item.date)}</div>
                            <div className={sharedStyles.timelineContent}>
                              <div className={sharedStyles.timelineHeader}>
                                <strong>{item.type}</strong>
                                <span className={sharedStyles.timelinePurpose}>({item.purpose})</span>
                                <span className={sharedStyles.timelineRep}>by {item.handled_by}</span>
                              </div>
                              {item.feedback && <div className={sharedStyles.timelineFeedback}>{item.feedback}</div>}
                              {item.action_required === 'Yes' && (
                                <div className={sharedStyles.timelineAction}>
                                  Action: {item.action} (Due: {item.action_deadline ? formatDate(item.action_deadline) : '—'})
                                  <span className={`${sharedStyles.badge} ${sharedStyles.badgeOrange}`}>{item.action_status}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    activity.actions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)' }}>No pending actions</div>
                    ) : (
                      <div className={sharedStyles.timeline}>
                        {activity.actions.map(action => (
                          <div key={action.id} className={sharedStyles.timelineItem}>
                            <div className={sharedStyles.timelineDate}>Due: {action.action_deadline ? formatDate(action.action_deadline) : '—'}</div>
                            <div className={sharedStyles.timelineContent}>
                              <div className={sharedStyles.timelineHeader}>
                                <strong>{action.action}</strong>
                                <span className={`${sharedStyles.badge} ${sharedStyles.badgeOrange}`}>{action.action_status}</span>
                              </div>
                              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                                Assigned to {action.handled_by} · Purpose: {action.purpose}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}

              {tab === 'email' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  {!activity.email_history ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)' }}>No email history found</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className={sharedStyles.drawerSection}>
                        <div className={sharedStyles.drawerSectionTitle}>Summary</div>
                        <div className={sharedStyles.statChips}>
                          <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{activity.email_history.total_sent || 0}</div><div className={sharedStyles.statChipLbl}>Total Sent</div></div>
                          <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{activity.email_history.open_rate || '0%'}</div><div className={sharedStyles.statChipLbl}>Open Rate</div></div>
                          <div className={sharedStyles.statChip}><div className={sharedStyles.statChipVal}>{activity.email_history.click_rate || '0%'}</div><div className={sharedStyles.statChipLbl}>Click Rate</div></div>
                        </div>
                      </div>
                      <div className={sharedStyles.drawerSection}>
                        <div className={sharedStyles.drawerSectionTitle}>Last Email</div>
                        <div style={{ background: 'var(--bg-input)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                          <div><strong>Subject:</strong> {activity.email_history.last_email_subject || '—'}</div>
                          <div style={{ marginTop: 4, color: 'var(--text-2)' }}><strong>Date:</strong> {activity.email_history.last_email_date ? formatDate(activity.email_history.last_email_date) : '—'}</div>
                          <div style={{ marginTop: 4, color: 'var(--text-2)' }}><strong>Status:</strong> {activity.email_history.last_email_status || '—'}</div>
                        </div>
                      </div>
                    </div>
                  )}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
