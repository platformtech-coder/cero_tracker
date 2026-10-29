'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart2,
  Flag,
  BookOpenCheck,
  Compass,
  TrendingDown,
} from 'lucide-react';
import type {
  DailyActivityRow,
  CallParentsReportData,
  RCSessionSummaryRow,
  RCCubDetailRow,
  OrientationFunnelRow,
  OrientationDetailRow,
  RetentionMetricsRow,
  ExpiredDetailRow,
} from '@/lib/actions/reports';
import {
  getDailyActivityReport,
  getCallParentsReport,
  getRCAttendanceReport,
  getOrientationReport,
  getExpiryRetentionReport,
} from '@/lib/actions/reports';
import tabStyles from '../engagements/engagements.module.css';
import { ReportsTabContentSkeleton } from '@/components/ui/Skeleton';
import { getSundayWeek } from './components/shared';
import { FilterDropdownModule } from './components/FilterDropdownModule';
import { DailyActivityTab } from './components/DailyActivityTab';
import { FlagsCallParentsTab } from './components/FlagsCallParentsTab';
import { RCReportTab } from './components/RCReportTab';
import { OrientationReportTab } from './components/OrientationReportTab';
import { ExpiryReportTab } from './components/ExpiryReportTab';

// ─── Tab definitions ──────────────────────────────────────────

const TABS = [
  { id: 'daily',       label: 'Daily Activity',     icon: BarChart2 },
  { id: 'flags',       label: 'Flags',              icon: Flag },
  { id: 'rc',          label: 'Reading Circle',     icon: BookOpenCheck },
  { id: 'orientation', label: 'Orientation',        icon: Compass },
  { id: 'expiry',      label: 'Expiry & Retention', icon: TrendingDown },
];

// ─── Main ReportsClient ────────────────────────────────────────

interface ReportsClientProps {
  isAdmin: boolean;
  currentRep: string;
  allReps: string[];
  allPurposes?: string[];
  activeTab: string;
  dateParam?: string;
  startParam?: string;
  endParam?: string;
  dailyActivity: DailyActivityRow[];
  callParentsReport: CallParentsReportData;
  rcReport: {
    session_summary: RCSessionSummaryRow[];
    rep_metrics: { rep: string; total_enrolled: number; never_attended: number; attended_in_period: number }[];
    cub_detail: RCCubDetailRow[];
  };
  orientationReport: {
    funnel: OrientationFunnelRow[];
    not_completed_detail: OrientationDetailRow[];
  };
  expiryReport: {
    retention_metrics: RetentionMetricsRow[];
    expiring_soon_detail: ExpiredDetailRow[];
    expired_detail: ExpiredDetailRow[];
  };
}

