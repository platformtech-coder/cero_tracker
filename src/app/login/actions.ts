'use server'

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export async function login(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Check role for redirect
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single();

  const redirectUrl = profile?.role === 'viewer' ? '/directory' : '/dashboard';
  return { success: true, redirectUrl };
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get('email') as string;

  const headersList = await headers();
  const host = headersList.get('host');
  const proto = headersList.get('x-forwarded-proto') || 'https';
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : '')).replace(/\/$/, '');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/update-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: 'Password reset email sent' };
}
