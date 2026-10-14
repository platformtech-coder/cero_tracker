import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getReadingCircleRoster, getPendingRCSignups, getAvailableRCSessions } from '@/lib/actions/reading-circle';
import { getGenCommPendingRC } from '@/lib/actions/orientation';
import { getAllReps } from '@/lib/actions/dashboard';
import ReadingCircleClient from './ReadingCircleClient';
import type { Profile } from '@/lib/types';

interface PageProps {
  searchParams: Promise<{ rep?: string }>;
}

export const instant = false;

export default async function ReadingCirclePage({ searchParams }: PageProps) {
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

  const [roster, pending, allReps, pendingRC, availableSessions] = await Promise.all([
    getReadingCircleRoster(repFilter),
    getPendingRCSignups(repFilter),
    getAllReps(),
    getGenCommPendingRC(repFilter),
    getAvailableRCSessions(),
  ]);

  return (
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
  );
}
