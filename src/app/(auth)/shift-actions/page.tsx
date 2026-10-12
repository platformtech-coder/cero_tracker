import { createClient } from '@/lib/supabase/server';
import { getShiftActions } from '@/lib/actions/shift';
import { AppShell } from '@/components/layout/AppShell';
import ShiftClient from './ShiftClient';
import type { Profile } from '@/lib/types';

export const instant = false;

export default async function ShiftActionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const actions = await getShiftActions();

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
      pageTitle="Shift Actions"
      pendingCounts={{ rc: rcCount || 0, orientation: oriCount || 0 }}
    >
      <ShiftClient 
        initialActions={actions} 
        profile={profile as Profile}
      />
    </AppShell>
  );
}
