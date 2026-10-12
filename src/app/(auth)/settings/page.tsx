import { createClient } from '@/lib/supabase/server';
import { getProfiles, getSettingsConfig } from '@/lib/actions/settings';
import { getAllReps } from '@/lib/actions/dashboard';
import { AppShell } from '@/components/layout/AppShell';
import SettingsClient from './SettingsClient';
import type { Profile } from '@/lib/types';

export const instant = false;

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  let profiles: Profile[] = [];
  let config: any[] = [];
  let repNames: string[] = [];

  if (profile?.role === 'admin') {
    [profiles, config, repNames] = await Promise.all([
      getProfiles(),
      getSettingsConfig(),
      getAllReps(),
    ]);
  }

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
      pageTitle="Settings"
      pendingCounts={{ rc: rcCount || 0, orientation: oriCount || 0 }}
    >
      <SettingsClient
        profiles={profiles}
        config={config}
        profile={profile as Profile}
        repNames={repNames}
      />
    </AppShell>
  );
}
