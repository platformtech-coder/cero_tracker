import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDashboardStats, getDashboardActions, getAllReps } from '@/lib/actions/dashboard';
import { getOrientationScorecardMetrics } from '@/lib/actions/orientation';
import DashboardClient from './DashboardClient';

interface PageProps {
  searchParams: Promise<{ rep?: string }>;
}

export const instant = false;

export default async function DashboardPage({ searchParams }: PageProps) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';

  // Read the rep filter from URL search params (admin only)
  const { rep: repParam } = await searchParams;
  const repFilter = isAdmin && repParam ? repParam : undefined;

  // Fetch dashboard data server-side (with rep filter if applicable)
  const [stats, actions, allReps, scorecardMetrics] = await Promise.all([
    getDashboardStats(repFilter),
    getDashboardActions(repFilter),
    isAdmin ? getAllReps() : Promise.resolve([]),
    getOrientationScorecardMetrics(null, null, repFilter),
  ]);

  return (
    <DashboardClient
      stats={stats}
      actions={actions}
      scorecardMetrics={scorecardMetrics}
      isAdmin={isAdmin}
      allReps={allReps}
      currentRep={repParam ?? 'All Reps'}
    />
  );
}
