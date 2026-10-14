import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDirectoryCubs, getDirectoryFamilies } from '@/lib/actions/directory';
import DirectoryClient from './DirectoryClient';
import { getAllReps, getDropdowns } from '@/lib/actions/dashboard';
import type { Profile } from '@/lib/types';

interface PageProps {
  searchParams: Promise<{ rep?: string }>;
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
  const { rep: repParam } = await searchParams;
  const repFilter = isAdmin && repParam ? repParam : undefined;

  const [cubs, families, allReps, dropdowns] = await Promise.all([
    getDirectoryCubs(repFilter),
    getDirectoryFamilies(repFilter),
    isAdmin ? getAllReps() : Promise.resolve([]),
    getDropdowns()
  ]);

  return (
    <DirectoryClient 
      initialCubs={cubs} 
      initialFamilies={families} 
      profile={profile as Profile}
      isAdmin={isAdmin}
      allReps={allReps}
      currentRep={repParam ?? 'All Reps'}
      dropdowns={dropdowns}
    />
  );
}
