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
  ChevronDown,
  SendHorizonal,
} from 'lucide-react';
import type { DailyActivityRow, InteractionDetailRow } from '@/lib/actions/reports';
import { getDailyActivityReport, getDailyActivityInteractions } from '@/lib/actions/reports';
import styles from '@/components/ui/dashboard.module.css';
import { formatDate, formatDateTime } from '@/lib/utils/date';
import { Badge, KpiCard, DataTable, DetailDrawer, exportCSV } from './shared';

// ── Types ──────────────────────────────────────────────────────
type MainTab = 'all' | 'calls' | 'messages';
type CallFilter = 'all' | 'reached' | 'not_reached';
type MessageFilter = 'all' | 'sms' | 'whatsapp' | 'email';

/** True if status is exactly "reached" (case-insensitive). */
function isReached(status: string | null | undefined): boolean {
  return (status ?? '').toLowerCase().trim() === 'reached';
}

/** True if this row is a Call interaction. */
function isCallType(type: string | null | undefined): boolean {
  return ['call', 'phone call', 'telephone'].includes((type ?? '').toLowerCase().trim());
}

/** True if this row is a Message interaction. */
function isMessageType(type: string | null | undefined): boolean {
  return ['message', 'whatsapp', 'sms', 'email'].includes((type ?? '').toLowerCase().trim());
}

/** Returns the display channel for a message row (message_sent for calls-with-msg; type or message_sent for message rows). */
function getMessageChannel(item: InteractionDetailRow): string {
  if (isMessageType(item.type)) return item.message_sent || item.type || '—';
  return item.message_sent || '—';
}

