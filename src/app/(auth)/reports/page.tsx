import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAllReps } from '@/lib/actions/dashboard';
import {
  getDailyActivityReport,
  getCallParentsReport,
  getRCAttendanceReport,
  getOrientationReport,
  getExpiryRetentionReport,
} from '@/lib/actions/reports';
import ReportsClient from './ReportsClient';

interface PageProps {
  searchParams: Promise<{ rep?: string; tab?: string; start?: string; end?: string; date?: string }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, sheet_rep_name')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const effectiveRep = profile?.sheet_rep_name || profile?.full_name;

  const params = await searchParams;
  const repParam  = isAdmin ? (params.rep ? params.rep : undefined) : effectiveRep;
  const tabParam  = params.tab ?? 'daily';
  let startParam = params.start;
  let endParam   = params.end;
  const dateParam  = params.date;

  const todayStr = new Date().toISOString().slice(0, 10);

  // Tab-specific default ranges
  if (tabParam === 'daily' && !startParam && !endParam && !dateParam) {
    startParam = todayStr;
    endParam = todayStr;
  } else if (tabParam === 'flags' && !startParam && !endParam && !dateParam) {
    startParam = todayStr;
    endParam = todayStr;
  } else if (tabParam === 'rc' && (!startParam || !endParam)) {
    const today = new Date();
    const day = today.getDay(); // 0 is Sunday
    const sun = new Date(today);
    sun.setDate(today.getDate() - day);
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    startParam = startParam ?? toYMD(sun);
    endParam = endParam ?? toYMD(sat);
  } else if ((tabParam === 'orientation' || tabParam === 'expiry') && !startParam && !endParam) {
    startParam = '';
    endParam = '';
  }

  // ── Empty defaults for inactive tabs ────────────────────────────────────────
  const emptyCallParents  = { summary: [], detail: [] } as Awaited<ReturnType<typeof getCallParentsReport>>;
  const emptyRC            = { session_summary: [], rep_metrics: [], cub_detail: [] } as Awaited<ReturnType<typeof getRCAttendanceReport>>;
  const emptyOrientation   = { funnel: [], not_completed_detail: [] } as Awaited<ReturnType<typeof getOrientationReport>>;
  const emptyExpiry        = { retention_metrics: [], expiring_soon_detail: [], expired_detail: [] } as Awaited<ReturnType<typeof getExpiryRetentionReport>>;

  // ── Only fetch data for the active tab (eliminates wasted DB queries) ──
  const allReps = isAdmin ? await getAllReps() : [];

  let dailyActivity     = [] as Awaited<ReturnType<typeof getDailyActivityReport>>;
  let callParentsReport = emptyCallParents;
  let rcReport          = emptyRC;
  let orientationReport = emptyOrientation;
  let expiryReport      = emptyExpiry;

  switch (tabParam) {
    case 'daily':
      dailyActivity = await getDailyActivityReport(repParam, startParam || dateParam, endParam || dateParam);
      break;
    case 'flags':
      callParentsReport = await getCallParentsReport(repParam, startParam || dateParam, endParam || dateParam);
      break;
    case 'rc':
      rcReport = await getRCAttendanceReport(repParam, startParam, endParam);
      break;
    case 'orientation':
      orientationReport = await getOrientationReport(repParam, startParam, endParam);
      break;
    case 'expiry':
      expiryReport = await getExpiryRetentionReport(repParam, startParam, endParam);
      break;
  }

  return (
    <ReportsClient
      isAdmin={isAdmin}
      currentRep={isAdmin ? (repParam ?? 'All Reps') : (effectiveRep ?? '')}
      allReps={allReps}
      activeTab={tabParam}
      dateParam={dateParam}
      startParam={startParam}
      endParam={endParam}
      dailyActivity={dailyActivity}
      callParentsReport={callParentsReport}
      rcReport={rcReport}
      orientationReport={orientationReport}
      expiryReport={expiryReport}
    />
  );
}
