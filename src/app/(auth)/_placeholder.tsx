import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import type { Profile } from '@/lib/types';

export const instant = false;

export default async function PlaceholderPage({ title }: { title: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return (
    <AppShell profile={profile as Profile} pageTitle={title}>
      <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-3)' }}>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: 'var(--text-2)' }}>{title}</h2>
        <p>This page is under construction — coming soon!</p>
      </div>
    </AppShell>
  );
}