// ── Dropdown Sub-filter Component ──────────────────────────────
function SubFilter<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value as T)}
        style={{
          appearance: 'none',
          padding: '5px 28px 5px 10px',
          borderRadius: 7,
          border: '1px solid var(--border)',
          background: 'var(--bg-card)',
          color: 'var(--text-2)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={13}
        style={{
          position: 'absolute', right: 8, top: '50%',
          transform: 'translateY(-50%)', pointerEvents: 'none',
          color: 'var(--text-3)',
        }}
      />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────
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

  // Main drawer tab: All / Calls / Messages
  const [mainTab, setMainTab] = useState<MainTab>('all');
  // Sub-filters inside each tab
  const [callFilter, setCallFilter] = useState<CallFilter>('all');
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');

  const [tableData, setTableData] = useState<DailyActivityRow[]>(data);
  const [loadingTable, setLoadingTable] = useState(false);

  const selectedPurposes = useMemo(
    () => selectedPurpose ? [selectedPurpose] : [],
    [selectedPurpose]
  );

  const isFirstMount = useRef(true);

  useEffect(() => {
    if (selectedPurposes.length === 0) {
      setTableData(data);
    }
  }, [data, selectedPurposes.length]);

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
      .then(rows => { if (isCurrent) setTableData(rows); })
      .catch(() => { if (isCurrent) setTableData([]); })
      .finally(() => { if (isCurrent) setLoadingTable(false); });
    return () => { isCurrent = false; };
  }, [selectedPurposes, repFilter, startDate, endDate]);

  // ── Totals ───────────────────────────────────────────────────
  const totals = tableData.reduce((acc, r) => ({
    calls_made:              acc.calls_made + r.calls_made,
    calls_successful:        acc.calls_successful + r.calls_successful,
    calls_unsuccessful:      acc.calls_unsuccessful + r.calls_unsuccessful,
    unreached_messages_sent: acc.unreached_messages_sent + (r.unreached_messages_sent ?? 0),
    messages_sent:           acc.messages_sent + r.messages_sent,
    total_interactions:      acc.total_interactions + r.total_interactions,
  }), { calls_made: 0, calls_successful: 0, calls_unsuccessful: 0, unreached_messages_sent: 0, messages_sent: 0, total_interactions: 0 });

  // ── Load drawer interactions ──────────────────────────────────
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
    setMainTab('all');
    setCallFilter('all');
    setMessageFilter('all');
    setInteractions([]);
    loadInteractions(rep, startDate, endDate, selectedPurposes);
  };

  useEffect(() => {
    if (drawer) {
      loadInteractions(drawer.rep, drawer.startDate, drawer.endDate, selectedPurposes);
    }
  }, [drawer?.rep, drawer?.startDate, drawer?.endDate, selectedPurposes, loadInteractions]);

  // ── Tab + sub-filter logic ────────────────────────────────────
  const tabFilteredInteractions = useMemo(() => {
    let base = interactions;

    if (mainTab === 'calls') {
      base = base.filter(i => isCallType(i.type));
      if (callFilter === 'reached') base = base.filter(i => isReached(i.status));
      if (callFilter === 'not_reached') base = base.filter(i => !isReached(i.status));
    } else if (mainTab === 'messages') {
      // Only standalone Message type (Option A: strict separation)
      base = base.filter(i => isMessageType(i.type));
      if (messageFilter !== 'all') {
        base = base.filter(i => {
          const channel = (i.message_sent || i.type || '').toLowerCase();
          return channel === messageFilter;
        });
      }
    }

    return base;
  }, [interactions, mainTab, callFilter, messageFilter]);

  // ── Search filtering ──────────────────────────────────────────
  const filteredInteractions = useMemo(() => {
    if (!searchQuery.trim()) return tabFilteredInteractions;
    const q = searchQuery.toLowerCase().trim();
    return tabFilteredInteractions.filter(item => {
      const cubName = `${item.cub_first_name ?? ''} ${item.cub_last_name ?? ''}`.toLowerCase();
      const parentName = `${item.parent_first_name ?? ''} ${item.parent_last_name ?? ''}`.toLowerCase();
      return (
        cubName.includes(q) ||
        (item.cub_id ?? '').toLowerCase().includes(q) ||
        parentName.includes(q) ||
        (item.handled_by ?? '').toLowerCase().includes(q) ||
        (item.purpose ?? '').toLowerCase().includes(q) ||
        (item.type ?? '').toLowerCase().includes(q) ||
        (item.status ?? '').toLowerCase().includes(q) ||
        (item.feedback ?? '').toLowerCase().includes(q) ||
        (item.message_sent ?? '').toLowerCase().includes(q) ||
        (item.action ?? '').toLowerCase().includes(q)
      );
    });
  }, [tabFilteredInteractions, searchQuery]);

  // ── Counts for tab badges ─────────────────────────────────────
  const tabCounts = useMemo(() => {
    const calls = interactions.filter(i => isCallType(i.type));
    const messages = interactions.filter(i => isMessageType(i.type));
    return {
      all: interactions.length,
      calls: calls.length,
      calls_reached: calls.filter(i => isReached(i.status)).length,
      calls_not_reached: calls.filter(i => !isReached(i.status)).length,
      messages: messages.length,
      messages_sms: messages.filter(i => (i.message_sent || i.type || '').toLowerCase() === 'sms').length,
      messages_whatsapp: messages.filter(i => (i.message_sent || i.type || '').toLowerCase() === 'whatsapp').length,
      messages_email: messages.filter(i => (i.message_sent || i.type || '').toLowerCase() === 'email').length,
    };
  }, [interactions]);

  const mainTabDefs: { key: MainTab; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: tabCounts.all },
    { key: 'calls',    label: 'Calls',    count: tabCounts.calls },
    { key: 'messages', label: 'Messages', count: tabCounts.messages },
  ];

  const callFilterOptions: { value: CallFilter; label: string }[] = [
    { value: 'all',         label: `All (${tabCounts.calls})` },
    { value: 'reached',     label: `Reached (${tabCounts.calls_reached})` },
    { value: 'not_reached', label: `Not Reached (${tabCounts.calls_not_reached})` },
  ];

  const messageFilterOptions: { value: MessageFilter; label: string }[] = [
    { value: 'all',      label: `All (${tabCounts.messages})` },
    { value: 'sms',      label: `SMS (${tabCounts.messages_sms})` },
    { value: 'whatsapp', label: `WhatsApp (${tabCounts.messages_whatsapp})` },
    { value: 'email',    label: `Email (${tabCounts.messages_email})` },
  ];

  // ── Render ────────────────────────────────────────────────────
  return (
    <div>
      {/* KPI Cards */}
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem', opacity: loadingTable ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <KpiCard label="Total Calls"           value={totals.calls_made}              icon={Phone}         iconClass={styles.iconPrimary} />
        <KpiCard label="Reached"               value={totals.calls_successful}        icon={CheckCircle2}  iconClass={styles.iconGreen}  valueClass={styles.valueGreen} />
        <KpiCard label="Not Reached"           value={totals.calls_unsuccessful}      icon={PhoneOff}      iconClass={styles.iconRed}    valueClass={styles.valueRed} />
        <KpiCard label="Unreached Msg Sent"    value={totals.unreached_messages_sent} icon={SendHorizonal} iconClass={styles.iconBlue} />
        <KpiCard label="Messages Sent"         value={totals.messages_sent}           icon={MessageSquare} iconClass={styles.iconBlue} />
        <KpiCard label="Total Interactions"    value={totals.total_interactions}      icon={BarChart2}     iconClass={styles.iconPrimary} />
      </div>

      {/* Export + Table */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('daily-activity', tableData, ['rep','calls_made','calls_successful','calls_unsuccessful','unreached_messages_sent','messages_sent','total_interactions'])}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      <div style={{ opacity: loadingTable ? 0.6 : 1, transition: 'opacity 0.2s' }}>
        <DataTable
          onRowClick={row => handleOpenDrawer(row.rep)}
          columns={[
            { key: 'rep',                    label: 'Rep' },
            { key: 'calls_made',             label: 'Total Calls',       align: 'center' },
            { key: 'calls_successful',       label: 'Reached',           align: 'center', render: v => <span style={{ color: 'var(--green)', fontWeight: 600 }}>{v}</span> },
            { key: 'calls_unsuccessful',     label: 'Not Reached',       align: 'center', render: v => <span style={{ color: 'var(--red)' }}>{v}</span> },
            { key: 'unreached_messages_sent',label: 'Unreached Msg Sent',align: 'center', render: v => <span style={{ color: 'var(--blue, #3b82f6)', fontWeight: 500 }}>{v ?? 0}</span> },
            { key: 'messages_sent',          label: 'Messages Sent',     align: 'center' },
            { key: 'total_interactions',     label: 'Total Interactions',align: 'center', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          ]}
          rows={tableData}
        />
      </div>

      {/* Detail Drawer */}
      <DetailDrawer
        title={`Interactions — ${drawer?.rep ?? ''}`}
        isOpen={!!drawer}
        onClose={() => {
          setDrawer(null);
          setSearchQuery('');
          setMainTab('all');
          setCallFilter('all');
          setMessageFilter('all');
        }}
      >
        <p style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 12 }}>
          Showing interactions logged by <strong>{drawer?.rep}</strong>{' '}
          {selectedPurposes.length > 0 && (
            <>for <strong>{selectedPurposes.join(', ')}</strong>{' '}</>
          )}
          {drawer?.startDate && drawer?.endDate && drawer.startDate !== drawer.endDate
            ? `from ${formatDate(drawer.startDate)} to ${formatDate(drawer.endDate)}`
            : `for ${formatDate(drawer?.startDate)}`}.
        </p>

        {/* Search Bar */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by cub, parent, purpose, channel, notes..."
              style={{
                width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
                borderRadius: 8, border: '1px solid var(--border)', background: '#ffffff',
                color: 'var(--text-1)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          {searchQuery && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Showing {filteredInteractions.length} of {tabFilteredInteractions.length}</span>
              <button type="button" onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, padding: 0 }}>Clear</button>
            </div>
          )}
        </div>

        {/* Main Tabs: All | Calls | Messages */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {mainTabDefs.map(tab => {
            const isActive = mainTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => { setMainTab(tab.key); setSearchQuery(''); }}
                style={{
                  padding: '7px 14px', fontSize: 12, fontWeight: 600, border: 'none',
                  borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                  background: 'none', color: isActive ? 'var(--primary)' : 'var(--text-3)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'color 0.15s, border-color 0.15s', marginBottom: -1,
                }}
              >
                {tab.label}
                {!loadingInteractions && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                    background: isActive ? 'var(--primary)' : 'var(--bg-hover)',
                    color: isActive ? '#fff' : 'var(--text-3)',
                    minWidth: 18, textAlign: 'center',
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sub-filter Dropdown (shown for Calls and Messages tabs) */}
        {(mainTab === 'calls' || mainTab === 'messages') && (
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Filter:
            </span>
            {mainTab === 'calls' && (
              <SubFilter
                options={callFilterOptions}
                value={callFilter}
                onChange={v => { setCallFilter(v); setSearchQuery(''); }}
              />
            )}
            {mainTab === 'messages' && (
              <SubFilter
                options={messageFilterOptions}
                value={messageFilter}
                onChange={v => { setMessageFilter(v); setSearchQuery(''); }}
              />
            )}
          </div>
        )}

        {/* Interaction List */}
        {loadingInteractions ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>Loading interactions...</div>
        ) : interactions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No interactions logged for this period.</div>
        ) : tabFilteredInteractions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No {mainTab === 'calls' ? (callFilter === 'reached' ? 'reached' : callFilter === 'not_reached' ? 'unreached' : '') + ' call' : mainTab === 'messages' ? (messageFilter !== 'all' ? messageFilter.toUpperCase() + ' ' : '') + 'message' : ''} interactions for this period.
          </div>
        ) : filteredInteractions.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            No interactions match &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredInteractions.map(item => {
              const isCall = isCallType(item.type);
              const isMsg = isMessageType(item.type);
              const hasFollowUpMsg = isCall && !!item.message_sent;
              const channel = getMessageChannel(item);

              // Badge logic:
              // Calls → show status badge
              // Messages → show channel badge (blue)
              const badgeLabel = isCall ? (item.status || item.type) : channel;
              const badgeVariant = isCall
                ? (isReached(item.status) ? 'green' : item.status === 'Not Reached' ? 'red' : item.status ? 'orange' : 'blue')
                : 'blue';

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '12px 14px', borderRadius: 8,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
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
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {/* Type pill */}
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                        background: isCall ? 'var(--primary-dim)' : 'var(--bg-input)',
                        color: isCall ? 'var(--primary)' : 'var(--text-2)',
                        border: `1px solid ${isCall ? 'var(--primary)' : 'var(--border)'}`,
                        textTransform: 'uppercase',
                      }}>
                        {isCall ? 'Call' : 'Message'}
                      </span>
                      <Badge label={badgeLabel} variant={badgeVariant} />
                      {/* Follow-up message badge on unreached calls */}
                      {hasFollowUpMsg && (
                        <Badge label={`↗ ${item.message_sent}`} variant="blue" />
                      )}
                    </div>
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
              );
            })}
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
