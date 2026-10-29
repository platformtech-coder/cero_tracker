'use client';

import { useState } from 'react';
import {
  BookOpenCheck,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Download,
} from 'lucide-react';
import type {
  RCSessionSummaryRow,
  RCCubDetailRow,
  RCSessionRosterRow,
} from '@/lib/actions/reports';
import { getRCSessionRoster } from '@/lib/actions/reports';
import { compareRCSessionStrings } from '@/lib/utils/rc';
import styles from '@/components/ui/dashboard.module.css';
import { Badge, KpiCard, DataTable, DetailDrawer, exportCSV } from './shared';

export function RCReportTab({
  data, startDate, endDate
}: {
  data: {
    session_summary: RCSessionSummaryRow[];
    rep_metrics: { rep: string; total_enrolled: number; never_attended: number; attended_in_period: number }[];
    cub_detail: RCCubDetailRow[];
  };
  startDate: string;
  endDate: string;
}) {
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [lazyRoster, setLazyRoster] = useState<RCSessionRosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [neverAttendedDrawer, setNeverAttendedDrawer] = useState(false);
  const [lazyNeverAttended, setLazyNeverAttended] = useState<RCSessionRosterRow[]>([]);
  const [neverLoading, setNeverLoading] = useState(false);
  const [search, setSearch] = useState('');

  const sortedSessions = [...data.session_summary].sort((a, b) =>
    compareRCSessionStrings(a.session, b.session)
  );

  const totalExpected = data.session_summary.reduce((s, r) => s + r.expected_cubs, 0);
  const totalPresent  = data.session_summary.reduce((s, r) => s + r.present_count, 0);
  const totalAbsent   = data.session_summary.reduce((s, r) => s + r.absent_count, 0);
  const totalMarked   = totalPresent + totalAbsent;
  const overallRate   = totalExpected > 0 ? Math.round(100 * totalPresent / totalExpected) : 0;
  const neverAttended = data.rep_metrics.reduce((s, r) => s + r.never_attended, 0);

  const openSessionDrawer = (session: string) => {
    setSelectedSession(session);
    setSearch('');
    setLazyRoster([]);
    setRosterLoading(true);
    getRCSessionRoster(null, session, startDate, endDate)
      .then(rows => setLazyRoster(rows))
      .catch(() => setLazyRoster([]))
      .finally(() => setRosterLoading(false));
  };

  const openNeverAttendedDrawer = () => {
    setNeverAttendedDrawer(true);
    if (lazyNeverAttended.length === 0 && !neverLoading) {
      setNeverLoading(true);
      getRCSessionRoster(null, null, startDate, endDate)
        .then(rows => setLazyNeverAttended(rows.filter(c => c.total_present_ever === 0)))
        .catch(() => {})
        .finally(() => setNeverLoading(false));
    }
  };

  const filteredSessionCubs = lazyRoster.filter(c => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.cub_first_name?.toLowerCase().includes(q) ||
      c.cub_last_name?.toLowerCase().includes(q) ||
      c.parent_first_name?.toLowerCase().includes(q) ||
      c.parent_last_name?.toLowerCase().includes(q) ||
      c.parent_phone?.includes(q)
    );
  });

  const avgSessionRate = sortedSessions.length > 0
    ? Math.round(sortedSessions.reduce((sum, s) => sum + (s.attendance_rate_pct || 0), 0) / sortedSessions.length)
    : 0;

  return (
    <div>
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        <KpiCard
          label="Expected in Sessions"
          value={totalExpected}
          sub={`${sortedSessions.length} active sessions`}
          icon={BookOpenCheck}
          iconClass={styles.iconPrimary}
        />
        <KpiCard
          label="Present (Attended)"
          value={totalPresent}
          sub={`${overallRate}% of expected cubs`}
          icon={CheckCircle2}
          iconClass={styles.iconGreen}
          valueClass={styles.valueGreen}
        />
        <KpiCard
          label="Absent"
          value={totalAbsent}
          sub={`${totalMarked} records logged`}
          icon={AlertTriangle}
          iconClass={styles.iconOrange}
          valueClass={styles.valueOrange}
        />
        <KpiCard
          label="Never Attended"
          value={neverAttended}
          sub="Click to view inactive cubs"
          icon={AlertTriangle}
          iconClass={styles.iconRed}
          valueClass={styles.valueRed}
          onClick={() => openNeverAttendedDrawer()}
        />
        <KpiCard
          label="Overall Attendance Rate"
          value={`${overallRate}%`}
          sub={`Avg session: ${avgSessionRate}%`}
          icon={TrendingUp}
          iconClass={overallRate >= 70 ? styles.iconGreen : overallRate >= 40 ? styles.iconOrange : styles.iconRed}
          valueClass={overallRate >= 70 ? styles.valueGreen : overallRate >= 40 ? styles.valueOrange : styles.valueRed}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('rc-session-attendance', sortedSessions, [
            'session', 'expected_cubs', 'records_marked', 'present_count', 'absent_count', 'attendance_rate_pct'
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

      <div style={{ paddingBottom: '2.5rem' }}>
        <DataTable
          emptyMsg="No reading circle sessions found for this date range."
          onRowClick={r => openSessionDrawer(r.session)}
          columns={[
            {
              key: 'session',
              label: 'Session',
              render: v => <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>{v}</span>,
            },
            { key: 'expected_cubs', label: 'Expected', align: 'center' },
            { key: 'records_marked', label: 'Marked', align: 'center' },
            {
              key: 'present_count',
              label: 'Present',
              align: 'center',
              render: v => <span style={{ color: 'var(--green)', fontWeight: 700 }}>{v}</span>,
            },
            {
              key: 'absent_count',
              label: 'Absent',
              align: 'center',
              render: v => <span style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)' }}>{v}</span>,
            },
            {
              key: 'attendance_rate_pct',
              label: 'Rate',
              align: 'center',
              render: v => (
                <Badge label={`${v ?? 0}%`} variant={v >= 70 ? 'green' : v >= 40 ? 'orange' : 'red'} />
              ),
            },
          ]}
          rows={sortedSessions}
        />
      </div>

      {/* Session Roster Drawer */}
      <DetailDrawer
        title={`Session Roster — ${selectedSession ?? ''}`}
        isOpen={!!selectedSession}
        onClose={() => setSelectedSession(null)}
      >
        <div style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search cubs in this session..."
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 13, outline: 'none'
            }}
          />
        </div>
        {rosterLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading session roster...
          </div>
        ) : filteredSessionCubs.map((cub, i) => (
          <div key={i} style={{
            padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)',
            border: '1px solid var(--border)', marginBottom: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{cub.cub_first_name} {cub.cub_last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Parent: {cub.parent_first_name} {cub.parent_last_name}</div>
                {cub.parent_phone && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>📞 {cub.parent_phone}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <Badge
                  label={cub.present_in_period > 0 ? 'Attended' : 'Absent'}
                  variant={cub.present_in_period > 0 ? 'green' : 'red'}
                />
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Rep: {cub.rep}
                </div>
              </div>
            </div>
          </div>
        ))}
      </DetailDrawer>

      {/* Never Attended Drawer */}
      <DetailDrawer
        title="Cubs Who Have Never Attended Reading Circle"
        isOpen={neverAttendedDrawer}
        onClose={() => setNeverAttendedDrawer(false)}
      >
        {neverLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>
            Loading cubs...
          </div>
        ) : lazyNeverAttended.map((cub, i) => (
          <div key={i} style={{
            padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)',
            border: '1px solid var(--border)', marginBottom: 8
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{cub.cub_first_name} {cub.cub_last_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Session: {cub.session || 'Unassigned'} · Rep: {cub.rep}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Parent: {cub.parent_first_name} {cub.parent_last_name} {cub.parent_phone && `(📞 ${cub.parent_phone})`}</div>
          </div>
        ))}
      </DetailDrawer>
    </div>
  );
}
