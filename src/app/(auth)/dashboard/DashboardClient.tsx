'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Action, DashboardStats } from '@/lib/types';
import type { OrientationScorecardMetrics } from '@/lib/actions/orientation';
import styles from '@/components/ui/dashboard.module.css';
import sharedStyles from '@/components/ui/dashboard.module.css';
import { formatDate } from '@/lib/utils/date';



function SubStatusBadge({ status }: { status: string }) {
  const cls =
    status === 'active' ? styles.badgeGreen
    : status === 'expired' ? styles.badgeRed
    : styles.badgeOrange;
  return <span className={`${styles.badge} ${cls}`}>{status}</span>;
}

function ActionStatusBadge({ status, isOverdue }: { status: string; isOverdue: boolean }) {
  if (isOverdue || status === 'Overdue')
    return <span className={`${styles.badge} ${styles.badgeRed}`}><AlertCircle size={10} /> Overdue</span>;
  if (status === 'Completed')
    return <span className={`${styles.badge} ${styles.badgeGreen}`}><CheckCircle2 size={10} /> Completed</span>;
  if (status === 'In Progress')
    return <span className={`${styles.badge} ${styles.badgeBlue}`}><Clock size={10} /> In Progress</span>;
  if (status === 'Not started')
    return <span className={`${styles.badge} ${styles.badgeOrange}`}><Clock size={10} /> Not started</span>;
  return <span className={`${styles.badge} ${styles.badgeOrange}`}><Clock size={10} /> {status || 'Pending'}</span>;
}

// ─── Stat Cards ────────────────────────────────────────────────
function StatCard({
  label, value, sub, iconClass, valueClass, icon: Icon,
}: {
  label: string; value: number | string; sub?: string;
  iconClass: string; valueClass?: string; icon: React.ElementType;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statHeader}>
        <span className={styles.statLabel}>{label}</span>
        <div className={`${styles.statIcon} ${iconClass}`}>
          <Icon size={16} strokeWidth={2} />
        </div>
      </div>
      <div className={`${styles.statValue} ${valueClass ?? ''}`}>{value}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

import {
  Users, UserCheck, UserX, Bell, Flag, CheckSquare, BookOpenCheck, Compass,
  Target, TrendingUp, BookOpen,
} from 'lucide-react';

// ─── 7-Day Orientation Scorecard ───────────────────────────────
function OrientationScorecard({ metrics }: { metrics: OrientationScorecardMetrics }) {
  const rateColor = metrics.completion_rate >= 70 ? styles.valueGreen
    : metrics.completion_rate >= 40 ? styles.valueOrange
    : styles.valueRed;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem', fontWeight: 600 }}>
        7-Day Orientation Scorecard (Gen. Comm)
      </div>
      <div className={styles.statsGrid}>
        <StatCard
          label="7-Day Rate"
          value={`${metrics.completion_rate}%`}
          sub={`${metrics.completed_within_7d} of ${metrics.window_elapsed} evaluated`}
          icon={Target}
          iconClass={metrics.completion_rate >= 70 ? styles.iconGreen : metrics.completion_rate >= 40 ? styles.iconOrange : styles.iconRed}
          valueClass={rateColor}
        />
        <StatCard
          label="In Evaluation"
          value={metrics.in_window}
          sub="Active 7-day window"
          icon={Clock}
          iconClass={styles.iconBlue}
        />
        <StatCard
          label="Awaiting Invite"
          value={metrics.awaiting_invitation}
          icon={UserX}
          iconClass={styles.iconOrange}
          valueClass={metrics.awaiting_invitation > 0 ? styles.valueOrange : undefined}
        />
        <StatCard
          label="Pending RC"
          value={metrics.pending_rc}
          sub="Need RC selection"
          icon={BookOpen}
          iconClass={styles.iconPrimary}
          valueClass={metrics.pending_rc > 0 ? styles.valuePrimary : undefined}
        />
      </div>
    </div>
  );
}

function StatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className={styles.statsGrid}>
      <StatCard label="Total Cubs" value={stats.totalCubs} icon={Users} iconClass={styles.iconPrimary} />
      <StatCard label="Active Subs" value={stats.activeSubs} icon={UserCheck} iconClass={styles.iconGreen} valueClass={styles.valueGreen} />
      <StatCard label="Expired Subs" value={stats.expiredSubs} icon={UserX} iconClass={styles.iconRed} valueClass={styles.valueRed} />
      <StatCard
        label="Expiring (7d)"
        value={stats.almostExpiringWeek}
        sub={`${stats.almostExpiringMonth} this month`}
        icon={Bell}
        iconClass={styles.iconOrange}
        valueClass={stats.almostExpiringWeek > 0 ? styles.valueOrange : undefined}
      />
      <StatCard
        label="Pending Actions"
        value={stats.pendingActionsCount}
        sub={`${stats.completedActionsCount} completed`}
        icon={CheckSquare}
        iconClass={styles.iconBlue}
        valueClass={stats.pendingActionsCount > 0 ? styles.valueOrange : undefined}
      />
      <StatCard
        label="Flagged Cubs"
        value={stats.flaggedCubs}
        icon={Flag}
        iconClass={styles.iconRed}
        valueClass={stats.flaggedCubs > 0 ? styles.valueRed : undefined}
      />
      <StatCard
        label="RC Bookings"
        value={stats.rcPendingCount}
        icon={BookOpenCheck}
        iconClass={styles.iconPrimary}
        valueClass={stats.rcPendingCount > 0 ? styles.valuePrimary : undefined}
      />
      <StatCard
        label="Orientation Bookings"
        value={stats.orientationPendingCount}
        icon={Compass}
        iconClass={styles.iconBlue}
      />
    </div>
  );
}

