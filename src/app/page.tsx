import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const instant = false;

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  redirect('/dashboard');
}
