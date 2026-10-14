'use client';

import { useState, useMemo, useCallback, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO, isValid } from 'date-fns';
import {
  Search, CheckCircle2, MessageSquarePlus, Clock, AlertCircle,
  ChevronLeft, ChevronRight, X, Plus, Edit2, Trash2, RefreshCw,
  ArrowUpDown
} from 'lucide-react';
import type { Action, Interaction, Profile } from '@/lib/types';
import {
  updateActionStatus, submitInteraction, editInteraction,
  deleteInteraction, searchCubs, submitActionFollowUp,
} from '@/lib/actions/engagements';
import type { CubSearchResult } from '@/lib/actions/engagements';
import { toast } from 'sonner';

import sharedStyles from '@/components/ui/dashboard.module.css';
import styles from './engagements.module.css';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useTableSort } from '@/hooks/useTableSort';

const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────
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
  if (status === 'Cancelled')
    return <span className={`${sharedStyles.badge} ${sharedStyles.badgeGray}`}>Cancelled</span>;
  return <span className={`${sharedStyles.badge} ${sharedStyles.badgeOrange}`}><Clock size={10} /> Pending</span>;
}

function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
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
        {pages.map(p => (
          <button key={p} className={`${sharedStyles.pageBtn} ${p === page ? sharedStyles.pageBtnActive : ''}`} onClick={() => onChange(p)}>{p}</button>
        ))}
        <button className={sharedStyles.pageBtn} onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

// ─── Log / Edit Interaction Modal ──────────────────────────────
interface ModalProps {
  mode: 'log' | 'edit';
  initial?: Interaction | null;
  dropdowns: Record<string, string[]>;
  profile: Profile;
  onClose: () => void;
  onSuccess: (data: Interaction | null, isEdit: boolean) => void;
}

