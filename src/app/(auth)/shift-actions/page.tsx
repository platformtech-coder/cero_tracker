import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getShiftActions } from '@/lib/actions/shift';
import ShiftClient from './ShiftClient';
import type { Profile } from '@/lib/types';

export const instant = false;

export default async function ShiftActionsPage() {
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

  const actions = await getShiftActions();

  return (
    <ShiftClient 
      initialActions={actions} 
      profile={profile as Profile}
    />
  );
}
