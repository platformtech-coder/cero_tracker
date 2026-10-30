'use client';

import { useState, useTransition } from 'react';
import {
  X, RefreshCw, CheckCircle2, AlertCircle, Calendar, Phone, Clock
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import type { Action, Profile } from '@/lib/types';
import { submitActionFollowUp } from '@/lib/actions/engagements';
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

function ActionStatusBadge({ status, isOverdue }: { status: string; isOverdue: boolean }) {
  if (isOverdue || status === 'Overdue')
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeRed}`}><AlertCircle size={10} /> Overdue</span>;
  if (status === 'Completed')
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGreen}`}><CheckCircle2 size={10} /> Completed</span>;
  if (status === 'In Progress')
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeBlue}`}><Clock size={10} /> In Progress</span>;
  if (status === 'Not started')
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeOrange}`}><Clock size={10} /> Not started</span>;
  if (status === 'Cancelled')
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGray}`}>Cancelled</span>;
  return <span className={`${sharedStyles.badge} ${sharedStyles.badgeOrange}`}><Clock size={10} /> {status || 'Pending'}</span>;
}

export interface FollowUpDrawerProps {
  action: Action;
  dropdowns: Record<string, string[]>;
  profile: Profile;
  onClose: () => void;
  onSuccess: () => void;
}

export function FollowUpDrawer({ action, dropdowns, profile, onClose, onSuccess }: FollowUpDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const initialStatus = action.action_status === 'In Progress' ? 'In Progress'
    : action.action_status === 'Not started' ? 'Not started'
    : 'Completed';
  const [newStatus, setNewStatus] = useState<'Not started' | 'In Progress' | 'Completed'>(initialStatus);
  const isRep = profile.role !== 'admin' && !!(profile.sheet_rep_name || profile.full_name);
  const defaultRepName = profile.sheet_rep_name || profile.full_name || '';

  const [form, setForm] = useState({
    handled_by: isRep ? defaultRepName : '',
    type: action.type || '',
    purpose: action.purpose || '',
    status: '',
    feedback: '',
    action_required: 'No' as 'Yes' | 'No',
    action: '',
    action_deadline: '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // If setting a new action, validate that action description and deadline are provided
    if (form.action_required === 'Yes') {
      if (!form.action.trim()) {
        setError('Please enter a description for the new action.');
        return;
      }
      if (!form.action_deadline) {
        setError('Please set a deadline for the new action.');
        return;
      }
    }

    const effectiveStatus = form.action_required === 'Yes' ? 'Completed' : newStatus;

    startTransition(async () => {
      const res = await submitActionFollowUp({
        originalInteractionId: action.interaction_id,
        actionId: action.id,
        newActionStatus: effectiveStatus,
        followUp: {
          cub_id: action.cub_id,
          cub_first_name: action.cub_first_name,
          cub_last_name: action.cub_last_name,
          parent_first_name: action.parent_first_name,
          parent_last_name: action.parent_last_name,
          ...form,
        },
      });
      if (res.error) { 
        setError(res.error); 
        toast.error(res.error);
        return; 
      }
      toast.success(
        form.action_required === 'Yes' 
          ? 'Follow-up saved! Initial action completed & new action created.' 
          : 'Follow-up recorded successfully!'
      );
      onSuccess();
      onClose();
    });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px',
    background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: '13.5px', fontFamily: 'inherit'
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-2)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em'
  };

  return (
    <>
      <div 
        className={`${sharedStyles.drawerOverlay} ${sharedStyles.drawerOverlayActive}`} 
        onClick={onClose} 
        style={{ zIndex: 20000 }} 
      />
      <div 
        className={`${sharedStyles.drawer} ${sharedStyles.drawerActive}`} 
        style={{ zIndex: 20001, maxWidth: '540px' }}
      >
        <div className={sharedStyles.drawerHeader}>
          <h2 className={sharedStyles.drawerTitle}>Log Follow-Up</h2>
          <button className={sharedStyles.drawerClose} onClick={onClose}><X size={18} /></button>
        </div>
        
        <div className={sharedStyles.drawerBody}>
          {/* Following up on action card - clean grid layout */}
          <div style={{
            background: 'var(--bg-card)',
            padding: '14px',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            marginBottom: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Following up on action
                </span>
                <ActionStatusBadge status={action.action_status} isOverdue={action.overdue_status === 'Yes'} />
              </div>
              {action.action_deadline && (
                <div style={{ fontSize: '12px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} color="var(--text-3)" />
                  <span>Due: {fmtDate(action.action_deadline)}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 14px' }}>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Cub</div>
                <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '13.5px', marginTop: '2px' }}>
                  {action.cub_first_name} {action.cub_last_name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', fontFamily: 'monospace' }}>
                  ID: {action.cub_id}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Parent</div>
                <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '13.5px', marginTop: '2px' }}>
                  {action.parent_first_name} {action.parent_last_name}
                </div>
                {action.parent_phone && (
                  <div style={{ fontSize: '12px', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                    <Phone size={11} color="var(--text-3)" />
                    <span>{action.parent_phone}</span>
                  </div>
                )}
              </div>

              {action.handled_by && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Assigned Rep</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '2px' }}>
                    {action.handled_by}
                  </div>
                </div>
              )}

              {action.purpose && (
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600 }}>Initial Purpose</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '2px' }}>
                    {action.purpose}
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--bg-input)', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '3px' }}>
                Action Item
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-1)', lineHeight: 1.4 }}>
                {action.action}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Mark action as dropdown */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Mark action as *</label>
                {form.action_required === 'Yes' && (
                  <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 600 }}>
                    Auto-completed (next action set)
                  </span>
                )}
              </div>
              <select
                style={{
                  ...inputStyle,
                  appearance: 'none',
                  ...(form.action_required === 'Yes' ? { opacity: 0.75, cursor: 'not-allowed', background: 'var(--bg-card)' } : {})
                }}
                value={form.action_required === 'Yes' ? 'Completed' : newStatus}
                disabled={form.action_required === 'Yes'}
                onChange={e => setNewStatus(e.target.value as any)}
              >
                <option value="Not started">Not started</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            {/* Handled By and Type in 2-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Handled By *</label>
                {isRep ? (
                  <input
                    type="text"
                    value={form.handled_by || defaultRepName}
                    readOnly
                    disabled
                    style={{
                      ...inputStyle,
                      opacity: 0.85,
                      cursor: 'not-allowed',
                      background: 'var(--bg-card)',
                      fontWeight: 600,
                    }}
                    title="Automatically assigned to your rep account"
                  />
                ) : (
                  <select required style={{ ...inputStyle, appearance: 'none' }} value={form.handled_by} onChange={e => set('handled_by', e.target.value)}>
                    <option value="">Select Rep...</option>
                    {(dropdowns.handled_by ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label style={labelStyle}>Type *</label>
                <select required style={{ ...inputStyle, appearance: 'none' }} value={form.type} onChange={e => set('type', e.target.value)}>
                  <option value="">Select...</option>
                  {(dropdowns.type ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Purpose and Status in 2-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Purpose *</label>
                <select required style={{ ...inputStyle, appearance: 'none' }} value={form.purpose} onChange={e => set('purpose', e.target.value)}>
                  <option value="">Select Purpose...</option>
                  {(dropdowns.purpose ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Status</label>
                <select style={{ ...inputStyle, appearance: 'none' }} value={form.status} onChange={e => set('status', e.target.value)}>
                  <option value="">Select Status...</option>
                  {(dropdowns.status ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Feedback / Notes */}
            <div>
              <label style={labelStyle}>Feedback / Notes *</label>
              <textarea
                required
                style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }}
                value={form.feedback}
                onChange={e => set('feedback', e.target.value)}
                placeholder="Enter details about this follow-up interaction..."
              />
            </div>

            {/* Next Action in log follow up */}
            <div>
              <label style={labelStyle}>Action Required?</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['No', 'Yes'] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setForm(p => ({ ...p, action_required: v }));
                      if (v === 'Yes') {
                        setNewStatus('Completed');
                      }
                    }}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: form.action_required === v ? 'var(--primary)' : 'var(--bg-input)',
                      color: form.action_required === v ? 'white' : 'var(--text-2)',
                      border: form.action_required === v ? '1px solid var(--primary)' : '1px solid var(--border)',
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {form.action_required === 'Yes' && (
              <div style={{
                background: 'var(--orange-dim)',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid rgba(249,115,22,0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ fontSize: '12px', color: 'var(--orange)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} />
                  <span>Setting a new action automatically marks the initial action as Completed.</span>
                </div>
                <div>
                  <label style={{ ...labelStyle, color: 'var(--orange)' }}>Next Action Description *</label>
                  <textarea
                    required
                    value={form.action}
                    onChange={e => set('action', e.target.value)}
                    rows={2}
                    placeholder="What needs to be done next..."
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, color: 'var(--orange)' }}>Next Action Deadline *</label>
                  <input
                    required
                    type="date"
                    value={form.action_deadline}
                    onChange={e => set('action_deadline', e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {error && <div style={{ color: 'var(--red)', fontSize: '13px', marginTop: '4px' }}>{error}</div>}

            <div style={{ marginTop: 'auto', paddingTop: '20px', display: 'flex', gap: '12px' }}>
              <button type="button" className={sharedStyles.btn} onClick={onClose} style={{ flex: 1 }}>Cancel</button>
              <button type="submit" className={`${sharedStyles.btn} ${sharedStyles.btnPrimary}`} disabled={isPending} style={{ flex: 2 }}>
                {isPending ? <RefreshCw size={14} className={styles.spin} /> : <CheckCircle2 size={14} />}
                {isPending ? 'Saving...' : 'Submit Follow-Up'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
