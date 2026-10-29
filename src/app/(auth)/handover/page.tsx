import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getHandoverNotes } from '@/lib/actions/handover';
import HandoverClient from './HandoverClient';
import type { Profile } from '@/lib/types';

export const instant = false;

export default async function HandoverPage() {
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

  const notes = await getHandoverNotes();

  return (
    <HandoverClient 
      initialNotes={notes} 
      profile={profile as Profile}
    />
  );
}
