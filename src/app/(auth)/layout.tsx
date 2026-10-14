import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Routes under (auth) require request-time session and dynamic query params
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
