'use client';

import { useState } from 'react';
import { Users, PhoneOff, Download, Search } from 'lucide-react';
import type { CallParentsReportData, CallParentsFamilyDetailRow } from '@/lib/actions/reports';
import { getCallParentsDetail } from '@/lib/actions/reports';
import styles from '@/components/ui/dashboard.module.css';
import { formatDate } from '@/lib/utils/date';
import { Badge, DataTable, DetailDrawer, exportCSV } from './shared';

export function FlagsCallParentsTab({ data }: { data: CallParentsReportData }) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Reached' | 'Not Reached' | 'Not Called' | 'Multi-Cub'>('All');
  const [search, setSearch] = useState('');
  const [selectedRep, setSelectedRep] = useState('All');

  const [lazyDetail, setLazyDetail] = useState<CallParentsFamilyDetailRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const totalFamiliesDue = data.summary.reduce((s, r) => s + (r.total_families_due || 0), 0);
  const totalCubsDue = data.summary.reduce((s, r) => s + (r.total_cubs_due || 0), 0);
  const totalFamiliesCalled = data.summary.reduce((s, r) => s + (r.families_called || 0), 0);
  const totalFamiliesReached = data.summary.reduce((s, r) => s + (r.families_reached || 0), 0);
  const totalFamiliesNotReached = data.summary.reduce((s, r) => s + (r.families_not_reached || 0), 0);
  const totalFamiliesNotCalled = data.summary.reduce((s, r) => s + (r.families_not_called || 0), 0);
  const totalCubsCovered = data.summary.reduce((s, r) => s + (r.cubs_covered || 0), 0);
  const totalCubsNotCalled = data.summary.reduce((s, r) => s + (r.cubs_not_called || 0), 0);
  const totalCubsReached = data.summary.reduce((s, r) => s + (r.cubs_reached || 0), 0);
  const totalCubsNotReached = data.summary.reduce((s, r) => s + (r.cubs_not_reached || 0), 0);
  const totalMessagesSent = data.summary.reduce((s, r) => s + (r.messages_sent || 0), 0);

  const callRate = totalFamiliesDue > 0 ? Math.round((100 * totalFamiliesCalled) / totalFamiliesDue) : 0;
  const successRate = totalFamiliesCalled > 0 ? Math.round((100 * totalFamiliesReached) / totalFamiliesCalled) : 0;

  const filteredDetail = lazyDetail.filter(row => {
    if (selectedRep !== 'All' && row.rep !== selectedRep) return false;
    if (statusFilter === 'Reached' && row.call_status !== 'Reached') return false;
    if (statusFilter === 'Not Reached' && row.call_status !== 'Not Reached') return false;
    if (statusFilter === 'Not Called' && row.call_status !== 'Not Called') return false;
    if (statusFilter === 'Multi-Cub' && row.cubs_count <= 1) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchParent = row.parent_name?.toLowerCase().includes(q);
      const matchPhone = row.parent_phone?.includes(q);
      const matchRep = row.rep?.toLowerCase().includes(q);
      const matchCubs = row.cubs?.some(c => c.cub_name?.toLowerCase().includes(q) || c.cub_id?.toLowerCase().includes(q));
      if (!matchParent && !matchPhone && !matchRep && !matchCubs) return false;
    }
    return true;
  });

  const openDrawerWithFilter = (filter: 'All' | 'Reached' | 'Not Reached' | 'Not Called' | 'Multi-Cub', rep = 'All') => {
    setStatusFilter(filter);
    setSelectedRep(rep);
    setShowDrawer(true);
    if (lazyDetail.length === 0 && !detailLoading) {
      setDetailLoading(true);
      setDetailError(null);
      getCallParentsDetail(null, new Date().toISOString().slice(0, 10))
        .then(rows => setLazyDetail(rows))
        .catch(err => setDetailError(err.message ?? 'Failed to load detail'))
        .finally(() => setDetailLoading(false));
    }
  };

  const reachedCount   = lazyDetail.filter(r => r.call_status === 'Reached').length;
  const notReachedCount = lazyDetail.filter(r => r.call_status === 'Not Reached').length;
  const notCalledCount  = lazyDetail.filter(r => r.call_status === 'Not Called').length;
  const multiCubCount   = lazyDetail.filter(r => r.cubs_count > 1).length;

  return (
    <div>
      {/* 4 Stat Boxes (consolidated so table moves up) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.25rem',
      }}>
        {/* Card 1: Families Due */}
        <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Families Due</span>
              <div className={`${styles.statIcon} ${styles.iconPrimary}`}>
                <Users size={16} />
              </div>
            </div>
            <div className={styles.statValue}>{totalFamiliesDue}</div>
          </div>
          <div className={styles.statSub}>{totalCubsDue} cubs represented</div>
        </div>

        {/* Card 2: Families Called (Split: Called on Left, Not Called on Right) */}
        <div
          className={styles.statCard}
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => openDrawerWithFilter('All')}
        >
          <div className={styles.statHeader} style={{ marginBottom: 6 }}>
            <span className={styles.statLabel}>Families Called</span>
            <Badge label={`${callRate}% Rate`} variant={callRate >= 80 ? 'green' : callRate >= 50 ? 'orange' : 'red'} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            {/* Left: Called */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Called</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.1 }}>{totalFamiliesCalled}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{totalCubsCovered} cubs</div>
            </div>
            {/* Divider */}
            <div style={{ width: 1, height: 38, background: 'var(--border)' }} />
            {/* Right: Not Called */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Not Called</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: totalFamiliesNotCalled > 0 ? 'var(--red)' : 'var(--text-1)', lineHeight: 1.1 }}>
                {totalFamiliesNotCalled}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{totalCubsNotCalled} cubs</div>
            </div>
          </div>
          <div className={styles.statSub} style={{ marginTop: 8 }}>
            Click to view called &amp; pending
          </div>
        </div>

        {/* Card 3: Families Reached */}
        <div
          className={styles.statCard}
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => openDrawerWithFilter('Reached')}
        >
          <div>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Families Reached</span>
              <Badge label={`${successRate}% Success`} variant={successRate >= 70 ? 'green' : successRate >= 40 ? 'orange' : 'red'} />
            </div>
            <div className={`${styles.statValue} ${styles.valueGreen}`}>{totalFamiliesReached}</div>
          </div>
          <div className={styles.statSub}>{totalCubsReached} cubs reached</div>
        </div>

        {/* Card 4: Families Not Reached */}
        <div
          className={styles.statCard}
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => openDrawerWithFilter('Not Reached')}
        >
          <div>
            <div className={styles.statHeader}>
              <span className={styles.statLabel}>Not Reached</span>
              <div className={`${styles.statIcon} ${styles.iconOrange}`}>
                <PhoneOff size={16} />
              </div>
            </div>
            <div className={`${styles.statValue} ${totalFamiliesNotReached > 0 ? styles.valueOrange : ''}`}>
              {totalFamiliesNotReached}
            </div>
          </div>
          <div className={styles.statSub}>
            {totalCubsNotReached} cubs · <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{totalMessagesSent} msgs sent</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('flags-call-parents-summary', data.summary, [
            'date', 'rep', 'total_families_due', 'total_cubs_due', 'families_called',
            'families_reached', 'families_not_reached', 'families_not_called',
            'cubs_covered', 'call_rate_pct', 'success_rate_pct'
          ])}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
            borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      <DataTable
        emptyMsg="No Call Parent flag snapshots for this date range."
        onRowClick={r => openDrawerWithFilter('All', r.rep)}
        columns={[
          { key: 'date', label: 'Date', render: v => <span style={{ fontWeight: 600 }}>{formatDate(v)}</span> },
          { key: 'rep', label: 'Rep', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: 'total_families_due', label: 'Families Due', align: 'center' },
          { key: 'total_cubs_due', label: 'Cubs Due', align: 'center' },
          {
            key: 'families_called',
            label: 'Called',
            align: 'center',
            render: v => <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{v}</span>,
          },
          {
            key: 'families_reached',
            label: 'Reached',
            align: 'center',
            render: v => <span style={{ color: 'var(--green)', fontWeight: 700 }}>{v}</span>,
          },
          {
            key: 'families_not_reached',
            label: 'Not Reached',
            align: 'center',
            render: v => (
              <span style={{ color: v > 0 ? 'var(--orange)' : 'var(--text-3)', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
            ),
          },
          {
            key: 'families_not_called',
            label: 'Not Called',
            align: 'center',
            render: v => (
              <span style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontWeight: v > 0 ? 700 : 400 }}>{v}</span>
            ),
          },
          {
            key: 'cubs_covered',
            label: 'Cubs Covered',
            align: 'center',
            render: (v, r: any) => (
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{v} / {r.total_cubs_due}</span>
            ),
          },
          {
            key: 'call_rate_pct',
            label: 'Call Rate',
            align: 'center',
            render: v => (
              <Badge label={`${v ?? 0}%`} variant={v >= 80 ? 'green' : v >= 50 ? 'orange' : 'red'} />
            ),
          },
        ]}
        rows={data.summary}
      />

      {/* Detail Drawer */}
      <DetailDrawer
        title="Call Parents — Families &amp; Cubs"
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by parent name, phone, rep, or cub..."
              style={{
                width: '100%', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
                borderRadius: 8, border: '1px solid var(--border)', background: '#ffffff',
                color: 'var(--text-1)', fontSize: 13, outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { id: 'All',         label: `All (${lazyDetail.length})` },
            { id: 'Reached',     label: `Reached (${reachedCount})` },
            { id: 'Not Reached', label: `Not Reached (${notReachedCount})` },
            { id: 'Not Called',  label: `Not Called (${notCalledCount})` },
            { id: 'Multi-Cub',   label: `Multi-Cub (${multiCubCount})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setStatusFilter(f.id as any)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: statusFilter === f.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: statusFilter === f.id ? 'var(--primary-dim)' : 'var(--bg-card)',
                color: statusFilter === f.id ? 'var(--primary)' : 'var(--text-2)',
                cursor: 'pointer'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {detailLoading && (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading family details...
          </div>
        )}

        {detailError && (
          <div style={{ padding: '1rem', color: 'var(--red)', fontSize: 13, background: 'var(--red-dim)', borderRadius: 8, marginBottom: 12 }}>
            {detailError}
          </div>
        )}

        {!detailLoading && filteredDetail.map((fam, i) => (
          <div key={i} style={{
            padding: '12px 14px', borderRadius: 10, background: 'var(--bg-card)',
            border: '1px solid var(--border)', marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>
                  {fam.parent_name}
                </div>
                {fam.parent_phone && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    📞 {fam.parent_phone}
                  </div>
                )}
              </div>
              <Badge
                label={fam.call_status}
                variant={fam.call_status === 'Reached' ? 'green' : fam.call_status === 'Not Reached' ? 'orange' : 'red'}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
              Rep: <strong>{fam.rep}</strong> · Cubs: {fam.cubs.map(c => c.cub_name).join(', ')}
            </div>
            {fam.last_call_feedback && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', background: 'var(--bg-input)', padding: '6px 8px', borderRadius: 6 }}>
                &ldquo;{fam.last_call_feedback}&rdquo;
              </div>
            )}
            {fam.last_call_date && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Last call: {formatDate(fam.last_call_date)} by {fam.last_call_rep}
              </div>
            )}
          </div>
        ))}
      </DetailDrawer>
    </div>
  );
}
