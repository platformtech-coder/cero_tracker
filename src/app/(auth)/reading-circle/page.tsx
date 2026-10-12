import { createClient } from '@/lib/supabase/server';
import { getReadingCircleRoster, getPendingRCSignups, getAvailableRCSessions } from '@/lib/actions/reading-circle';
import { getGenCommPendingRC } from '@/lib/actions/orientation';
import { getAllReps } from '@/lib/actions/dashboard';
import { AppShell } from '@/components/layout/AppShell';
import ReadingCircleClient from './ReadingCircleClient';
import type { Profile } from '@/lib/types';

export const instant = false;

interface PageProps {
  searchParams: Promise<{ rep?: string }>;
}

export default async function ReadingCirclePage({ searchParams }: PageProps) {
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

  const [roster, pending, allReps, pendingRC, availableSessions] = await Promise.all([
    getReadingCircleRoster(repFilter),
    getPendingRCSignups(repFilter),
    isAdmin ? getAllReps() : Promise.resolve([]),
    getGenCommPendingRC(repFilter),
    getAvailableRCSessions(),
  ]);

  const { count: oriCount } = await supabase
    .from('pending_signups')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Pending')
    .eq('form_source', 'Orientation Signup');

  return (
    <AppShell 
      profile={profile as Profile} 
      pageTitle="Reading Circle"
      pendingCounts={{ rc: pending.length, orientation: oriCount || 0 }}
    >
      <ReadingCircleClient 
        initialRoster={roster} 
        initialPending={pending} 
        initialPendingRC={pendingRC}
        initialAvailableSessions={availableSessions}
        profile={profile as Profile}
        isAdmin={isAdmin}
        allReps={allReps}
        currentRep={repParam ?? 'All Reps'}
      />
    </AppShell>
  );
}
