'use client';

import { useState, useTransition, useCallback } from 'react';
import { X, Plus, RefreshCw, Search, CheckCircle, AlertCircle, Calendar, Trash2, ExternalLink } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import type { Interaction, Action, Profile } from '@/lib/types';
import type { CubSearchResult } from '@/lib/actions/engagements';
import { editInteraction, submitInteraction, searchCubs, getLinkedAction } from '@/lib/actions/engagements';
import { toast } from 'sonner';
import sharedStyles from '@/components/ui/dashboard.module.css';
import styles from '@/app/(auth)/engagements/engagements.module.css';

function fmtDate(val: string | null, withTime = false) {
  if (!val) return '—';
  try {
    const d = parseISO(val);
    return isValid(d) ? format(d, withTime ? 'dd-MMM-yy hh:mm a' : 'dd-MMM-yy') : val;
  } catch { return val; }
}

interface InteractionDrawerProps {
  mode: 'log' | 'edit' | 'view';
  initial?: Interaction | null;
  dropdowns: Record<string, string[]>;
  profile: Profile;
  onClose: () => void;
  onSuccess: (data: Interaction | null, isEdit: boolean) => void;
  onDelete?: (id: string) => void;
  onOpenFollowUp?: (action: Action) => void;
}

export function InteractionDrawer({ mode, initial, dropdowns, profile, onClose, onSuccess, onDelete, onOpenFollowUp }: InteractionDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);

  const handleOpenFollowUp = async () => {
    if (!initial) return;
    setLoadingFollowUp(true);
    try {
      const act = await getLinkedAction(initial.id);
      if (act) {
        onClose();
        onOpenFollowUp?.(act);
      } else {
        const fallbackAction: Action = {
          id: 0,
          interaction_id: initial.id,
          date: initial.date,
          parent_first_name: initial.parent_first_name,
          parent_last_name: initial.parent_last_name,
          cub_id: initial.cub_id,
          cub_first_name: initial.cub_first_name,
          cub_last_name: initial.cub_last_name,
          handled_by: initial.handled_by,
          type: initial.type,
          purpose: initial.purpose,
          status: initial.status,
          feedback: initial.feedback,
          action_required: 'Yes',
          action: initial.action || '',
          action_deadline: initial.action_deadline,
          action_status: (initial.action_status || 'Pending') as any,
          overdue_status: 'No',
          logged_by: initial.logged_by,
          created_at: initial.created_at,
          updated_at: initial.created_at,
        };
        onClose();
        onOpenFollowUp?.(fallbackAction);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to open follow-up drawer');
    } finally {
      setLoadingFollowUp(false);
    }
  };

  // Cub search state
  const [cubQuery, setCubQuery] = useState(
    initial ? `${initial.cub_first_name} ${initial.cub_last_name}`.trim() : ''
  );
  const [cubResults, setCubResults] = useState<CubSearchResult[]>([]);
  const [selectedCub, setSelectedCub] = useState<CubSearchResult | null>(
    initial
      ? {
          cubId: initial.cub_id,
          cubFirstName: initial.cub_first_name,
          cubLastName: initial.cub_last_name,
          parentFirstName: initial.parent_first_name,
          parentLastName: initial.parent_last_name,
          parentPhone: '',
          preferredLanguage: '',
          repName: '',
          isOwnContact: true,
        }
      : null
  );

  const isRep = profile.role !== 'admin' && !!(profile.sheet_rep_name || profile.full_name);
  const defaultRepName = profile.sheet_rep_name || profile.full_name || '';

  const [form, setForm] = useState({
    handled_by: initial?.handled_by ?? (isRep ? defaultRepName : ''),
    type: initial?.type ?? '',
    purpose: initial?.purpose ?? '',
    status: initial?.status ?? '',
    feedback: initial?.feedback ?? '',
    action_required: (initial?.action_required ?? 'No') as 'Yes' | 'No',
    action: initial?.action ?? '',
    action_deadline: initial?.action_deadline ? initial.action_deadline.slice(0, 10) : '',
    action_status: initial?.action_status ?? '',
    message_sent: initial?.message_sent ?? '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleCubSearch = useCallback(async (q: string) => {
    setCubQuery(q);
    if (q.length < 2) { setCubResults([]); return; }
    const res = await searchCubs(q, true);
    setCubResults(res);
  }, []);

  const handleSelectCub = (cub: CubSearchResult) => {
    setSelectedCub(cub);
    setCubQuery(`${cub.cubFirstName} ${cub.cubLastName}`);
    setCubResults([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCub) { setError('Please select a cub.'); return; }
    setError('');

    startTransition(async () => {
      const base = {
        cub_id: selectedCub.cubId,
        cub_first_name: selectedCub.cubFirstName,
        cub_last_name: selectedCub.cubLastName,
        parent_first_name: selectedCub.parentFirstName,
        parent_last_name: selectedCub.parentLastName,
        ...form,
      };

      let res;
      if (mode === 'edit' && initial) {
        res = await editInteraction({ id: initial.id, ...base });
      } else {
        res = await submitInteraction(base);
      }

      if (res.error) { 
        setError(res.error); 
        toast.error(res.error);
        return; 
      }
      toast.success(mode === 'edit' ? 'Interaction updated!' : 'Interaction logged successfully!');
      onSuccess('interaction' in res ? (res.interaction as Interaction) : null, mode === 'edit');
      onClose();
    });
  };

  return (
    <>
      {/* Overlay backdrop */}
      <div
        className={`${sharedStyles.drawerOverlay} ${sharedStyles.drawerOverlayActive}`}
        onClick={onClose}
      />
      <div
        className={`${sharedStyles.drawer} ${sharedStyles.drawerActive}`}
        style={{ maxWidth: '560px' }}
      >
        {/* Header */}
        <div className={sharedStyles.drawerHeader}>
          <h2 className={sharedStyles.drawerTitle}>
            {mode === 'view' ? 'Interaction Details' : mode === 'edit' ? 'Edit Interaction' : 'Log Interaction'}
          </h2>
          <button className={sharedStyles.drawerClose} onClick={onClose}><X size={18} /></button>
        </div>

        <div className={sharedStyles.drawerBody}>
          {mode === 'view' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Cub & Parent Card */}
              <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  Cub & Parent
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
                  {selectedCub?.cubFirstName} {selectedCub?.cubLastName}{' '}
                  <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500, fontFamily: 'monospace' }}>({selectedCub?.cubId})</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>
                  Parent: <strong style={{ color: 'var(--text-1)' }}>{selectedCub?.parentFirstName} {selectedCub?.parentLastName}</strong>
                </div>
              </div>

              {/* Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Date & Time</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginTop: 3 }}>
                    {initial?.date ? fmtDate(initial.date, true) : '—'}
                  </div>
                </div>

                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Handled By</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginTop: 3 }}>
                    {form.handled_by || '—'}
                  </div>
                </div>

                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Type</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginTop: 3 }}>
                    {form.type || '—'}
                  </div>
                </div>

                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Status</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginTop: 3 }}>
                    {form.status || '—'}
                  </div>
                </div>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Purpose</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginTop: 3 }}>
                  {form.purpose || '—'}
                </div>
              </div>

              {form.message_sent && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--primary-dim)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>Message Sent</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', marginTop: 3 }}>
                    {form.message_sent}
                  </div>
                </div>
              )}

              <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Feedback / Notes</div>
                <div style={{ fontSize: 13, color: 'var(--text-1)', marginTop: 6, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {form.feedback || 'No feedback or notes recorded.'}
                </div>
              </div>

              {(form.action_required === 'Yes' || Boolean(form.action && form.action.trim())) && (
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Action Required
                    </div>
                    {onOpenFollowUp && (
                      <button
                        type="button"
                        onClick={handleOpenFollowUp}
                        disabled={loadingFollowUp}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 6,
                          border: '1px solid var(--orange)',
                          background: 'var(--orange-dim)',
                          color: 'var(--orange)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: loadingFollowUp ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                        title="Open follow-up drawer to update action"
                      >
                        {loadingFollowUp ? <RefreshCw size={12} className={styles.spin} /> : <ExternalLink size={13} />}
                        <span>Update Action</span>
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                    {form.action}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-2)' }}>
                    {form.action_deadline && (
                      <span>Deadline: <strong style={{ color: 'var(--text-1)' }}>{fmtDate(form.action_deadline)}</strong></span>
                    )}
                    {form.action_status && (
                      <span>Status: <strong style={{ color: 'var(--text-1)' }}>{form.action_status}</strong></span>
                    )}
                  </div>
                </div>
              )}

              <div className={styles.modalFooter} style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', marginTop: 12 }}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>Close</button>
                {onDelete && initial && profile.role !== 'viewer' && (
                  <button
                    type="button"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '0.55rem 1.25rem',
                      borderRadius: 8,
                      border: '1px solid var(--red)',
                      background: 'var(--red)',
                      color: '#ffffff',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onClick={() => onDelete(initial.id)}
                    title="Delete interaction log and linked actions"
                  >
                    <Trash2 size={14} />
                    <span>Delete</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.modalBody}>
            {/* Cub Search */}
            <div className={styles.formSection}>
              <label className={styles.formLabel}>Cub *</label>
              <div style={{ position: 'relative' }}>
                <input
                  className={styles.formInput}
                  value={cubQuery}
                  onChange={e => handleCubSearch(e.target.value)}
                  placeholder="Search by name, ID, or phone..."
                  autoComplete="off"
                  disabled={mode === 'edit'}
                />
                {cubResults.length > 0 && (
                  <div className={styles.cubDropdown}>
                    {cubResults.map(c => (
                      <div key={c.cubId} className={styles.cubDropdownItem} onClick={() => handleSelectCub(c)}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 600 }}>{c.cubFirstName} {c.cubLastName} <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>({c.cubId})</span></span>
                          {c.repName && (
                            <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: 4, background: c.isOwnContact ? 'var(--primary-dim)' : 'var(--bg-input)', color: c.isOwnContact ? 'var(--primary)' : 'var(--text-3)', fontWeight: 600 }}>
                              Rep: {c.repName}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: 2 }}>{c.parentFirstName} {c.parentLastName} {c.parentPhone ? `· ${c.parentPhone}` : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Handled By *</label>
                {isRep ? (
                  <input 
                    type="text" 
                    className={styles.formInput} 
                    value={form.handled_by || defaultRepName} 
                    readOnly 
                    disabled
                    style={{ opacity: 0.85, cursor: 'not-allowed', background: 'var(--bg-card)', fontWeight: 600 }}
                    title="Automatically assigned to your rep account"
                  />
                ) : (
                  <select className={styles.formInput} value={form.handled_by} onChange={e => set('handled_by', e.target.value)} required>
                    <option value="">Select Rep...</option>
                    {(dropdowns.handled_by ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Type *</label>
                <select className={styles.formInput} value={form.type} onChange={e => set('type', e.target.value)} required>
                  <option value="">Select...</option>
                  {(dropdowns.type ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Purpose *</label>
                <select className={styles.formInput} value={form.purpose} onChange={e => set('purpose', e.target.value)} required>
                  <option value="">Select...</option>
                  {(dropdowns.purpose ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Status</label>
                <select className={styles.formInput} value={form.status} onChange={e => {
                  set('status', e.target.value);
                  if (e.target.value.toLowerCase() === 'reached') {
                    set('message_sent', '');
                  }
                }}>
                  <option value="">Select...</option>
                  {(dropdowns.status ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Conditional Message Sent for Unreached Calls */}
            {form.type.toLowerCase().includes('call') && form.status && form.status.toLowerCase() !== 'reached' && (
              <div className={styles.formGroup} style={{ background: 'var(--primary-dim)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(13, 148, 136, 0.25)' }}>
                <label className={styles.formLabel} style={{ color: 'var(--primary)', marginBottom: '4px' }}>Was a message sent?</label>
                <select
                  className={styles.formInput}
                  value={form.message_sent}
                  onChange={e => set('message_sent', e.target.value)}
                  style={{ background: 'var(--bg-card)', borderColor: 'var(--primary)' }}
                >
                  <option value="">No message sent</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="SMS">SMS</option>
                  <option value="Email">Email</option>
                </select>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Feedback / Notes</label>
              <textarea className={styles.formInput} rows={3} value={form.feedback} onChange={e => set('feedback', e.target.value)} style={{ resize: 'vertical' }} />
            </div>

            {/* Action Required */}
            <div className={styles.formSection} style={{ background: 'var(--bg)', borderRadius: 8, padding: '1rem', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: form.action_required === 'Yes' ? '1rem' : 0 }}>
                <label className={styles.formLabel} style={{ margin: 0 }}>Action Required?</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['No', 'Yes'] as const).map(v => (
                    <button key={v} type="button"
                      className={form.action_required === v ? styles.toggleActive : styles.toggleInactive}
                      onClick={() => set('action_required', v)}
                    >{v}</button>
                  ))}
                </div>
              </div>

              {form.action_required === 'Yes' && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Action Description *</label>
                    <input className={styles.formInput} value={form.action} onChange={e => set('action', e.target.value)} placeholder="Describe the action required..." required />
                  </div>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Deadline</label>
                      <input type="date" className={styles.formInput} value={form.action_deadline} onChange={e => set('action_deadline', e.target.value)} />
                    </div>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Action Status</label>
                      <select className={styles.formInput} value={form.action_status} onChange={e => set('action_status', e.target.value)}>
                        <option value="Pending">Pending</option>
                        {(dropdowns.action_status ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>

            {error && <div className={styles.formError}>{error}</div>}

            <div className={styles.modalFooter} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {mode === 'edit' && onDelete && initial ? (
                <button
                  type="button"
                  className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                  onClick={() => onDelete(initial.id)}
                  title="Delete interaction"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, borderRadius: 6 }}
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={isPending}>
                  {isPending ? <RefreshCw size={14} className={styles.spin} /> : <Plus size={14} />}
                  {isPending ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Log Interaction'}
                </button>
              </div>
            </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}