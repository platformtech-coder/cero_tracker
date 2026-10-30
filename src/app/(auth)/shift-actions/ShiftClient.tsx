'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Sun, AlertTriangle, Calendar, Search, Clock } from 'lucide-react';
import type { Action, Profile } from '@/lib/types';
import { updateActionStatus } from '@/lib/actions/engagements';
import sharedStyles from '@/components/ui/dashboard.module.css';
import styles from '../engagements/engagements.module.css';
import { formatDate } from '@/lib/utils/date';
import { AlertModal } from '@/components/ui/ConfirmModal';

interface Props {
  initialActions: { overdue: Action[]; today: Action[]; future: Action[] };
  profile: Profile;
}

export default function ShiftClient({ initialActions, profile }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab');
  const isAdmin = profile?.role === 'admin';

  const [tab, setTabState] = useState<'overdue' | 'today' | 'future'>(() => {
    return rawTab === 'overdue' ? 'overdue' : rawTab === 'future' ? 'future' : 'today';
  });

  useEffect(() => {
    if (rawTab && ['overdue', 'today', 'future'].includes(rawTab)) {
      setTabState(rawTab as 'overdue' | 'today' | 'future');
    }
  }, [rawTab]);

  const setTab = useCallback((t: 'overdue' | 'today' | 'future') => {
    setTabState(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  }, []);

  const [actions, setActions] = useState(initialActions);
  useEffect(() => { setActions(initialActions); }, [initialActions]);

  // ── Filter state ──
  const [search, setSearch] = useState('');
  const [repFilter, setRepFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [subStatusFilter, setSubStatusFilter] = useState('');

  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const allActions = useMemo(() => [
    ...actions.overdue, ...actions.today, ...actions.future,
  ], [actions]);

  const myRepName = (profile?.sheet_rep_name || profile?.full_name || '').toLowerCase();

  const repOptions = useMemo(() => {
    const set = new Set<string>();
    allActions.forEach(a => {
      const rep = a.handled_by || a.relationship_owner;
      if (rep && (!myRepName || isAdmin || rep.toLowerCase() !== myRepName)) {
        set.add(rep);
      }
    });
    return Array.from(set).sort();
  }, [allActions, myRepName, isAdmin]);

  const statusOptions = useMemo(() =>
    Array.from(new Set(allActions.map(a => a.action_status).filter(Boolean))).sort(),
    [allActions]);

  const purposeOptions = useMemo(() =>
    Array.from(new Set(allActions.map(a => a.purpose).filter(Boolean))).sort(),
    [allActions]);

  const typeOptions = useMemo(() =>
    Array.from(new Set(allActions.map(a => a.type).filter(Boolean))).sort(),
    [allActions]);

  const subStatusOptions = useMemo(() =>
    Array.from(new Set(allActions.map(a => a.sub_status).filter(Boolean) as string[])).sort(),
    [allActions]);

  const hasActiveFilters = Boolean(search || repFilter || statusFilter || purposeFilter || typeFilter || subStatusFilter);

  const resetFilters = useCallback(() => {
    setSearch('');
    setRepFilter('');
    setStatusFilter('');
    setPurposeFilter('');
    setTypeFilter('');
    setSubStatusFilter('');
  }, []);

  const applyFilters = useCallback((list: Action[]) => {
    const q = search.toLowerCase();
    return list.filter(a => {
      const matchSearch = !q ||
        `${a.cub_first_name} ${a.cub_last_name}`.toLowerCase().includes(q) ||
        `${a.parent_first_name} ${a.parent_last_name}`.toLowerCase().includes(q) ||
        (a.action || '').toLowerCase().includes(q) ||
        (a.handled_by || '').toLowerCase().includes(q);
      const matchRep = !repFilter || a.handled_by === repFilter || a.relationship_owner === repFilter;
      const matchStatus = !statusFilter || a.action_status === statusFilter;
      const matchPurpose = !purposeFilter || a.purpose === purposeFilter;
      const matchType = !typeFilter || a.type === typeFilter;
      const matchSubStatus = !subStatusFilter || a.sub_status === subStatusFilter;
      return matchSearch && matchRep && matchStatus && matchPurpose && matchType && matchSubStatus;
    });
  }, [search, repFilter, statusFilter, purposeFilter, typeFilter, subStatusFilter]);

  const filtered = useMemo(() => ({
    overdue: applyFilters(actions.overdue),
    today:   applyFilters(actions.today),
    future:  applyFilters(actions.future),
  }), [actions, applyFilters]);

  const handleCompleteAction = async (id: number, type: 'overdue' | 'today' | 'future') => {
    const res = await updateActionStatus({ id, action_status: 'Completed' });
    if (res.success) {
      setActions(prev => ({ ...prev, [type]: prev[type].filter(a => a.id !== id) }));
      router.refresh();
    } else {
      setErrorMessage('Error completing action: ' + res.error);
      setShowError(true);
    }
  };

  const renderTable = (list: Action[], type: 'overdue' | 'today' | 'future') => (
    <div className={sharedStyles.tableWrap}>
      <div className={sharedStyles.tableControls}>
        <div className={sharedStyles.tableControlsLeft} style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ position: 'relative', flex: 0 }}>
            <Search size={13} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              className={sharedStyles.searchInput}
              style={{ paddingLeft: '2rem' }}
              placeholder="Search cub, parent, action..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className={sharedStyles.filterSelect} value={repFilter} onChange={e => setRepFilter(e.target.value)}>
            <option value="">All Other Reps</option>
            {repOptions.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select className={sharedStyles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={sharedStyles.filterSelect} value={purposeFilter} onChange={e => setPurposeFilter(e.target.value)}>
            <option value="">All Purposes</option>
            {purposeOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {typeOptions.length > 0 && (
            <select className={sharedStyles.filterSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Contact Types</option>
              {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {subStatusOptions.length > 0 && (
            <select className={sharedStyles.filterSelect} value={subStatusFilter} onChange={e => setSubStatusFilter(e.target.value)}>
              <option value="">All Sub Statuses</option>
              {subStatusOptions.map(ss => <option key={ss} value={ss}>{ss}</option>)}
            </select>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                padding: '4px 8px',
                textDecoration: 'underline',
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <div className={sharedStyles.tableControlsRight}>
          <span className={sharedStyles.sectionCount}>{list.length}</span>
        </div>
      </div>

      <div className={sharedStyles.tableScrollBody}>
        <table className={sharedStyles.table}>
          <thead>
            <tr>
              <th>Cub</th>
              <th>Action Details</th>
              <th>Deadline</th>
              <th>Handled By</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map(action => (
              <tr key={action.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{action.cub_first_name} {action.cub_last_name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{action.parent_first_name} {action.parent_last_name}</div>
                </td>
                <td style={{ maxWidth: '300px' }}>
                  <div style={{ fontWeight: 600 }}>{action.action}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{action.purpose}</div>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: type === 'overdue' ? 'var(--red)' : 'inherit' }}>
                    {type === 'overdue' && <AlertCircle size={14} />}
                    {formatDate(action.action_deadline)}
                  </div>
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>{action.handled_by}</td>
                <td>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: type === 'overdue' ? 'var(--red-dim)' : 'var(--orange-dim)',
                    color: type === 'overdue' ? 'var(--red)' : 'var(--orange)',
                  }}>
                    {action.action_status || (type === 'overdue' ? 'Overdue' : 'Pending')}
                  </span>
                </td>
                <td>
                  <button
                    className={`${styles.actionBtn} ${styles.actionBtnComplete}`}
                    onClick={() => handleCompleteAction(action.id, type)}
                  >
                    <CheckCircle2 size={14} /> Mark Done
                  </button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className={sharedStyles.emptyState}>
                    <div className={sharedStyles.emptyStateIcon}><CheckCircle2 size={22} color="var(--text-3)" /></div>
                    <div className={sharedStyles.emptyStateTitle}>No actions found</div>
                    <div className={sharedStyles.emptyStateSub}>{search || repFilter || statusFilter || purposeFilter ? 'Try adjusting filters' : 'All clear!'}</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      {!isAdmin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: '1rem', padding: '8px 14px',
          background: 'var(--primary-dim)', borderRadius: 8,
          fontSize: 12, color: 'var(--primary)', fontWeight: 500,
        }}>
          <Clock size={13} />
          Showing other reps&apos; pending actions — your own actions are in the Engagements tab.
        </div>
      )}

      <div className={styles.tabs}>
        <button className={`${styles.tabBtn} ${tab === 'today' ? styles.tabBtnActive : ''}`} onClick={() => setTab('today')}>
          <Sun size={14} style={{ marginRight: 6 }} />
          Today
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 9, background: 'var(--bg-input)', color: 'var(--text-2)' }}>
            {filtered.today.length}
          </span>
        </button>
        <button className={`${styles.tabBtn} ${tab === 'overdue' ? styles.tabBtnActive : ''}`} onClick={() => setTab('overdue')}>
          <AlertTriangle size={14} style={{ marginRight: 6 }} />
          Overdue
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 9, background: filtered.overdue.length ? 'var(--red-dim)' : 'var(--bg-input)', color: filtered.overdue.length ? 'var(--red)' : 'var(--text-3)' }}>
            {filtered.overdue.length}
          </span>
        </button>
        <button className={`${styles.tabBtn} ${tab === 'future' ? styles.tabBtnActive : ''}`} onClick={() => setTab('future')}>
          <Calendar size={14} style={{ marginRight: 6 }} />
          Upcoming
          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 9, background: 'var(--bg-input)', color: 'var(--text-2)' }}>
            {filtered.future.length}
          </span>
        </button>
      </div>

      {renderTable(filtered[tab], tab)}

      <AlertModal
        isOpen={showError}
        onClose={() => setShowError(false)}
        title="Error"
        message={errorMessage}
        confirmText="OK"
      />
    </div>
  );
}


