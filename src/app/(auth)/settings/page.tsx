import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getProfiles, getSettingsConfig } from '@/lib/actions/settings';
import { getAllReps } from '@/lib/actions/dashboard';
import SettingsClient from './SettingsClient';
import type { Profile } from '@/lib/types';
import { getFormsConfigForAdmin } from '@/lib/actions/forms';
import type { FormsConfig } from '@/lib/constants/forms';

export const instant = false;

export default async function SettingsPage() {
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

  let profiles: Profile[] = [];
  let config: any[] = [];
  let repNames: string[] = [];
  let formsConfig: FormsConfig | null = null;

  if (profile?.role === 'admin') {
    [profiles, config, repNames, formsConfig] = await Promise.all([
      getProfiles(),
      getSettingsConfig(),
      getAllReps(),
      getFormsConfigForAdmin().catch(() => null),
    ]);
  }

  return (
    <SettingsClient
      profiles={profiles}
      config={config}
      profile={profile as Profile}
      repNames={repNames}
      formsConfig={formsConfig}
    />
  );
}
