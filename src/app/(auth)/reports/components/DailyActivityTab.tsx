'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  MessageSquare,
  CheckCircle2,
  BarChart2,
  Download,
  Search,
} from 'lucide-react';
import type { DailyActivityRow, InteractionDetailRow } from '@/lib/actions/reports';
import { getDailyActivityReport, getDailyActivityInteractions } from '@/lib/actions/reports';
import styles from '@/components/ui/dashboard.module.css';
import { formatDate, formatDateTime } from '@/lib/utils/date';
import { Badge, KpiCard, DataTable, DetailDrawer, exportCSV } from './shared';

export function DailyActivityTab({
  data,
  startDate,
  endDate,
  allPurposes,
  selectedPurpose = '',
  repFilter,
}: {
  data: DailyActivityRow[];
  startDate: string;
  endDate: string;
  allPurposes: string[];
  selectedPurpose?: string;
  repFilter?: string;
}) {
  const [drawer, setDrawer] = useState<{ rep: string; startDate: string; endDate: string } | null>(null);
  const [interactions, setInteractions] = useState<InteractionDetailRow[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tableData, setTableData] = useState<DailyActivityRow[]>(data);
  const [loadingTable, setLoadingTable] = useState(false);

  // Derive selected purposes array from single-selection prop
  const selectedPurposes = useMemo(
    () => selectedPurpose ? [selectedPurpose] : [],
    [selectedPurpose]
  );

  const isFirstMount = useRef(true);

  // Sync tableData when parent data changes (e.g. date range changed at page level)
  useEffect(() => {
    if (selectedPurposes.length === 0) {
      setTableData(data);
    }
  }, [data, selectedPurposes.length]);

  // Re-fetch report metrics when purpose filter, dates, or repFilter change
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    let isCurrent = true;
    setLoadingTable(true);
    getDailyActivityReport(
      repFilter,
      startDate,
      endDate,
      selectedPurposes.length > 0 ? selectedPurposes : undefined
    )
      .then(rows => {
        if (isCurrent) setTableData(rows);
      })
      .catch(() => {
        if (isCurrent) setTableData([]);
      })
      .finally(() => {
        if (isCurrent) setLoadingTable(false);
      });

    return () => { isCurrent = false; };
  }, [selectedPurposes, repFilter, startDate, endDate]);

  const totals = tableData.reduce((acc, r) => ({
    calls_made:         acc.calls_made + r.calls_made,
    calls_successful:   acc.calls_successful + r.calls_successful,
    calls_unsuccessful: acc.calls_unsuccessful + r.calls_unsuccessful,
    messages_sent:      acc.messages_sent + r.messages_sent,
    total_interactions: acc.total_interactions + r.total_interactions,
  }), { calls_made: 0, calls_successful: 0, calls_unsuccessful: 0, messages_sent: 0, total_interactions: 0 });


  const loadInteractions = useCallback((rep: string, s: string, e: string, purposes: string[]) => {
    setLoadingInteractions(true);
    getDailyActivityInteractions(rep, s, e, purposes.length > 0 ? purposes : undefined)
      .then(rows => setInteractions(rows))
      .catch(() => setInteractions([]))
      .finally(() => setLoadingInteractions(false));
  }, []);

  const handleOpenDrawer = (rep: string) => {
    setDrawer({ rep, startDate, endDate });
    setSearchQuery('');
    setInteractions([]);
    loadInteractions(rep, startDate, endDate, selectedPurposes);
  };

  // Re-fetch drawer interactions if purposes are toggled while drawer is open
  useEffect(() => {
    if (drawer) {
      loadInteractions(drawer.rep, drawer.startDate, drawer.endDate, selectedPurposes);
    }
  }, [drawer?.rep, drawer?.startDate, drawer?.endDate, selectedPurposes, loadInteractions]);

  const filteredInteractions = useMemo(() => {
    if (!searchQuery.trim()) return interactions;
    const q = searchQuery.toLowerCase().trim();
    return interactions.filter(item => {
      const cubName = `${item.cub_first_name ?? ''} ${item.cub_last_name ?? ''}`.toLowerCase();
      const cubId = (item.cub_id ?? '').toLowerCase();
      const parentName = `${item.parent_first_name ?? ''} ${item.parent_last_name ?? ''}`.toLowerCase();
      const handledBy = (item.handled_by ?? '').toLowerCase();
      const purpose = (item.purpose ?? '').toLowerCase();
      const type = (item.type ?? '').toLowerCase();
      const status = (item.status ?? '').toLowerCase();
      const feedback = (item.feedback ?? '').toLowerCase();
      const action = (item.action ?? '').toLowerCase();

      return (
        cubName.includes(q) ||
        cubId.includes(q) ||
        parentName.includes(q) ||
        handledBy.includes(q) ||
        purpose.includes(q) ||
        type.includes(q) ||
        status.includes(q) ||
        feedback.includes(q) ||
        action.includes(q)
      );
    });
  }, [interactions, searchQuery]);

  return (
    <div>
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem', opacity: loadingTable ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <KpiCard label="Total Calls"         value={totals.calls_made}         icon={Phone}         iconClass={styles.iconPrimary} />
        <KpiCard label="Successful (Reached)" value={totals.calls_successful}   icon={CheckCircle2}  iconClass={styles.iconGreen}  valueClass={styles.valueGreen} />
        <KpiCard label="Unsuccessful"         value={totals.calls_unsuccessful} icon={PhoneOff}      iconClass={styles.iconRed}    valueClass={styles.valueRed} />
        <KpiCard label="Messages Sent"        value={totals.messages_sent}      icon={MessageSquare} iconClass={styles.iconBlue} />
        <KpiCard label="Total Interactions Logged" value={totals.total_interactions} icon={BarChart2} iconClass={styles.iconPrimary} />
      </div>


      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('daily-activity', tableData, ['rep','calls_made','calls_successful','calls_unsuccessful','messages_sent','total_interactions'])}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div style={{ opacity: loadingTable ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <DataTable
          onRowClick={row => handleOpenDrawer(row.rep)}
          columns={[
            { key: 'rep', label: 'Rep' },
            { key: 'calls_made', label: 'Total Calls', align: 'center' },
            { key: 'calls_successful', label: 'Reached', align: 'center', render: v => <span style={{ color: 'var(--green)', fontWeight: 600 }}>{v}</span> },
            { key: 'calls_unsuccessful', label: 'Not Reached', align: 'center', render: v => <span style={{ color: 'var(--red)' }}>{v}</span> },
            { key: 'messages_sent', label: 'Messages Sent', align: 'center' },
            { key: 'total_interactions', label: 'Total Interactions', align: 'center', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          ]}
          rows={tableData}
        />
      </div>

      <DetailDrawer
        title={`Interactions — ${drawer?.rep ?? ''}`}
        isOpen={!!drawer}
        onClose={() => {
          setDrawer(null);
          setSearchQuery('');
        }}
      >
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 12 }}>
          Showing all interactions logged by <strong>{drawer?.rep}</strong>{' '}
          {selectedPurposes.length > 0 && (
            <>for <strong>{selectedPurposes.join(', ')}</strong>{' '}</>
          )}
          {drawer?.startDate && drawer?.endDate && drawer.startDate !== drawer.endDate
            ? `from ${formatDate(drawer.startDate)} to ${formatDate(drawer.endDate)}`
            : `for ${formatDate(drawer?.startDate)}`}.
        </p>


        {/* Search Bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-3)',
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by cub, parent, purpose, status, notes..."
              style={{
                width: '100%',
                paddingLeft: 34,
                paddingRight: 12,
                paddingTop: 9,
                paddingBottom: 9,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: '#ffffff',
                color: 'var(--text-1)',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {searchQuery && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Showing {filteredInteractions.length} of {interactions.length} interactions</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, padding: 0 }}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {loadingInteractions ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading interactions...
          </div>
        ) : interactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No interactions logged for this period.
          </div>
        ) : filteredInteractions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No interactions match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredInteractions.map(item => (
              <div
                key={item.id}
                style={{
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-card)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-1)' }}>
                      {item.cub_first_name} {item.cub_last_name}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 8 }}>
                      ({item.cub_id})
                    </span>
                  </div>
                  <Badge
                    label={item.status || item.type}
                    variant={item.status === 'Reached' ? 'green' : item.status === 'Not Reached' ? 'red' : 'blue'}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 4 }}>
                  Parent: {item.parent_first_name} {item.parent_last_name} · Purpose: {item.purpose}
                </div>
                {item.feedback && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', background: 'var(--bg-input)', padding: '6px 8px', borderRadius: 6, marginTop: 6 }}>
                    &ldquo;{item.feedback}&rdquo;
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                  {formatDateTime(item.date)}
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