// ─── Actions Table ─────────────────────────────────────────────
const PAGE_SIZE = 15;

function ActionsTable({ actions }: { actions: Action[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return actions.filter((a) => {
      const cubName = `${a.cub_first_name || ''} ${a.cub_last_name || ''}`.toLowerCase();
      const parentName = `${a.parent_first_name || ''} ${a.parent_last_name || ''}`.toLowerCase();
      const actionText = (a.action || '').toLowerCase();
      const handledBy = (a.handled_by || '').toLowerCase();
      const cubId = (a.cub_id || '').toLowerCase();

      const matchSearch =
        !q ||
        cubName.includes(q) ||
        parentName.includes(q) ||
        actionText.includes(q) ||
        handledBy.includes(q) ||
        cubId.includes(q);

      const matchStatus =
        statusFilter === 'All' ||
        (statusFilter === 'Overdue' && (a.action_status === 'Overdue' || a.overdue_status === 'Yes')) ||
        a.action_status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [actions, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className={`${styles.tableWrap} ${styles.dashboardTableWrap}`}>
      <div className={styles.tableControls}>
        <div className={styles.tableControlsLeft}>
          <div style={{ position: 'relative', flex: 0 }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }} />
            <input
              id="actions-search"
              className={styles.searchInput}
              style={{ paddingLeft: '2rem' }}
              placeholder="Search by name, action..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            id="actions-status-filter"
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="All">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Overdue">Overdue</option>
          </select>
        </div>
        <div className={styles.tableControlsRight}>
          <span className={styles.sectionCount}>{filtered.length} of {actions.length}</span>
        </div>
      </div>

      {paginated.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>
            <CheckSquare size={24} color="var(--text-3)" />
          </div>
          <div className={styles.emptyStateTitle}>No actions found</div>
          <div className={styles.emptyStateSub}>
            {search || statusFilter !== 'All' ? 'Try adjusting your filters' : 'All clear!'}
          </div>
        </div>
      ) : (
        <div className={`${sharedStyles.tableScrollBody} ${styles.dashboardTableBody}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Cub</th>
                <th>Parent</th>
                <th>Action</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Handled By</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((action, i) => (
                <tr key={action.id ?? `${action.interaction_id}-${i}`}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{action.cub_first_name} {action.cub_last_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{action.cub_id}</div>
                  </td>
                  <td>{action.parent_first_name} {action.parent_last_name}</td>
                  <td style={{ maxWidth: '220px' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={action.action}>
                      {action.action || '—'}
                    </div>
                    {action.sub_status && <SubStatusBadge status={action.sub_status} />}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {formatDate(action.action_deadline)}
                  </td>
                  <td>
                    <ActionStatusBadge
                      status={action.action_status}
                      isOverdue={action.overdue_status === 'Yes'}
                    />
                  </td>
                  <td>{action.handled_by || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className={styles.pagination}>
          <span>Page {page} of {totalPages} — {filtered.length} rows</span>
          <div className={styles.paginationBtns}>
            <button
              id="actions-prev-page"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pg = Math.min(Math.max(page - 2, 1) + i, totalPages);
              return (
                <button
                  key={pg}
                  id={`actions-page-${pg}`}
                  className={`${styles.pageBtn} ${pg === page ? styles.pageBtnActive : ''}`}
                  onClick={() => setPage(pg)}
                >
                  {pg}
                </button>
              );
            })}
            <button
              id="actions-next-page"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard Client ─────────────────────────────────────
interface DashboardClientProps {
  stats: DashboardStats;
  actions: Action[];
  scorecardMetrics: OrientationScorecardMetrics;
  isAdmin?: boolean;
  allReps?: string[];
  currentRep?: string;
}

export default function DashboardClient({ stats, actions, scorecardMetrics, isAdmin, allReps, currentRep }: DashboardClientProps) {
  return (
    <div className={styles.dashboardContainer}>
      <StatsGrid stats={stats} />
      <OrientationScorecard metrics={scorecardMetrics} />
      <ActionsTable actions={actions} />
    </div>
  );
}

