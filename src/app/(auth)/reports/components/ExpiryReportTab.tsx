'use client';

import { useState } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  TrendingDown,
  BarChart2,
  Download,
} from 'lucide-react';
import type { RetentionMetricsRow, ExpiredDetailRow } from '@/lib/actions/reports';
import styles from '@/components/ui/dashboard.module.css';
import { formatDate } from '@/lib/utils/date';
import { Badge, KpiCard, DataTable, DetailDrawer, exportCSV } from './shared';

export function ExpiryReportTab({
  data
}: {
  data: {
    retention_metrics: RetentionMetricsRow[];
    expiring_soon_detail: ExpiredDetailRow[];
    expired_detail: ExpiredDetailRow[];
  };
}) {
  const [drawer, setDrawer] = useState<'expiring' | 'expired' | null>(null);

  const totals = data.retention_metrics.reduce((acc, r) => ({
    total_cubs:   acc.total_cubs + r.total_cubs,
    active_count: acc.active_count + r.active_count,
    expiring_7d:  acc.expiring_7d + r.expiring_7d,
    expiring_30d: acc.expiring_30d + r.expiring_30d,
    expired:      acc.expired + r.expired_count,
  }), { total_cubs: 0, active_count: 0, expiring_7d: 0, expiring_30d: 0, expired: 0 });

  const overallRate = totals.total_cubs > 0 ? Math.round(100 * totals.active_count / totals.total_cubs) : 0;

  return (
    <div>
      <div className={styles.statsGrid} style={{ marginBottom: '1.5rem' }}>
        <KpiCard
          label="Total Gen. Comm."
          value={totals.total_cubs}
          sub="General Community cohort"
          icon={Users}
          iconClass={styles.iconPrimary}
        />
        <KpiCard
          label="Active Cubs"
          value={totals.active_count}
          sub={`${overallRate}% retention rate`}
          icon={CheckCircle2}
          iconClass={styles.iconGreen}
          valueClass={styles.valueGreen}
        />
        <KpiCard
          label="Expiring in 7 Days"
          value={totals.expiring_7d}
          sub="Click to view urgent renewals"
          icon={AlertTriangle}
          iconClass={styles.iconRed}
          valueClass={totals.expiring_7d > 0 ? styles.valueRed : undefined}
          onClick={() => setDrawer('expiring')}
        />
        <KpiCard
          label="Expiring in 30 Days"
          value={totals.expiring_30d}
          sub="Renewal pipeline"
          icon={AlertTriangle}
          iconClass={styles.iconOrange}
          valueClass={totals.expiring_30d > 0 ? styles.valueOrange : undefined}
          onClick={() => setDrawer('expiring')}
        />
        <KpiCard
          label="Expired"
          value={totals.expired}
          sub="Click to view expired cubs"
          icon={TrendingDown}
          iconClass={styles.iconRed}
          valueClass={styles.valueRed}
          onClick={() => setDrawer('expired')}
        />
        <KpiCard
          label="Retention Rate"
          value={`${overallRate}%`}
          sub="Active / Total Gen Comm"
          icon={BarChart2}
          iconClass={overallRate >= 70 ? styles.iconGreen : overallRate >= 50 ? styles.iconOrange : styles.iconRed}
          valueClass={overallRate >= 70 ? styles.valueGreen : overallRate >= 50 ? styles.valueOrange : styles.valueRed}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          onClick={() => exportCSV('retention-metrics-gen-comm', data.retention_metrics, [
            'rep', 'total_cubs', 'active_count', 'expiring_7d', 'expiring_30d', 'expired_count', 'retention_rate_pct'
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
        columns={[
          { key: 'rep', label: 'Rep', render: v => <span style={{ fontWeight: 600 }}>{v}</span> },
          { key: 'total_cubs', label: 'Total Gen Comm', align: 'center' },
          {
            key: 'active_count',
            label: 'Active',
            align: 'center',
            render: v => <span style={{ color: 'var(--green)', fontWeight: 600 }}>{v}</span>,
          },
          {
            key: 'expiring_7d',
            label: 'Expiring ≤ 7d',
            align: 'center',
            render: v => (
              <span style={{ color: v > 0 ? 'var(--red)' : 'var(--text-3)', fontWeight: v > 0 ? 700 : 400 }}>{v}</span>
            ),
          },
          {
            key: 'expiring_30d',
            label: 'Expiring ≤ 30d',
            align: 'center',
            render: v => (
              <span style={{ color: v > 0 ? 'var(--orange)' : 'var(--text-3)', fontWeight: v > 0 ? 600 : 400 }}>{v}</span>
            ),
          },
          {
            key: 'expired_count',
            label: 'Expired',
            align: 'center',
            render: v => <span style={{ color: 'var(--red)' }}>{v}</span>,
          },
          {
            key: 'retention_rate_pct',
            label: 'Retention Rate',
            align: 'center',
            render: v => (
              <Badge label={`${v ?? 0}%`} variant={(v ?? 0) >= 70 ? 'green' : (v ?? 0) >= 50 ? 'orange' : 'red'} />
            ),
          },
        ]}
        rows={data.retention_metrics}
      />

      {/* Expiring Soon Detail Drawer */}
      <DetailDrawer
        title="Gen. Comm. Cubs — Expiring Soon"
        isOpen={drawer === 'expiring'}
        onClose={() => setDrawer(null)}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => exportCSV('expiring-soon-cubs', data.expiring_soon_detail, [
              'rep', 'cub_first_name', 'cub_last_name', 'parent_first_name', 'parent_last_name', 'parent_phone', 'sub_end_date'
            ])}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 11, cursor: 'pointer' }}
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
        {data.expiring_soon_detail.map((c, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.cub_first_name} {c.cub_last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Parent: {c.parent_first_name} {c.parent_last_name} {c.parent_phone && `(📞 ${c.parent_phone})`}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Rep: {c.rep}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>
                  Expires: {formatDate(c.sub_end_date)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </DetailDrawer>

      {/* Expired Detail Drawer */}
      <DetailDrawer
        title="Gen. Comm. Cubs — Expired"
        isOpen={drawer === 'expired'}
        onClose={() => setDrawer(null)}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            onClick={() => exportCSV('expired-cubs', data.expired_detail, [
              'rep', 'cub_first_name', 'cub_last_name', 'parent_first_name', 'parent_last_name', 'parent_phone', 'sub_end_date', 'attended_orientation', 'enrolled_rc'
            ])}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 11, cursor: 'pointer' }}
          >
            <Download size={12} /> Export CSV
          </button>
        </div>
        {data.expired_detail.map((c, i) => (
          <div key={i} style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{c.cub_first_name} {c.cub_last_name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Parent: {c.parent_first_name} {c.parent_last_name} {c.parent_phone && `(📞 ${c.parent_phone})`}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Rep: {c.rep}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
                  Expired: {formatDate(c.sub_end_date)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </DetailDrawer>
    </div>
  );
}