function InteractionModal({ mode, initial, dropdowns, profile, onClose, onSuccess }: ModalProps) {
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

  const [form, setForm] = useState({
    handled_by: initial?.handled_by ?? profile.full_name,
    type: initial?.type ?? '',
    purpose: initial?.purpose ?? '',
    status: initial?.status ?? '',
    feedback: initial?.feedback ?? '',
    action_required: (initial?.action_required ?? 'No') as 'Yes' | 'No',
    action: initial?.action ?? '',
    action_deadline: initial?.action_deadline ? initial.action_deadline.slice(0, 10) : '',
    action_status: initial?.action_status ?? '',
  });

  const set = (k: keyof typeof form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleCubSearch = useCallback(async (q: string) => {
    setCubQuery(q);
    if (q.length < 2) { setCubResults([]); return; }
    const res = await searchCubs(q, profile.role === 'admin');
    setCubResults(res);
  }, [profile.role]);

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
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{mode === 'edit' ? 'Edit Interaction' : 'Log Interaction'}</h2>
          <button className={styles.modalClose} onClick={onClose}><X size={18} /></button>
        </div>

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
                      <div style={{ fontWeight: 600 }}>{c.cubFirstName} {c.cubLastName} <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>({c.cubId})</span></div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{c.parentFirstName} {c.parentLastName} · {c.parentPhone}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Handled By *</label>
              <select className={styles.formInput} value={form.handled_by} onChange={e => set('handled_by', e.target.value)} required>
                <option value="">Select...</option>
                {(dropdowns.handled_by ?? []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
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
              <select className={styles.formInput} value={form.status} onChange={e => set('status', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.status ?? []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>

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
  );
}

// ─── Follow-Up Drawer ───────────────────────────────────────────
interface FollowUpDrawerProps {
  action: Action;
  dropdowns: Record<string, string[]>;
  profile: Profile;
  onClose: () => void;
  onSuccess: () => void;
}

function FollowUpDrawer({ action, dropdowns, profile, onClose, onSuccess }: FollowUpDrawerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [newStatus, setNewStatus] = useState<'Completed' | 'Cancelled' | 'Pending'>('Completed');
  const [form, setForm] = useState({
    handled_by: profile.full_name,
    type: action.type,
    purpose: action.purpose,
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
    startTransition(async () => {
      const res = await submitActionFollowUp({
        originalInteractionId: action.interaction_id,
        newActionStatus: newStatus,
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
      toast.success('Follow-up recorded successfully!');
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
        style={{ zIndex: 20001, maxWidth: '500px' }}
      >
        <div className={sharedStyles.drawerHeader}>
          <h2 className={sharedStyles.drawerTitle}>Log Follow-Up</h2>
          <button className={sharedStyles.drawerClose} onClick={onClose}><X size={18} /></button>
        </div>
        
        <div className={sharedStyles.drawerBody}>
          <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700, marginBottom: '4px' }}>Following up on action for</div>
            <div style={{ fontWeight: 600, color: 'var(--text-1)' }}>{action.cub_first_name} {action.cub_last_name}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-2)', marginTop: '4px' }}>{action.action}</div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Mark action as</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['Completed', 'Cancelled', 'Pending'] as const).map(s => (
                  <button key={s} type="button"
                    className={newStatus === s ? styles.toggleActive : styles.toggleInactive}
                    onClick={() => setNewStatus(s)}
                  >{s}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Handled By *</label>
                <select required style={{ ...inputStyle, appearance: 'none' }} value={form.handled_by} onChange={e => set('handled_by', e.target.value)}>
                  <option value="">Select...</option>
                  {(dropdowns.handled_by ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Type *</label>
                <select required style={{ ...inputStyle, appearance: 'none' }} value={form.type} onChange={e => set('type', e.target.value)}>
                  <option value="">Select...</option>
                  {(dropdowns.type ?? []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Purpose *</label>
              <select required style={{ ...inputStyle, appearance: 'none' }} value={form.purpose} onChange={e => set('purpose', e.target.value)}>
                <option value="">Select...</option>
                {(dropdowns.purpose ?? []).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Feedback / Notes *</label>
              <textarea required style={{ ...inputStyle, resize: 'vertical', minHeight: '80px' }} value={form.feedback} onChange={e => set('feedback', e.target.value)} />
            </div>

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

// ─── Actions Tab ───────────────────────────────────────────────
function ActionsTab({ actions: initial, dropdowns, profile, onActionUpdated }: {
  actions: Action[];
  dropdowns: Record<string, string[]>;
  profile: Profile;
  onActionUpdated: () => void;
}) {
  const [actions, setActions] = useState(initial);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setActions(initial);
  }, [initial]);
  const [search, setSearch] = useState('');
  
  const [primaryFilter, setPrimaryFilter] = useState('');
  const [secondaryFilter, setSecondaryFilter] = useState('');
  const [page, setPage] = useState(1);
  
  const [followUpAction, setFollowUpAction] = useState<Action | null>(null);
  const [completeActionId, setCompleteActionId] = useState<number | null>(null);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  const handleCompleteConfirm = () => {
    if (completeActionId === null) return;
    const action = actions.find(a => a.id === completeActionId);
    if (!action) return;
    
    setShowCompleteConfirm(false);
    startTransition(async () => {
      const res = await updateActionStatus({ id: completeActionId, action_status: 'Completed' });
      if (res.success) {
        toast.success('Action marked as completed');
        setActions(prev => prev.map(a => a.id === completeActionId ? { ...a, action_status: 'Completed' } : a));
        onActionUpdated();
      } else {
        toast.error(res.error);
      }
    });
  };

  const handlePrimaryFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPrimaryFilter(e.target.value);
    setSecondaryFilter(e.target.value === 'status' ? 'Active' : '');
    setPage(1);
  };

  const secondaryOptions = useMemo(() => {
    if (!primaryFilter || primaryFilter === 'status') return [];
    const uniqueValues = new Set<string>();
    actions.forEach(a => {
      const val = a[primaryFilter as keyof Action];
      if (val) uniqueValues.add(String(val));
    });
    return Array.from(uniqueValues).sort();
  }, [primaryFilter, actions]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return actions.filter(a => {
      const matchSearch = !q ||
        `${a.cub_first_name} ${a.cub_last_name}`.toLowerCase().includes(q) ||
        `${a.parent_first_name} ${a.parent_last_name}`.toLowerCase().includes(q) ||
        a.action.toLowerCase().includes(q) ||
        a.handled_by.toLowerCase().includes(q);

      let matchFilter = true;
      if (primaryFilter === 'status') {
        matchFilter =
          secondaryFilter === 'All' || !secondaryFilter ||
          (secondaryFilter === 'Active' && !['Completed', 'Cancelled'].includes(a.action_status)) ||
          (secondaryFilter === 'Overdue' && (a.action_status === 'Overdue' || a.overdue_status === 'Yes')) ||
          a.action_status === secondaryFilter;
      } else if (primaryFilter && secondaryFilter) {
        matchFilter = String(a[primaryFilter as keyof Action]) === secondaryFilter;
      }

      return matchSearch && matchFilter;
    });
  }, [actions, search, primaryFilter, secondaryFilter]);

  const { sortedData, handleSort, getSortIndicator } = useTableSort(filtered, {
    sortableKeys: ['cub_first_name', 'action', 'action_deadline', 'action_status', 'handled_by'],
    getSortValue: (item, key) => item[key as keyof Action],
  });

  const paginated = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);



  return (
    <>
      <div className={sharedStyles.tableWrap}>
        <div className={sharedStyles.tableControls}>
          <div className={sharedStyles.tableControlsLeft}>
            <div style={{ position: 'relative', flex: 0 }}>
              <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input className={sharedStyles.searchInput} style={{ paddingLeft: '2rem' }} placeholder="Search actions..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            
            <select className={sharedStyles.filterSelect} value={primaryFilter} onChange={handlePrimaryFilterChange} style={{ width: '160px' }}>
              <option value="">All</option>
              <option value="orientation_stage">Orientation Stage</option>
              <option value="sub_status">Sub Status</option>
              <option value="flag">Flag</option>
              <option value="status">Action Status</option>
            </select>

            {primaryFilter === 'status' ? (
              <select className={sharedStyles.filterSelect} value={secondaryFilter} onChange={e => { setSecondaryFilter(e.target.value); setPage(1); }} style={{ width: '140px' }}>
                <option value="Active">Active</option>
                <option value="All">All</option>
                <option value="Pending">Pending</option>
                <option value="Overdue">Overdue</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            ) : primaryFilter ? (
              <select className={sharedStyles.filterSelect} value={secondaryFilter} onChange={e => { setSecondaryFilter(e.target.value); setPage(1); }} style={{ width: '180px' }}>
                <option value="">All {primaryFilter.replace('_', ' ')}</option>
                {secondaryOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : null}
          </div>
          <div className={sharedStyles.tableControlsRight}>
            <span className={sharedStyles.sectionCount}>{filtered.length}</span>
          </div>
        </div>

        {paginated.length === 0 ? (
          <div className={sharedStyles.emptyState}>
            <div className={sharedStyles.emptyStateIcon}><CheckCircle2 size={22} color="var(--text-3)" /></div>
            <div className={sharedStyles.emptyStateTitle}>No actions</div>
            <div className={sharedStyles.emptyStateSub}>{search || secondaryFilter !== 'Active' ? 'Try adjusting filters' : 'All clear!'}</div>
          </div>
        ) : (
          <div className={sharedStyles.tableScrollBody}>
            <table className={sharedStyles.table}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('cub_first_name')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Cub
                      {getSortIndicator('cub_first_name') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('action')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Action
                      {getSortIndicator('action') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('action_deadline')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Deadline
                      {getSortIndicator('action_deadline') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('action_status')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Status
                      {getSortIndicator('action_status') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('handled_by')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Rep
                      {getSortIndicator('handled_by') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th>Follow-Up</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(action => (
                  <tr key={action.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{action.cub_first_name} {action.cub_last_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{action.parent_first_name} {action.parent_last_name}</div>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={action.action}>{action.action}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(action.action_deadline)}</td>
                    <td><ActionStatusBadge status={action.action_status} isOverdue={action.overdue_status === 'Yes'} /></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{action.handled_by}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        {!['Completed', 'Cancelled'].includes(action.action_status) && (
                          <>
                            <button className={`${styles.actionBtn} ${styles.actionBtnComplete}`}
                              onClick={() => {
                                setCompleteActionId(action.id);
                                setShowCompleteConfirm(true);
                              }}
                              disabled={isPending}
                              title="Mark Done"
                              style={{ opacity: isPending ? 0.7 : 1 }}
                            >
                              <CheckCircle2 size={13} /> Done
                            </button>
                            <button className={`${styles.actionBtn} ${styles.actionBtnFollow}`}
                              onClick={() => setFollowUpAction(action)} title="Log Follow-Up">
                              Follow-Up
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={p => setPage(p)} />
      </div>

      {followUpAction && (
        <FollowUpDrawer
          action={followUpAction}
          dropdowns={dropdowns}
          profile={profile}
          onClose={() => setFollowUpAction(null)}
          onSuccess={onActionUpdated}
        />
      )}

      {/* Complete Action Confirmation Modal */}
      <ConfirmModal
        isOpen={showCompleteConfirm}
        onClose={() => { setShowCompleteConfirm(false); setCompleteActionId(null); }}
        onConfirm={handleCompleteConfirm}
        title="Mark Action as Completed?"
        message="Mark this action as completed?"
        confirmText="Mark Completed"
        variant="primary"
      />
    </>
  );
}

// ─── Interactions Tab ──────────────────────────────────────────
function InteractionsTab({ interactions: initial, dropdowns, profile, onLogNew }: {
  interactions: Interaction[];
  dropdowns: Record<string, string[]>;
  profile: Profile;
  onLogNew: (i: Interaction) => void;
}) {
  const [interactions, setInteractions] = useState(initial);

  useEffect(() => {
    setInteractions(initial);
  }, [initial]);
  const [search, setSearch] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editingInt, setEditingInt] = useState<Interaction | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteInteractionId, setDeleteInteractionId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [, startTransition] = useTransition();

  const handleDeleteConfirm = () => {
    if (!deleteInteractionId) return;
    
    setShowDeleteConfirm(false);
    startTransition(async () => {
      const res = await deleteInteraction(deleteInteractionId);
      if (res.success) {
        setInteractions(prev => prev.filter(i => i.id !== deleteInteractionId));
        toast.success('Interaction deleted successfully');
      } else {
        toast.error(res.error || 'Failed to delete interaction');
      }
      setDeleteInteractionId(null);
    });
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return interactions.filter(i => {
      const matchSearch = !q ||
        `${i.cub_first_name} ${i.cub_last_name}`.toLowerCase().includes(q) ||
        i.purpose.toLowerCase().includes(q) ||
        (i.feedback || '').toLowerCase().includes(q) ||
        i.handled_by.toLowerCase().includes(q);
      const matchPurpose = !purposeFilter || i.purpose === purposeFilter;
      return matchSearch && matchPurpose;
    });
  }, [interactions, search, purposeFilter]);

  const { sortedData, handleSort, getSortIndicator } = useTableSort(filtered, {
    sortableKeys: ['date', 'cub_first_name', 'purpose', 'feedback', 'handled_by'],
    getSortValue: (item, key) => item[key as keyof Interaction],
  });

  const paginated = sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = (id: string) => {
    setDeleteInteractionId(id);
    setShowDeleteConfirm(true);
  };

  const handleModalSuccess = (newInt: Interaction | null, isEdit: boolean) => {
    if (isEdit) {
      setInteractions(prev => prev.map(i => i.id === editingInt?.id ? { ...i, ...newInt } as Interaction : i));
    } else if (newInt) {
      setInteractions(prev => [newInt, ...prev]);
      onLogNew(newInt);
    }
    setEditingInt(null);
    setShowModal(false);
  };

  const purposes = useMemo(() => Array.from(new Set(interactions.map(i => i.purpose))).sort(), [interactions]);

  return (
    <>
      <div className={sharedStyles.tableWrap}>
        <div className={sharedStyles.tableControls}>
          <div className={sharedStyles.tableControlsLeft}>
            <div style={{ position: 'relative', flex: 0 }}>
              <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
              <input className={sharedStyles.searchInput} style={{ paddingLeft: '2rem' }} placeholder="Search..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className={sharedStyles.filterSelect} value={purposeFilter} onChange={e => { setPurposeFilter(e.target.value); setPage(1); }}>
              <option value="">All Purposes</option>
              {purposes.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className={sharedStyles.tableControlsRight}>
            <span className={sharedStyles.sectionCount}>{filtered.length}</span>
          </div>
        </div>

        {paginated.length === 0 ? (
          <div className={sharedStyles.emptyState}>
            <div className={sharedStyles.emptyStateIcon}><MessageSquarePlus size={22} color="var(--text-3)" /></div>
            <div className={sharedStyles.emptyStateTitle}>No interactions</div>
            <div className={sharedStyles.emptyStateSub}>{search || purposeFilter ? 'Try adjusting filters' : 'Start by logging an interaction'}</div>
          </div>
        ) : (
          <div className={sharedStyles.tableScrollBody}>
            <table className={sharedStyles.table}>
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('date')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Date
                      {getSortIndicator('date') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('cub_first_name')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Cub
                      {getSortIndicator('cub_first_name') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('purpose')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Purpose / Type
                      {getSortIndicator('purpose') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('feedback')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Feedback
                      {getSortIndicator('feedback') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('handled_by')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      Rep
                      {getSortIndicator('handled_by') && <ArrowUpDown size={12} style={{ color: 'var(--primary)' }} />}
                    </div>
                  </th>
                  <th>Action?</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(int => (
                  <tr key={int.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{fmtDate(int.date, true)}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{int.cub_first_name} {int.cub_last_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{int.parent_first_name} {int.parent_last_name}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{int.purpose}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{int.type}{int.status ? ` · ${int.status}` : ''}</div>
                    </td>
                    <td style={{ maxWidth: 200, fontSize: '0.82rem', color: 'var(--text-2)' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={int.feedback ?? ''}>
                        {int.feedback || '—'}
                      </div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{int.handled_by}</td>
                    <td>
                      {int.action_required === 'Yes'
                        ? <span className={`${sharedStyles.badge} ${sharedStyles.badgeOrange}`}>{int.action_status || 'Pending'}</span>
                        : <span className={`${sharedStyles.badge} ${sharedStyles.badgeGray}`}>No</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                        {int.logged_by && (
                          <>
                            <button className={styles.iconBtn} onClick={() => { setEditingInt(int); setShowModal(true); }} title="Edit">
                              <Edit2 size={13} />
                            </button>
                            <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => handleDelete(int.id)} title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={p => setPage(p)} />
      </div>

      {showModal && (
        <InteractionModal
          mode={editingInt ? 'edit' : 'log'}
          initial={editingInt}
          dropdowns={dropdowns}
          profile={profile}
          onClose={() => { setShowModal(false); setEditingInt(null); }}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* Delete Interaction Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => { setShowDeleteConfirm(false); setDeleteInteractionId(null); }}
        onConfirm={handleDeleteConfirm}
        title="Delete Interaction?"
        message="Delete this interaction? This cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </>
  );
}

// ─── Main Component ────────────────────────────────────────────
interface Props {
  initialInteractions: Interaction[];
  initialActions: Action[];
  dropdowns: Record<string, string[]>;
  profile: Profile;
  isAdmin?: boolean;
  allReps?: string[];
  currentRep?: string;
}

export default function EngagementsClient({ initialInteractions, initialActions, dropdowns, profile, isAdmin, allReps, currentRep }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: 'actions' | 'interactions' = rawTab === 'interactions' ? 'interactions' : 'actions';
  const setTab = useCallback((t: 'actions' | 'interactions') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`/engagements?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);
  const [actions, setActions] = useState(initialActions);

  useEffect(() => {
    setActions(initialActions);
  }, [initialActions]);

  const activeCount = actions.filter(a => !['Completed', 'Cancelled'].includes(a.action_status)).length;

  return (
    <div>
      <div className={styles.tabs}>
        <button className={`${styles.tabBtn} ${tab === 'actions' ? styles.tabBtnActive : ''}`} onClick={() => setTab('actions')}>
          Actions {activeCount > 0 && <span className={styles.tabBadge}>{activeCount}</span>}
        </button>
        <button className={`${styles.tabBtn} ${tab === 'interactions' ? styles.tabBtnActive : ''}`} onClick={() => setTab('interactions')}>
          Interactions Log
        </button>
      </div>

      {tab === 'actions' && (
        <ActionsTab
          actions={actions}
          dropdowns={dropdowns}
          profile={profile}
          onActionUpdated={() => {
            router.refresh();
          }}
        />
      )}

      {tab === 'interactions' && (
        <InteractionsTab
          interactions={initialInteractions}
          dropdowns={dropdowns}
          profile={profile}
          onLogNew={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
