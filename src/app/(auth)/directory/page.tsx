import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDirectoryCubs, getDirectoryFamilies } from '@/lib/actions/directory';
import DirectoryClient from './DirectoryClient';
import { getAllReps, getDropdowns } from '@/lib/actions/dashboard';
import type { Profile } from '@/lib/types';

interface PageProps {
  searchParams: Promise<{ rep?: string; tab?: string }>;
}

export const instant = false;

export default async function DirectoryPage({ searchParams }: PageProps) {
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
  const { rep: repParam, tab: tabParam } = await searchParams;
  const repFilter = isAdmin && repParam ? repParam : undefined;
  const initialTab = tabParam === 'families' ? 'families' : 'cubs';

  // Smart selective fetch: Only fetch the active tab upfront to cut server execution & payload in half!
  // The secondary tab is lazily fetched or background prefetched on idle with an instant skeleton loader.
  const [activeData, allReps, dropdowns] = await Promise.all([
    initialTab === 'families' ? getDirectoryFamilies(repFilter) : getDirectoryCubs(repFilter),
    isAdmin ? getAllReps() : Promise.resolve([]),
    getDropdowns()
  ]);

  const cubs = initialTab === 'cubs' ? (activeData as any) : null;
  const families = initialTab === 'families' ? (activeData as any) : null;

  return (
    <DirectoryClient 
      initialCubs={cubs} 
      initialFamilies={families} 
      initialTab={initialTab}
      profile={profile as Profile}
      isAdmin={isAdmin}
      allReps={allReps}
      currentRep={repParam ?? 'All Reps'}
      dropdowns={dropdowns}
    />
  );
}
