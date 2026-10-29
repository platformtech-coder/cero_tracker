import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ADMIN_COOKIE_NAME = 'system_admin_session';

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error('System Admin authentication secret is not configured. Please define JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY.');
  }
  return new TextEncoder().encode(secret);
}

export interface SystemAdminSession {
  email: string;
  role: 'super_admin';
  name: string;
  loggedInAt: string;
}

export async function createSystemAdminSession(email: string, name: string = 'System Admin'): Promise<string> {
  const token = await new SignJWT({
    email,
    role: 'super_admin',
    name,
    type: 'system_admin',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 86400, // 24 hours
  });

  return token;
}

export async function getSystemAdminSession(): Promise<SystemAdminSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
    if (!token) return null;

    const { payload } = await jwtVerify(token, getJwtSecret());
    if (payload.type !== 'system_admin') return null;

    return {
      email: payload.email as string,
      role: 'super_admin',
      name: (payload.name as string) || 'System Admin',
      loggedInAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function clearSystemAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function verifySystemAdminCredentials(email: string, passwordInput: string): Promise<{ valid: boolean; name: string }> {
  const envAdminEmail = process.env.ADMIN_EMAIL;
  const envAdminPass = process.env.ADMIN_PASSWORD;

  // Check env admin credentials if configured explicitly
  if (
    envAdminEmail && envAdminPass &&
    email.toLowerCase().trim() === envAdminEmail.toLowerCase().trim() &&
    passwordInput === envAdminPass
  ) {
    return { valid: true, name: 'System Super Admin' };
  }

  // Check against Supabase profiles but require 'admin' role
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: user } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (user && user.role === 'admin') {
    const tempClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    const { data: authData, error } = await tempClient.auth.signInWithPassword({
      email,
      password: passwordInput,
    });
    
    if (authData?.user && !error) {
      await tempClient.auth.signOut();
      return { valid: true, name: user.full_name || 'System Admin' };
    }
  }

  return { valid: false, name: '' };
}
