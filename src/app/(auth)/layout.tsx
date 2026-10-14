import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
import { AppShell } from '@/components/layout/AppShell';
import type { Profile } from '@/lib/types';

export const instant = false;

async function AuthContent({ children }: { children: React.ReactNode }) {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await getProfile(supabase, user.id);

  const [rcCountRes, oriCountRes] = await Promise.all([
    supabase
      .from('pending_signups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .eq('form_source', 'Reading Circle Signup'),
    supabase
      .from('pending_signups')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'Pending')
      .eq('form_source', 'Orientation Signup'),
  ]);

  return (
    <AppShell
      profile={profile as Profile}
      pendingCounts={{
        rc: rcCountRes.count || 0,
        orientation: oriCountRes.count || 0,
      }}
    >
      {children}
    </AppShell>
  );
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AuthContent>{children}</AuthContent>
    </Suspense>
  );
}