export default function ReportsClient({
  isAdmin, currentRep, allReps, allPurposes = [], activeTab,
  dateParam, startParam, endParam,
  dailyActivity, callParentsReport, rcReport,
  orientationReport, expiryReport,
}: ReportsClientProps) {
  const searchParams = useSearchParams();

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [currentTab, setCurrentTab] = useState<string>(activeTab);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = currentTab;
  }, [currentTab]);

  const [start, setStart] = useState(startParam ?? dateParam ?? todayStr);
  const [end, setEnd]     = useState(endParam ?? dateParam ?? todayStr);

  const [dailyData, setDailyData] = useState<DailyActivityRow[] | null>(dailyActivity.length > 0 || activeTab === 'daily' ? dailyActivity : null);
  const [flagsData, setFlagsData] = useState<CallParentsReportData | null>(callParentsReport.summary.length > 0 || activeTab === 'flags' ? callParentsReport : null);
  const [rcData, setRcData] = useState<typeof rcReport | null>(rcReport.session_summary.length > 0 || activeTab === 'rc' ? rcReport : null);
  const [orientationData, setOrientationData] = useState<typeof orientationReport | null>(orientationReport.funnel.length > 0 || activeTab === 'orientation' ? orientationReport : null);
  const [expiryData, setExpiryData] = useState<typeof expiryReport | null>(expiryReport.retention_metrics.length > 0 || activeTab === 'expiry' ? expiryReport : null);

  const [loadingTab, setLoadingTab] = useState<string | null>(null);

  // Sync if initial props change
  useEffect(() => {
    setCurrentTab(activeTab);
    activeTabRef.current = activeTab;
    if (activeTab === 'daily' && dailyActivity.length > 0) setDailyData(dailyActivity);
    if (activeTab === 'flags' && callParentsReport.summary.length > 0) setFlagsData(callParentsReport);
    if (activeTab === 'rc' && rcReport.session_summary.length > 0) setRcData(rcReport);
    if (activeTab === 'orientation' && orientationReport.funnel.length > 0) setOrientationData(orientationReport);
    if (activeTab === 'expiry' && expiryReport.retention_metrics.length > 0) setExpiryData(expiryReport);
  }, [activeTab, dailyActivity, callParentsReport, rcReport, orientationReport, expiryReport]);

  const repFilter = isAdmin ? (searchParams.get('rep') || undefined) : (currentRep && currentRep !== 'All Reps' ? currentRep : undefined);

  const setTab = useCallback((t: string) => {
    setCurrentTab(t);
    activeTabRef.current = t;

    let nextStart = start;
    let nextEnd = end;
    if (t === 'daily' || t === 'flags') {
      nextStart = todayStr;
      nextEnd = todayStr;
      setStart(todayStr);
      setEnd(todayStr);
    } else if (t === 'rc') {
      const sunWeek = getSundayWeek();
      nextStart = sunWeek.start;
      nextEnd = sunWeek.end;
      setStart(sunWeek.start);
      setEnd(sunWeek.end);
    } else if (t === 'orientation' || t === 'expiry') {
      nextStart = '';
      nextEnd = '';
      setStart('');
      setEnd('');
    }

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      if (nextStart) url.searchParams.set('start', nextStart); else url.searchParams.delete('start');
      if (nextEnd) url.searchParams.set('end', nextEnd); else url.searchParams.delete('end');
      if (t === 'daily' || t === 'flags') url.searchParams.set('date', nextStart); else url.searchParams.delete('date');
      window.history.replaceState(null, '', url.pathname + url.search);
    }

    // On-demand fetch if tab data not yet loaded
    if (t === 'daily') {
      if (!dailyData || dailyData.length === 0) {
        setLoadingTab('daily');
        getDailyActivityReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'daily') setDailyData(res); })
          .catch(() => { if (activeTabRef.current === 'daily') setDailyData([]); })
          .finally(() => { if (activeTabRef.current === 'daily') setLoadingTab(null); });
      }
    } else if (t === 'flags') {
      if (!flagsData || flagsData.summary.length === 0) {
        setLoadingTab('flags');
        getCallParentsReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'flags') setFlagsData(res); })
          .catch(() => { if (activeTabRef.current === 'flags') setFlagsData({ summary: [], detail: [] }); })
          .finally(() => { if (activeTabRef.current === 'flags') setLoadingTab(null); });
      }
    } else if (t === 'rc') {
      if (!rcData || rcData.session_summary.length === 0) {
        setLoadingTab('rc');
        getRCAttendanceReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'rc') setRcData(res); })
          .catch(() => { if (activeTabRef.current === 'rc') setRcData({ session_summary: [], rep_metrics: [], cub_detail: [] }); })
          .finally(() => { if (activeTabRef.current === 'rc') setLoadingTab(null); });
      }
    } else if (t === 'orientation') {
      if (!orientationData || orientationData.funnel.length === 0) {
        setLoadingTab('orientation');
        getOrientationReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'orientation') setOrientationData(res); })
          .catch(() => { if (activeTabRef.current === 'orientation') setOrientationData({ funnel: [], not_completed_detail: [] }); })
          .finally(() => { if (activeTabRef.current === 'orientation') setLoadingTab(null); });
      }
    } else if (t === 'expiry') {
      if (!expiryData || expiryData.retention_metrics.length === 0) {
        setLoadingTab('expiry');
        getExpiryRetentionReport(repFilter, nextStart, nextEnd)
          .then(res => { if (activeTabRef.current === 'expiry') setExpiryData(res); })
          .catch(() => { if (activeTabRef.current === 'expiry') setExpiryData({ retention_metrics: [], expiring_soon_detail: [], expired_detail: [] }); })
          .finally(() => { if (activeTabRef.current === 'expiry') setLoadingTab(null); });
      }
    }
  }, [start, end, todayStr, repFilter, dailyData, flagsData, rcData, orientationData, expiryData]);

  const applyRange = useCallback((s: string, e: string) => {
    setStart(s);
    setEnd(e);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (s) url.searchParams.set('start', s); else url.searchParams.delete('start');
      if (e) url.searchParams.set('end', e); else url.searchParams.delete('end');
      if (currentTab === 'daily' || currentTab === 'flags') url.searchParams.set('date', s); else url.searchParams.delete('date');
      window.history.replaceState(null, '', url.pathname + url.search);
    }

    setLoadingTab(currentTab);

    if (currentTab === 'daily') {
      getDailyActivityReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'daily') setDailyData(res); })
        .finally(() => { if (activeTabRef.current === 'daily') setLoadingTab(null); });
    } else if (currentTab === 'flags') {
      getCallParentsReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'flags') setFlagsData(res); })
        .finally(() => { if (activeTabRef.current === 'flags') setLoadingTab(null); });
    } else if (currentTab === 'rc') {
      getRCAttendanceReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'rc') setRcData(res); })
        .finally(() => { if (activeTabRef.current === 'rc') setLoadingTab(null); });
    } else if (currentTab === 'orientation') {
      getOrientationReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'orientation') setOrientationData(res); })
        .finally(() => { if (activeTabRef.current === 'orientation') setLoadingTab(null); });
    } else if (currentTab === 'expiry') {
      getExpiryRetentionReport(repFilter, s, e)
        .then(res => { if (activeTabRef.current === 'expiry') setExpiryData(res); })
        .finally(() => { if (activeTabRef.current === 'expiry') setLoadingTab(null); });
    }
  }, [currentTab, repFilter]);

  const isContentLoading = loadingTab === currentTab;

  return (
    <div>
      {/* ── Navigation Tabs (First at the Top) ── */}
      <div className={tabStyles.tabs} style={{ marginBottom: '1.25rem' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = currentTab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`${tabStyles.tabBtn} ${active ? tabStyles.tabBtnActive : ''}`}
            >
              <Icon size={14} style={{ marginRight: 6 }} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filter Dropdown Module (Below Tabs) ── */}
      <FilterDropdownModule
        activeTab={currentTab}
        startDate={start}
        endDate={end}
        onApplyRange={applyRange}
      />

      {/* ── Tab Content or Exact Tab-Specific Skeleton Transition ── */}
      {isContentLoading ? (
        <ReportsTabContentSkeleton tab={currentTab} />
      ) : (
        <>
          {currentTab === 'daily'       && (dailyData ? <DailyActivityTab data={dailyData} startDate={start} endDate={end} allPurposes={allPurposes} repFilter={repFilter} /> : <ReportsTabContentSkeleton tab="daily" />)}
          {currentTab === 'flags'       && (flagsData ? <FlagsCallParentsTab data={flagsData} /> : <ReportsTabContentSkeleton tab="flags" />)}
          {currentTab === 'rc'          && (rcData ? <RCReportTab data={rcData} startDate={start} endDate={end} /> : <ReportsTabContentSkeleton tab="rc" />)}
          {currentTab === 'orientation' && (orientationData ? <OrientationReportTab data={orientationData} /> : <ReportsTabContentSkeleton tab="orientation" />)}
          {currentTab === 'expiry'      && (expiryData ? <ExpiryReportTab data={expiryData} /> : <ReportsTabContentSkeleton tab="expiry" />)}
        </>
      )}
    </div>
  );
}
