'use server';

import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
import { revalidatePath } from 'next/cache';
import type { HandoverNote } from '@/lib/types';
import { z } from 'zod';

// ─── Get Handover Notes ────────────────────────────────────────
// All authenticated users see all handover notes (cross-rep shift handover).
// Mirrors Apps Script getHandoverData(): all notes are visible to all reps.
// Admin can filter to a specific rep's notes via repFilter.
export async function getHandoverNotes(repFilter?: string): Promise<(HandoverNote & { profile: { full_name: string } })[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  const isAdmin = profile?.role === 'admin';
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : profile?.full_name;

  // Fetch all notes without join (logged_by → auth.users, not profiles)
  const { data, error } = await supabase
    .from('handover_notes')
    .select('*')
    .order('date', { ascending: false });

  if (error) throw new Error(error.message);

  const notes = data ?? [];

  // Collect unique user IDs, then fetch their profiles in one query
  const userIds = [...new Set(notes.map((n: any) => n.logged_by).filter(Boolean))];
  let profileMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    (profileRows ?? []).forEach((p: any) => {
      profileMap[p.id] = p.full_name ?? 'Unknown';
    });
  }

  let results = notes.map((row: any) => ({
    ...row,
    profile: { full_name: profileMap[row.logged_by] ?? 'Unknown' },
  }));

  // Apply rep filter only when admin explicitly selects a specific rep
  if (isFilteredRep) {
    results = results.filter(r => r.profile.full_name === effectiveName);
  }

  return results;
}

// ─── Submit Handover Note ──────────────────────────────────────
const HandoverSchema = z.object({
  summary: z.string().min(1, 'Summary is required'),
  pending_issues: z.string().optional(),
});

export async function submitHandoverNote(formData: z.infer<typeof HandoverSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = HandoverSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from('handover_notes')
    .insert({
      summary: parsed.data.summary,
      pending_issues: parsed.data.pending_issues,
      logged_by: user.id,
      date: new Date().toISOString(),
    });

  if (error) return { error: error.message };

  revalidatePath('/handover');
  return { success: true };
}

// ─── Update Handover Note ──────────────────────────────────────
export async function updateHandoverNote(id: number, formData: z.infer<typeof HandoverSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Verify ownership
  const { data: note } = await supabase
    .from('handover_notes')
    .select('logged_by')
    .eq('id', id)
    .single();

  if (!note || note.logged_by !== user.id) return { error: 'You can only edit your own notes' };

  const parsed = HandoverSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from('handover_notes')
    .update({
      summary: parsed.data.summary,
      pending_issues: parsed.data.pending_issues,
    })
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/handover');
  return { success: true };
}

// ─── Delete Handover Note ──────────────────────────────────────
export async function deleteHandoverNote(id: number) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // Verify ownership
  const { data: note } = await supabase
    .from('handover_notes')
    .select('logged_by')
    .eq('id', id)
    .single();

  if (!note || note.logged_by !== user.id) return { error: 'You can only delete your own notes' };

  const { error } = await supabase
    .from('handover_notes')
    .delete()
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath('/handover');
  return { success: true };
}
