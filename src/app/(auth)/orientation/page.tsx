import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrientationMaster, getPendingOrientationSignups, getOrientationScorecardMetrics, getGenCommPendingRC } from '@/lib/actions/orientation';
import { getAllReps } from '@/lib/actions/dashboard';
import OrientationClient from './OrientationClient';
import type { Profile } from '@/lib/types';

interface PageProps {
  searchParams: Promise<{ rep?: string }>;
}

export const instant = false;

export default async function OrientationPage({ searchParams }: PageProps) {
  await connection();
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
  const repFilter = repParam && repParam !== 'All Reps' ? repParam : undefined;

  const [master, pending, allReps, scorecardMetrics, pendingRC] = await Promise.all([
    getOrientationMaster(repFilter),
    getPendingOrientationSignups(repFilter),
    getAllReps(),
    getOrientationScorecardMetrics(null, null, repFilter),
    getGenCommPendingRC(repFilter),
  ]);

  return (
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
  );
}
