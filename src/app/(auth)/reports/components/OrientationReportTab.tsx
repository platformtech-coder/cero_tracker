'use client';

import { useState } from 'react';
import {
  Users,
  CheckCircle2,
  AlertCircle,
  Compass,
  AlertTriangle,
  BarChart2,
  Download,
  X,
} from 'lucide-react';
import type { OrientationFunnelRow, OrientationDetailRow } from '@/lib/actions/reports';
import styles from '@/components/ui/dashboard.module.css';
import { formatDate } from '@/lib/utils/date';
import { Badge, KpiCard, SectionTitle, DataTable, DetailDrawer, exportCSV } from './shared';

export function OrientationReportTab({
  data
}: {
  data: {
    funnel: OrientationFunnelRow[];
    not_completed_detail: OrientationDetailRow[];
  };
}) {
  const [drawer, setDrawer] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'in_progress' | 'not_started'>('all');
  const [selectedDrawerRep, setSelectedDrawerRep] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const totals = data.funnel.reduce((acc, r) => ({
    total_gen_comm:   acc.total_gen_comm + (r.total_gen_comm || 0),
    completed:        acc.completed + (r.completed || 0),
    not_completed:    acc.not_completed + (r.not_completed || 0),
    in_progress:      acc.in_progress + (r.in_progress || 0),
    not_started:      acc.not_started + (r.not_started || 0),
    attended_present: acc.attended_present + (r.attended_present || 0),
    booked_count:     acc.booked_count + (r.booked_count || 0),
  }), {
    total_gen_comm: 0, completed: 0, not_completed: 0,
    in_progress: 0, not_started: 0, attended_present: 0, booked_count: 0
  });

  const completionRate = totals.total_gen_comm > 0 ? Math.round(100 * totals.completed / totals.total_gen_comm) : 0;
  const overallShowRate = totals.booked_count > 0 ? Math.round(100 * totals.attended_present / totals.booked_count) : 0;

  const inProgressCount = data.not_completed_detail.filter(c => c.progress_status === 'In Progress').length;
  const notStartedCount = data.not_completed_detail.filter(c => c.progress_status === 'Not Started').length;

  const filteredCubs = data.not_completed_detail.filter(c => {
    if (selectedDrawerRep && c.rep !== selectedDrawerRep) return false;
    if (filterMode === 'in_progress' && c.progress_status !== 'In Progress') return false;
    if (filterMode === 'not_started' && c.progress_status !== 'Not Started') return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchCub = `${c.cub_first_name} ${c.cub_last_name}`.toLowerCase().includes(q);
      const matchParent = `${c.parent_first_name} ${c.parent_last_name}`.toLowerCase().includes(q);
      const matchPhone = c.parent_phone?.includes(q);
      const matchRep = c.rep?.toLowerCase().includes(q);
      if (!matchCub && !matchParent && !matchPhone && !matchRep) return false;
    }
    return true;
  });

  const handleOpenDrawerWithMode = (mode: 'all' | 'in_progress' | 'not_started') => {
    setSelectedDrawerRep(null);
    setFilterMode(mode);
    setDrawer(true);
  };

  return (
    <div>
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        <KpiCard
          label="Total Gen. Comm."
          value={totals.total_gen_comm}
          sub="General Community cohort"
          icon={Users}
          iconClass={styles.iconPrimary}
        />
        <KpiCard
          label="Completed"
          value={totals.completed}
          sub={`${completionRate}% finished journey`}
          icon={CheckCircle2}
          iconClass={styles.iconGreen}
          valueClass={styles.valueGreen}
        />
        <KpiCard
          label="Left (Not Completed)"
          value={totals.not_completed}
          sub="Click to view pending cubs"
          icon={AlertCircle}
          iconClass={styles.iconOrange}
          valueClass={styles.valueOrange}
          onClick={() => handleOpenDrawerWithMode('all')}
        />
        <KpiCard
          label="In Progress"
          value={totals.in_progress}
          sub="Invited / Booked"
          icon={Compass}
          iconClass={styles.iconBlue}
          onClick={() => handleOpenDrawerWithMode('in_progress')}
        />
        <KpiCard
          label="Not Started"
          value={totals.not_started}
          sub="Yet to begin orientation"
          icon={AlertTriangle}
          iconClass={styles.iconRed}
          valueClass={totals.not_started > 0 ? styles.valueRed : undefined}
          onClick={() => handleOpenDrawerWithMode('not_started')}
        />
        <KpiCard
          label="Show Rate"
          value={`${overallShowRate}%`}
          sub={`${totals.attended_present} present / ${totals.booked_count} booked`}
          icon={BarChart2}
          iconClass={overallShowRate >= 70 ? styles.iconGreen : overallShowRate >= 40 ? styles.iconOrange : styles.iconRed}
          valueClass={overallShowRate >= 70 ? styles.valueGreen : overallShowRate >= 40 ? styles.valueOrange : styles.valueRed}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionTitle>General Community Orientation — Rep Breakdown</SectionTitle>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => handleOpenDrawerWithMode('all')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <Users size={13} /> View Pending Cubs ({totals.not_completed})
          </button>
          <button
            onClick={() => exportCSV('orientation-gen-comm-funnel', data.funnel, [
              'rep', 'total_gen_comm', 'completed', 'not_completed', 'in_progress', 'not_started', 'attended_present', 'show_rate_pct'
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
      </div>

      <DataTable
        onRowClick={r => {
          setSelectedDrawerRep(r.rep);
          setDrawer(true);
        }}
        columns={[
          { key: 'rep', label: 'Rep', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: 'total_gen_comm', label: 'Total Gen Comm', align: 'center' },
          {
            key: 'completed',
            label: 'Completed',
            align: 'center',
            render: v => <span style={{ color: 'var(--green)', fontWeight: 700 }}>{v}</span>,
          },
          {
            key: 'not_completed',
            label: 'Left (Pending)',
            align: 'center',
            render: v => <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{v}</span>,
          },
          {
            key: 'in_progress',
            label: 'In Progress',
            align: 'center',
            render: v => <span style={{ color: 'var(--blue)', fontWeight: 600 }}>{v}</span>,
          },
          {
            key: 'not_started',
            label: 'Not Started',
            align: 'center',
            render: v => <span style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontWeight: v > 0 ? 700 : 400 }}>{v}</span>,
          },
          { key: 'attended_present', label: 'Attended (Present)', align: 'center' },
          {
            key: 'show_rate_pct',
            label: 'Show Rate',
            align: 'center',
            render: v => (
              <Badge label={`${v ?? 0}%`} variant={(v ?? 0) >= 70 ? 'green' : (v ?? 0) >= 40 ? 'orange' : 'red'} />
            ),
          },
        ]}
        rows={data.funnel}
      />

      {/* Pending Cubs Drawer */}
      <DetailDrawer
        title="Gen. Comm. Cubs — Left to Complete Orientation"
        isOpen={drawer}
        onClose={() => setDrawer(false)}
      >
        <div style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pending cubs by name, parent, phone..."
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 13, outline: 'none'
            }}
          />
        </div>

        {selectedDrawerRep && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Filtered by Rep:</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 12, background: 'var(--primary-dim)',
              color: 'var(--primary)', fontSize: 12, fontWeight: 600,
            }}>
              {selectedDrawerRep}
              <button
                onClick={() => setSelectedDrawerRep(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', display: 'flex', alignItems: 'center', padding: 0 }}
                title="Clear rep filter"
              >
                <X size={12} />
              </button>
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { id: 'all',         label: `All Left (${data.not_completed_detail.length})` },
            { id: 'in_progress', label: `In Progress (${inProgressCount})` },
            { id: 'not_started', label: `Not Started (${notStartedCount})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id as any)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: filterMode === f.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                background: filterMode === f.id ? 'var(--primary-dim)' : 'var(--bg-card)',
                color: filterMode === f.id ? 'var(--primary)' : 'var(--text-2)',
                cursor: 'pointer'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => exportCSV('orientation-pending-cubs', filteredCubs, [
              'rep', 'cub_first_name', 'cub_last_name', 'parent_first_name', 'parent_last_name',
              'parent_phone', 'stage', 'session', 'booked_date', 'date_onboarded', 'progress_status'
            ])}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-2)', fontSize: 11, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <Download size={12} /> Export CSV ({filteredCubs.length})
          </button>
        </div>

        {filteredCubs.map((c, i) => (
          <div key={i} style={{
            padding: '12px 14px', borderRadius: 10, background: 'var(--bg-card)',
            border: '1px solid var(--border)', marginBottom: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>
                  {c.cub_first_name} {c.cub_last_name}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                  Parent: {c.parent_first_name} {c.parent_last_name} {c.parent_phone && `(📞 ${c.parent_phone})`}
                </div>
              </div>
              <Badge
                label={c.progress_status}
                variant={c.progress_status === 'In Progress' ? 'blue' : 'red'}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
              Rep: <strong>{c.rep}</strong> · Stage: <strong>{c.stage || 'New'}</strong>
              {c.session && ` · Session: ${c.session}`}
              {c.booked_date && ` · Booked: ${formatDate(c.booked_date)}`}
            </div>
            {c.date_onboarded && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                Onboarded: {formatDate(c.date_onboarded)}
              </div>
            )}
          </div>
        ))}
      </DetailDrawer>
    </div>
  );
}
