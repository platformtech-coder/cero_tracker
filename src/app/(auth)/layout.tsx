import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const instant = false;

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Just render children – AppShell is rendered inside each page for full flexibility
  return <>{children}</>;
}
