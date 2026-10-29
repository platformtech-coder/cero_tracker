import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getInteractions, getAllActions as getActions } from '@/lib/actions/engagements';
import { getDropdowns, getAllReps } from '@/lib/actions/dashboard';
import EngagementsClient from './EngagementsClient';
import type { Profile } from '@/lib/types';

interface PageProps {
  searchParams: Promise<{ rep?: string }>;
}

export const instant = false;

export default async function EngagementsPage({ searchParams }: PageProps) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'viewer') {
    redirect('/directory');
  }

  const isAdmin = profile?.role === 'admin';
  const { rep: repParam } = await searchParams;
  const repFilter = isAdmin && repParam ? repParam : undefined;

  const [interactions, actions, dropdowns, allReps] = await Promise.all([
    getInteractions(repFilter),
    getActions(repFilter),
    getDropdowns(),
    isAdmin ? getAllReps() : Promise.resolve([]),
  ]);

  return (
    <EngagementsClient 
      initialInteractions={interactions} 
      initialActions={actions} 
      dropdowns={dropdowns} 
      profile={profile as Profile}
      isAdmin={isAdmin}
      allReps={allReps}
      currentRep={repParam ?? 'All Reps'}
    />
  );
}
