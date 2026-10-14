'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, AlertCircle, Sun, AlertTriangle, Calendar } from 'lucide-react';
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

  useEffect(() => {
    setActions(initialActions);
  }, [initialActions]);

  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleCompleteAction = async (id: number, type: 'overdue' | 'today' | 'future') => {
    const res = await updateActionStatus({ id, action_status: 'Completed' });
    if (res.success) {
      setActions({
        ...actions,
        [type]: actions[type].filter(a => a.id !== id) // Remove from list once completed
      });
      router.refresh();
    } else {
      setErrorMessage('Error completing action: ' + res.error);
      setShowError(true);
    }
  };

  const renderTable = (list: Action[], type: 'overdue' | 'today' | 'future') => (
    <div className={sharedStyles.tableWrap}>
      <div className={sharedStyles.tableScrollBody}>
        <table className={sharedStyles.table}>
          <thead>
            <tr>
              <th>Cub</th>
              <th>Action Details</th>
              <th>Deadline</th>
              <th>Handled By</th>
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
                <td>{action.handled_by}</td>
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
              <tr><td colSpan={5} className={sharedStyles.emptyState}>No actions found for this category.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      <div className={styles.tabs}>
        <button 
          className={`${styles.tabBtn} ${tab === 'today' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('today')}
        >
          <Sun size={14} style={{ marginRight: 6 }} /> Today ({actions.today.length})
        </button>
        <button 
          className={`${styles.tabBtn} ${tab === 'overdue' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('overdue')}
        >
          <AlertTriangle size={14} style={{ marginRight: 6 }} /> Overdue <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>({actions.overdue.length})</span>
        </button>
        <button 
          className={`${styles.tabBtn} ${tab === 'future' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('future')}
        >
          <Calendar size={14} style={{ marginRight: 6 }} /> Upcoming ({actions.future.length})
        </button>
      </div>

      {renderTable(actions[tab], tab)}

      {/* Error Alert Modal */}
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
