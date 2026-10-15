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

  const { data: pendingRows } = await supabase
    .from('pending_signups')
    .select('form_source')
    .eq('status', 'Pending');

  let rcCount = 0;
  let oriCount = 0;
  for (const row of pendingRows ?? []) {
    if (row.form_source === 'Reading Circle Signup') rcCount++;
    else if (row.form_source === 'Orientation Signup') oriCount++;
  }

  return (
    <AppShell
      profile={profile as Profile}
      pendingCounts={{
        rc: rcCount,
        orientation: oriCount,
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
