'use server';

import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath, revalidateTag } from 'next/cache';
import type { Profile, Role } from '@/lib/types';
import { z } from 'zod';

// ─── Get Profiles ──────────────────────────────────────────────
export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  if (profile?.role !== 'admin') throw new Error('Forbidden');

  const { data, error } = await queryProfiles(supabase);
  if (error) throw new Error(error.message);

  return (data as Profile[]) ?? [];
}

async function queryProfiles(supabase: any) {
  return supabase.from('profiles').select('*').order('full_name', { ascending: true });
}

// ─── Get Config Dropdowns ──────────────────────────────────────
export async function getSettingsConfig() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('config_dropdowns')
    .select('*')
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

// ─── Update Profile Role ───────────────────────────────────────
export async function updateProfileRole(id: string, role: Role) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await getProfile(supabase, user.id);

  if (profile?.role !== 'admin') return { error: 'Forbidden' };

  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', id);

  if (error) return { error: error.message };
  
  revalidatePath('/settings');
  return { success: true };
}

// ─── Create/Update Config ──────────────────────────────────────
const ConfigSchema = z.object({
  id: z.number().optional(),
  category: z.string(),
  value: z.string().min(1),
  sort_order: z.number().default(0),
  is_active: z.boolean().default(true),
});

export async function saveConfigValue(formData: z.infer<typeof ConfigSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await getProfile(supabase, user.id);

  if (profile?.role !== 'admin') return { error: 'Forbidden' };

  const parsed = ConfigSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (parsed.data.id) {
    const { error } = await supabase
      .from('config_dropdowns')
      .update({
        value: parsed.data.value,
        sort_order: parsed.data.sort_order,
        is_active: parsed.data.is_active,
      })
      .eq('id', parsed.data.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('config_dropdowns')
      .insert({
        category: parsed.data.category,
        value: parsed.data.value,
        sort_order: parsed.data.sort_order,
        is_active: parsed.data.is_active,
      });
    if (error) return { error: error.message };
  }

  revalidatePath('/settings');
  revalidateTag('config-dropdowns', 'max');
  return { success: true };
}

// ─── Delete Config ───────────────────────────────────────────────
export async function deleteConfigValue(id: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await getProfile(supabase, user.id);

  if (profile?.role !== 'admin') return { error: 'Forbidden' };

  const { error } = await supabase
    .from('config_dropdowns')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath('/settings');
  revalidateTag('config-dropdowns', 'max');
  return { success: true };
}

// ─── Create User ─────────────────────────────────────────────────
// Uses service role to create auth user + profile in one go
export async function createUser({
  email,
  password,
  fullName,
  role,
  sheetRepName,
}: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  sheetRepName?: string;
}) {
  // Verify caller is admin
  const supabase = await createClient();
  const { data: { user: caller } } = await supabase.auth.getUser();
  if (!caller) return { error: 'Unauthorized' };

  const callerProfile = await getProfile(supabase, caller.id);

  if (callerProfile?.role !== 'admin') return { error: 'Forbidden' };

  if (!email || !password || !fullName) return { error: 'All fields are required.' };
  if (password.length < 6) return { error: 'Password must be at least 6 characters.' };

  const admin = createAdminClient();

  // 1. Create the auth user
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email confirmation
  });

  if (createError) return { error: createError.message };

  // 2. Upsert profile (the trigger may have already created one)
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({
      id: newUser.user!.id,
      email,
      full_name: fullName,
      role,
      sheet_rep_name: sheetRepName || null,
      plain_password: password,
    });

  if (profileError) {
    // Try to clean up the auth user if profile fails
    await admin.auth.admin.deleteUser(newUser.user!.id);
    return { error: profileError.message };
  }

  revalidatePath('/settings');
  return { success: true };
}

// ─── Delete User ──────────────────────────────────────────────────
export async function deleteUser(userId: string) {
  const supabase = await createClient();
  const { data: { user: caller } } = await supabase.auth.getUser();
  if (!caller) return { error: 'Unauthorized' };

  const callerProfile = await getProfile(supabase, caller.id);

  if (callerProfile?.role !== 'admin') return { error: 'Forbidden' };

  if (caller.id === userId) return { error: 'Cannot delete your own account' };

  const admin = createAdminClient();

  const { error: profileError } = await admin
    .from('profiles')
    .delete()
    .eq('id', userId);

  if (profileError) return { error: profileError.message };

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) return { error: authError.message };

  revalidatePath('/settings');
  return { success: true };
}

// ─── Update User Profile ──────────────────────────────────────────
export async function updateUserProfile({
  userId,
  fullName,
  email,
  role,
  password,
  sheetRepName,
}: {
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  password?: string;
  sheetRepName?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user: caller } } = await supabase.auth.getUser();
  if (!caller) return { error: 'Unauthorized' };

  const callerProfile = await getProfile(supabase, caller.id);

  if (callerProfile?.role !== 'admin') return { error: 'Forbidden' };

  const admin = createAdminClient();

  const authUpdate: { email?: string; password?: string } = {};
  if (email) authUpdate.email = email;
  if (password) authUpdate.password = password;

  if (Object.keys(authUpdate).length > 0) {
    const { error: authError } = await admin.auth.admin.updateUserById(userId, authUpdate);
    if (authError) return { error: authError.message };
  }

  const profileUpdate: Record<string, unknown> = {
    full_name: fullName,
    email,
    role,
    sheet_rep_name: sheetRepName ?? null,
  };
  if (password) profileUpdate.plain_password = password;

  const { error: profileError } = await admin
    .from('profiles')
    .update(profileUpdate)
    .eq('id', userId);

  if (profileError) return { error: profileError.message };

  revalidatePath('/settings');
  return { success: true };
}

// ─── Get User Plain Password (admin only) ──────────────────────────
export async function getUserPlainPassword(userId: string): Promise<{ password: string | null } | { error: string }> {
  const supabase = await createClient();
  const { data: { user: caller } } = await supabase.auth.getUser();
  if (!caller) return { error: 'Unauthorized' };

  const callerProfile = await getProfile(supabase, caller.id);
  if (callerProfile?.role !== 'admin') return { error: 'Forbidden' };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('plain_password')
    .eq('id', userId)
    .single();

  if (error) return { error: error.message };
  return { password: (data as any)?.plain_password ?? null };
}

