import { createClient } from '@/lib/supabase/server';
import { getHandoverNotes } from '@/lib/actions/handover';
import { AppShell } from '@/components/layout/AppShell';
import HandoverClient from './HandoverClient';
import type { Profile } from '@/lib/types';

export const instant = false;

export default async function HandoverPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const notes = await getHandoverNotes();

  // Also get pending counts for sidebar
  const { count: rcCount } = await supabase
    .from('pending_signups')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Pending')
    .eq('form_source', 'Reading Circle Signup');
    
  const { count: oriCount } = await supabase
    .from('pending_signups')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Pending')
    .eq('form_source', 'Orientation Signup');

  return (
    <AppShell 
      profile={profile as Profile} 
      pageTitle="Handover Notes"
      pendingCounts={{ rc: rcCount || 0, orientation: oriCount || 0 }}
    >
      <HandoverClient 
        initialNotes={notes} 
        profile={profile as Profile}
      />
    </AppShell>
  );
}
