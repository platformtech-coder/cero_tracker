'use client';

import { useState, useTransition, useCallback } from 'react';
import { X, Plus, RefreshCw, Search, CheckCircle, AlertCircle, Calendar } from 'lucide-react';
import type { Interaction, Profile } from '@/lib/types';
import type { CubSearchResult } from '@/lib/actions/engagements';
import { editInteraction, submitInteraction, searchCubs } from '@/lib/actions/engagements';
import { toast } from 'sonner';
import sharedStyles from '@/components/ui/dashboard.module.css';
import styles from '@/app/(auth)/engagements/engagements.module.css';

interface InteractionDrawerProps {
  mode: 'log' | 'edit';
  initial?: Interaction | null;
  dropdowns: Record<string, string[]>;
  profile: Profile;
  onClose: () => void;
  onSuccess: (data: Interaction | null, isEdit: boolean) => void;
}

export function InteractionDrawer({ mode, initial, dropdowns, profile, onClose, onSuccess }: InteractionDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

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
          <h2 className={sharedStyles.drawerTitle}>{mode === 'edit' ? 'Edit Interaction' : 'Log Interaction'}</h2>
          <button className={sharedStyles.drawerClose} onClick={onClose}><X size={18} /></button>
        </div>

        <div className={sharedStyles.drawerBody}>
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

          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={isPending}>
              {isPending ? <RefreshCw size={14} className={styles.spin} /> : <Plus size={14} />}
              {isPending ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Log Interaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}