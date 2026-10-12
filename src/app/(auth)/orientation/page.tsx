import { createClient } from '@/lib/supabase/server';
import { getOrientationMaster, getPendingOrientationSignups, getOrientationScorecardMetrics, getGenCommPendingRC } from '@/lib/actions/orientation';
import { getAllReps } from '@/lib/actions/dashboard';
import { AppShell } from '@/components/layout/AppShell';
import OrientationClient from './OrientationClient';
import type { Profile } from '@/lib/types';

export const instant = false;

interface PageProps {
  searchParams: Promise<{ rep?: string }>;
}

export default async function OrientationPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const isAdmin = profile?.role === 'admin';
  const { rep: repParam } = await searchParams;
  const repFilter = isAdmin && repParam ? repParam : undefined;

  const [master, pending, allReps, scorecardMetrics, pendingRC] = await Promise.all([
    getOrientationMaster(repFilter),
    getPendingOrientationSignups(repFilter),
    isAdmin ? getAllReps() : Promise.resolve([]),
    getOrientationScorecardMetrics(null, null, repFilter),
    getGenCommPendingRC(repFilter),
  ]);

  const { count: rcCount } = await supabase
    .from('pending_signups')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Pending')
    .eq('form_source', 'Reading Circle Signup');

  return (
    <AppShell 
      profile={profile as Profile} 
      pageTitle="Orientation"
      pendingCounts={{ rc: rcCount || 0, orientation: pending.length }}
    >
      <OrientationClient 
        initialMaster={master} 
        initialPending={pending} 
        initialScorecardMetrics={scorecardMetrics}
        initialPendingRC={pendingRC}
        profile={profile as Profile}
        isAdmin={isAdmin}
        allReps={allReps}
        currentRep={repParam ?? 'All Reps'}
      />
    </AppShell>
  );
}
