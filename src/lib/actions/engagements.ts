'use server';

import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { Interaction, Action } from '@/lib/types';

// ─── Get Interactions ──────────────────────────────────────────
export async function getInteractions(repFilter?: string): Promise<Interaction[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  const isAdmin = profile?.role === 'admin';
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilter = isFilteredRep;
  const filterRep = shouldFilter ? effectiveName : null;

  // 1. Fast path: server-side RPC avoids PostgREST 414 URI Too Long & JS filter loops
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_rep_interactions', {
    p_rep_name: filterRep,
  });

  if (!rpcError && rpcData) {
    return rpcData as Interaction[];
  }

  let query = supabase
    .from('interactions')
    .select('*')
    .order('date', { ascending: false });

  if (shouldFilter) {
    const { data: ownedCubs } = await supabase
      .from('cubs')
      .select('cub_id')
      .eq('relationship_owner', effectiveName!);
    const ownedCubIds = (ownedCubs ?? []).map((c: { cub_id: string }) => c.cub_id);

    // Get the user ID of the rep we are filtering by to check logged_by
    const { data: repUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('full_name', effectiveName!)
      .single();
    const repUserId = repUser?.id;

    if (ownedCubIds.length > 150) {
      // B4-03: Chunked parameterized queries avoiding both PostgREST 414 URI length and heap blowup
      const CHUNK_SIZE = 100;
      const results: Interaction[] = [];
      for (let i = 0; i < ownedCubIds.length; i += CHUNK_SIZE) {
        const slice = ownedCubIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkData } = await supabase
          .from('interactions')
          .select('*')
          .in('cub_id', slice)
          .order('date', { ascending: false })
          .limit(500);
        if (chunkData) results.push(...(chunkData as Interaction[]));
      }
      if (repUserId) {
        const { data: repData } = await supabase
          .from('interactions')
          .select('*')
          .eq('logged_by', repUserId)
          .order('date', { ascending: false })
          .limit(500);
        if (repData) results.push(...(repData as Interaction[]));
      }
      const seen = new Set<string>();
      return results
        .filter(item => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 1000);
    } else if (ownedCubIds.length > 0) {
      query = query.or(`cub_id.in.(${ownedCubIds.map(id => `"${id}"`).join(',')}),logged_by.eq.${repUserId}`);
    } else {
      query = query.eq('logged_by', repUserId);
    }
  }

  // Safe boundary to prevent unbounded heap growth
  query = query.limit(1000);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as Interaction[]) ?? [];
}

// ─── Get All Actions (Engagements page) ───────────────────────
export async function getAllActions(repFilter?: string): Promise<Action[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  const isAdmin = profile?.role === 'admin';
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilter = isFilteredRep;

  let query = supabase
    .from('actions')
    .select(`
      *,
      master_cubs(cubs(sub_status, orientation_stage, flag, relationship_owner))
    `)
    .order('action_deadline', { ascending: true, nullsFirst: false });

  if (shouldFilter) query = query.eq('handled_by', effectiveName!);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  
  // Map joined properties back to the top level action object (safe against array or object from PostgREST)
  const actions = (data || []).map((row: any) => {
    const cub = Array.isArray(row.master_cubs?.cubs) ? row.master_cubs.cubs[0] : row.master_cubs?.cubs;
    return {
      ...row,
      sub_status: cub?.sub_status,
      orientation_stage: cub?.orientation_stage,
      flag: cub?.flag,
      relationship_owner: cub?.relationship_owner,
      master_cubs: undefined,
    };
  });

  return actions as Action[];
}

// ─── Search Cubs for Log Interaction cub picker ───────────────
// Allows searching any cub across all reps, with multi-word name, ID, and phone support.
// Uses a two-pass strategy: prefix matches ranked first, then broader contains-matches,
// so e.g. "Ian" surfaces "Ian Kuwornu" before "Christian" / "Julian" / "Brian".
export async function searchCubs(query: string, searchAll = true) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const raw = query.trim();
  if (raw.length < 2) return [];

  const profile = await getProfile(supabase, user.id);
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;

  const words = raw.split(/\s+/).filter(Boolean);

  const selectFields = `
    cub_id,
    cub_first_name,
    cub_last_name,
    parent_first_name,
    parent_last_name,
    parent_phone,
    preferred_language,
    cubs ( relationship_owner )
  `;

  // ── Helper: run a PostgREST query and return data ──────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runQuery = async (filterFn: (q: any) => any, limit: number) => {
    const q = filterFn(supabase.from('master_cubs').select(selectFields));
    const { data, error } = await q.limit(limit);
    if (error) { console.error('[searchCubs error]:', error); return []; }
    return data ?? [];
  };

  // ── Build filter for ID search ─────────────────────────────────
  if (/^C\d+/i.test(raw)) {
    const data = await runQuery(q => (q as any).ilike('cub_id', `%${raw}%`), 20);
    return mapResults(data, effectiveRepName, profile);
  }

  // ── Two-pass for name / phone searches ──────────────────────────
  // Pass 1: prefix match on cub_first_name or cub_last_name (highest relevance)
  const prefixFilter = (q: any) => {
    const prefixOrs = words
      .map(w => {
        const clean = w.replace(/[,()%_]/g, '').trim();
        return clean ? `cub_first_name.ilike.${clean}%,cub_last_name.ilike.${clean}%,parent_first_name.ilike.${clean}%,parent_last_name.ilike.${clean}%` : '';
      })
      .filter(Boolean)
      .join(',');
    return prefixOrs ? q.or(prefixOrs) : q;
  };

  // Pass 2: broader contains match (catches mid-name hits)
  const containsFilter = (q: any) => {
    words.forEach((w: string) => {
      const clean = w.replace(/[,()%_]/g, '').trim();
      if (clean) {
        q = q.or(
          `cub_first_name.ilike.%${clean}%,cub_last_name.ilike.%${clean}%,parent_first_name.ilike.%${clean}%,parent_last_name.ilike.%${clean}%,parent_phone.ilike.%${clean}%,cub_id.ilike.%${clean}%`
        );
      }
    });
    return q;
  };

  const [prefixData, containsData] = await Promise.all([
    runQuery(prefixFilter, 15),
    runQuery(containsFilter, 30),
  ]);

  // Merge: prefix results first, then contains-only hits (no duplicates)
  const seenIds = new Set<string>(prefixData.map((r: any) => r.cub_id));
  const extraData = containsData.filter((r: any) => !seenIds.has(r.cub_id));
  const merged = [...prefixData, ...extraData].slice(0, 20);

  return mapResults(merged, effectiveRepName, profile);
}

function mapResults(data: any[], effectiveRepName: string | undefined, profile: any) {
  return data.map((row: any) => {
    const cubRel = Array.isArray(row.cubs) ? row.cubs[0] : row.cubs;
    const repName = cubRel?.relationship_owner ?? '';
    const isOwnContact = Boolean(
      (effectiveRepName && repName.toLowerCase() === effectiveRepName.toLowerCase()) ||
      (profile?.full_name && repName.toLowerCase() === profile.full_name.toLowerCase())
    );

    return {
      cubId: row.cub_id as string,
      cubFirstName: (row.cub_first_name as string) || '',
      cubLastName: (row.cub_last_name as string) || '',
      parentFirstName: (row.parent_first_name as string) || '',
      parentLastName: (row.parent_last_name as string) || '',
      parentPhone: (row.parent_phone as string) || '',
      preferredLanguage: (row.preferred_language as string) || '',
      repName,
      isOwnContact,
    };
  });
}

export type CubSearchResult = Awaited<ReturnType<typeof searchCubs>>[number];

// ─── Zod Schema for Log Interaction ───────────────────────────
const InteractionSchema = z.object({
  cub_id: z.string().min(1, 'Cub is required'),
  cub_first_name: z.string().min(1),
  cub_last_name: z.string().min(1),
  parent_first_name: z.string().min(1),
  parent_last_name: z.string().min(1),
  handled_by: z.string().min(1, 'Handled by is required'),
  type: z.string().min(1, 'Type is required'),
  purpose: z.string().min(1, 'Purpose is required'),
  status: z.string().optional(),
  feedback: z.string().optional(),
  message_sent: z.string().optional().nullable(),
  action_required: z.enum(['Yes', 'No']),
  action: z.string().optional(),
  action_deadline: z.string().optional(),
  action_status: z.string().optional(),
  date: z.string().optional(),
});

export type InteractionFormData = z.infer<typeof InteractionSchema>;

// ─── Submit Interaction ────────────────────────────────────────
export async function submitInteraction(formData: InteractionFormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = InteractionSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // 1. B4-02: Atomic RPC transaction procedure
  const { data: atomicData, error: atomicError } = await supabase.rpc('log_interaction_atomic', {
    p_interaction: {
      ...parsed.data,
      message_sent: parsed.data.message_sent || null,
      date: parsed.data.date || new Date().toISOString(),
    },
    p_logged_by: user.id,
  });

  let interaction: any = null;

  if (!atomicError && atomicData) {
    interaction = atomicData;
  } else {
    // 2. Resilient fallback: sequential multi-table insert
    const { data: fallbackData, error: intError } = await supabase
      .from('interactions')
      .insert({
        ...parsed.data,
        message_sent: parsed.data.message_sent || null,
        logged_by: user.id,
        date: parsed.data.date || new Date().toISOString(),
      })
      .select()
      .single();

    if (intError) return { error: intError.message };
    interaction = fallbackData;

    // If action required, create action row
    if (parsed.data.action_required === 'Yes' && parsed.data.action) {
      const { error: actionError } = await supabase.from('actions').insert({
        interaction_id: interaction.id,
        date: interaction.date,
        parent_first_name: parsed.data.parent_first_name,
        parent_last_name: parsed.data.parent_last_name,
        cub_id: parsed.data.cub_id,
        cub_first_name: parsed.data.cub_first_name,
        cub_last_name: parsed.data.cub_last_name,
        handled_by: parsed.data.handled_by,
        type: parsed.data.type,
        purpose: parsed.data.purpose,
        status: parsed.data.status,
        feedback: parsed.data.feedback,
        action_required: 'Yes',
        action: parsed.data.action,
        action_deadline: parsed.data.action_deadline || null,
        action_status: parsed.data.action_status || 'Pending',
        logged_by: user.id,
      });
      if (actionError) return { error: actionError.message };
    }

    // Update cubs last engagement
    await supabase
      .from('cubs')
      .update({
        last_engagement_activity: interaction.date,
        handled_by_last: parsed.data.handled_by,
        purpose_last: parsed.data.purpose,
      })
      .eq('cub_id', parsed.data.cub_id);

    // Update parent family record if phone or email is known
    const { data: mc } = await supabase
      .from('master_cubs')
      .select('parent_phone, parent_email')
      .eq('cub_id', parsed.data.cub_id)
      .single();

    if (mc?.parent_phone || mc?.parent_email) {
      const phone = mc.parent_phone?.trim() || null;
      const email = mc.parent_email?.toLowerCase().trim() || null;
      let fQuery = supabase.from('families').update({
        last_engagement_date: interaction.date,
        last_handled_by: parsed.data.handled_by,
        last_purpose: parsed.data.purpose,
        updated_at: new Date().toISOString(),
      });
      if (phone) fQuery = fQuery.eq('parent_phone', phone);
      else if (email) fQuery = fQuery.eq('parent_email', email);
      await fQuery;
    }
  }

  revalidatePath('/engagements');
  revalidatePath('/directory');
  revalidatePath('/dashboard');
  return { success: true, interaction };
}

// ─── Submit Multi-Cub Family Interaction ───────────────────────
export interface MultiCubInteractionPayload {
  cubs: Array<{
    cub_id: string;
    cub_first_name: string;
    cub_last_name: string;
  }>;
  parent_first_name: string;
  parent_last_name: string;
  parent_phone?: string | null;
  parent_email?: string | null;
  handled_by: string;
  type: string;
  purpose: string;
  status?: string | null;
  feedback?: string | null;
  message_sent?: string | null;
  action_required: 'Yes' | 'No';
  action?: string | null;
  action_cub_id?: string | null;
  action_deadline?: string | null;
  action_status?: string | null;
  date?: string;
}

export async function submitFamilyInteraction(data: MultiCubInteractionPayload) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  if (!data.cubs || data.cubs.length === 0) {
    return { error: 'At least one cub must be selected.' };
  }

  const interactionDate = data.date || new Date().toISOString();
  const familyInteractionId = crypto.randomUUID();

  // 1. Batch insert interaction records for all selected cubs
  const interactionRows = data.cubs.map(c => ({
    family_interaction_id: familyInteractionId,
    cub_id: c.cub_id,
    cub_first_name: c.cub_first_name,
    cub_last_name: c.cub_last_name,
    parent_first_name: data.parent_first_name,
    parent_last_name: data.parent_last_name,
    handled_by: data.handled_by,
    type: data.type,
    purpose: data.purpose,
    status: data.status || null,
    feedback: data.feedback || null,
    message_sent: data.message_sent || null,
    action_required: data.action_required,
    action: data.action || null,
    action_deadline: data.action_deadline || null,
    action_status: data.action_status || (data.action_required === 'Yes' ? 'Pending' : null),
    logged_by: user.id,
    date: interactionDate,
  }));

  const { data: inserted, error: insertErr } = await supabase
    .from('interactions')
    .insert(interactionRows)
    .select();

  if (insertErr) return { error: insertErr.message };

  // 2. Insert actions if action_required is Yes
  if (data.action_required === 'Yes' && data.action) {
    const targetCubs = data.action_cub_id && data.action_cub_id !== 'all'
      ? data.cubs.filter(c => c.cub_id === data.action_cub_id)
      : [data.cubs[0]];

    const actionRows = targetCubs.map(c => {
      const matchInt = (inserted || []).find((i: any) => i.cub_id === c.cub_id) || inserted?.[0];
      return {
        interaction_id: matchInt?.id || familyInteractionId,
        date: interactionDate,
        parent_first_name: data.parent_first_name,
        parent_last_name: data.parent_last_name,
        cub_id: c.cub_id,
        cub_first_name: c.cub_first_name,
        cub_last_name: c.cub_last_name,
        handled_by: data.handled_by,
        type: data.type,
        purpose: data.purpose,
        status: data.status || null,
        feedback: data.feedback || null,
        action_required: 'Yes' as const,
        action: data.action!,
        action_deadline: data.action_deadline || null,
        action_status: (data.action_status || 'Pending') as any,
        logged_by: user.id,
      };
    });

    await supabase.from('actions').insert(actionRows);
  }

  // 3. Batch update last_engagement_activity on ALL selected cubs
  const cubIds = data.cubs.map(c => c.cub_id);
  await supabase
    .from('cubs')
    .update({
      last_engagement_activity: interactionDate,
      handled_by_last: data.handled_by,
      purpose_last: data.purpose,
    })
    .in('cub_id', cubIds);

  // 4. Update parent's family record
  const phone = data.parent_phone?.trim() || null;
  const email = data.parent_email?.toLowerCase().trim() || null;

  if (phone || email) {
    let fQuery = supabase.from('families').update({
      last_engagement_date: interactionDate,
      last_handled_by: data.handled_by,
      last_purpose: data.purpose,
      updated_at: new Date().toISOString(),
    });
    if (phone) fQuery = fQuery.eq('parent_phone', phone);
    else fQuery = fQuery.eq('parent_email', email!);
    await fQuery;
  }

  revalidatePath('/engagements');
  revalidatePath('/directory');
  revalidatePath('/dashboard');

  return { success: true, count: data.cubs.length, familyInteractionId };
}

// ─── Edit Interaction ──────────────────────────────────────────
// Mirrors AppScript editInteraction(): preserves original date, syncs Actions table
const EditInteractionSchema = z.object({
  id: z.string().min(1),
  cub_id: z.string().min(1),
  cub_first_name: z.string().min(1),
  cub_last_name: z.string().min(1),
  parent_first_name: z.string().min(1),
  parent_last_name: z.string().min(1),
  handled_by: z.string().min(1),
  type: z.string().min(1),
  purpose: z.string().min(1),
  status: z.string().optional(),
  feedback: z.string().optional(),
  message_sent: z.string().optional().nullable(),
  action_required: z.enum(['Yes', 'No']),
  action: z.string().optional(),
  action_deadline: z.string().optional(),
  action_status: z.string().optional(),
});

export async function editInteraction(formData: z.infer<typeof EditInteractionSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = EditInteractionSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const profile = await getProfile(supabase, user.id);
  if (profile?.role !== 'admin') {
    return { error: 'Only administrators have permission to edit interaction logs' };
  }

  // Fetch original to verify existence and preserve date
  const { data: original, error: fetchErr } = await supabase
    .from('interactions')
    .select('date, logged_by')
    .eq('id', parsed.data.id)
    .single();
  if (fetchErr || !original) return { error: 'Interaction not found' };

  // Update the interaction (preserve original date)
  const { error: updateErr } = await supabase
    .from('interactions')
    .update({
      cub_id: parsed.data.cub_id,
      cub_first_name: parsed.data.cub_first_name,
      cub_last_name: parsed.data.cub_last_name,
      parent_first_name: parsed.data.parent_first_name,
      parent_last_name: parsed.data.parent_last_name,
      handled_by: parsed.data.handled_by,
      type: parsed.data.type,
      purpose: parsed.data.purpose,
      status: parsed.data.status || null,
      feedback: parsed.data.feedback || null,
      message_sent: parsed.data.message_sent || null,
      action_required: parsed.data.action_required,
      action: parsed.data.action || null,
      action_deadline: parsed.data.action_deadline || null,
      action_status: parsed.data.action_status || null,
    })
    .eq('id', parsed.data.id);
  if (updateErr) return { error: updateErr.message };

  // Sync with Actions table
  if (parsed.data.action_required === 'Yes' && parsed.data.action) {
    await supabase.from('actions').upsert({
      interaction_id: parsed.data.id,
      date: original.date,
      parent_first_name: parsed.data.parent_first_name,
      parent_last_name: parsed.data.parent_last_name,
      cub_id: parsed.data.cub_id,
      cub_first_name: parsed.data.cub_first_name,
      cub_last_name: parsed.data.cub_last_name,
      handled_by: parsed.data.handled_by,
      type: parsed.data.type,
      purpose: parsed.data.purpose,
      status: parsed.data.status || null,
      feedback: parsed.data.feedback || null,
      action_required: 'Yes',
      action: parsed.data.action,
      action_deadline: parsed.data.action_deadline || null,
      action_status: parsed.data.action_status || 'Pending',
      logged_by: user.id,
    }, { onConflict: 'interaction_id' });
  } else {
    // Remove linked action if action_required changed to No
    await supabase.from('actions').delete().eq('interaction_id', parsed.data.id);
  }

  revalidatePath('/engagements');
  revalidatePath('/dashboard');
  return { success: true };
}

// ─── Submit Action Follow-Up ───────────────────────────────────
// Mirrors AppScript submitActionFollowUp():
//  1. Logs a new interaction as follow-up
//  2. Updates original action status (terminal: delete; non-terminal: update)
//  3. Creates new action if follow-up interaction also needs one
const FollowUpSchema = z.object({
  originalInteractionId: z.string().min(1),
  actionId: z.number().optional(),
  newActionStatus: z.enum(['Completed', 'Cancelled', 'Pending', 'Overdue', 'Not started', 'In Progress']),
  newDeadline: z.string().optional(),
  followUp: z.object({
    cub_id: z.string(),
    cub_first_name: z.string(),
    cub_last_name: z.string(),
    parent_first_name: z.string(),
    parent_last_name: z.string(),
    handled_by: z.string(),
    type: z.string(),
    purpose: z.string(),
    status: z.string().optional(),
    feedback: z.string().optional(),
    message_sent: z.string().optional().nullable(),
    action_required: z.enum(['Yes', 'No']),
    action: z.string().optional(),
    action_deadline: z.string().optional(),
  }),
});

export async function submitActionFollowUp(formData: z.infer<typeof FollowUpSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = FollowUpSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  let { originalInteractionId, actionId, newActionStatus, followUp } = parsed.data;

  // Setting a new action automatically sets initial action to Completed so there aren't multiple active actions
  if (followUp.action_required === 'Yes' && followUp.action?.trim()) {
    newActionStatus = 'Completed';
  }

  const now = new Date().toISOString();

  // 1. Log follow-up interaction
  const { data: newInt, error: intErr } = await supabase
    .from('interactions')
    .insert({
      cub_id: followUp.cub_id,
      cub_first_name: followUp.cub_first_name,
      cub_last_name: followUp.cub_last_name,
      parent_first_name: followUp.parent_first_name,
      parent_last_name: followUp.parent_last_name,
      handled_by: followUp.handled_by,
      type: followUp.type,
      purpose: followUp.purpose,
      status: followUp.status || null,
      feedback: followUp.feedback || null,
      message_sent: followUp.message_sent || null,
      action_required: followUp.action_required,
      action: followUp.action || null,
      action_deadline: followUp.action_deadline || null,
      action_status: followUp.action_required === 'Yes' ? 'Pending' : null,
      logged_by: user.id,
      date: now,
    })
    .select()
    .single();
  if (intErr) return { error: intErr.message };

  // 2. Update original interaction's action_status
  await supabase
    .from('interactions')
    .update({ action_status: newActionStatus })
    .eq('id', originalInteractionId);

  // 3. Update the original linked action in actions table
  // (Update rather than delete so action history is preserved with its completed status)
  const actionUpdatePayload: any = {
    action_status: newActionStatus,
    ...(parsed.data.newDeadline ? { action_deadline: parsed.data.newDeadline } : {}),
  };

  if (actionId) {
    await supabase.from('actions').update(actionUpdatePayload).eq('id', actionId);
  } else {
    await supabase.from('actions').update(actionUpdatePayload).eq('interaction_id', originalInteractionId);
  }

  // 4. Create new action if follow-up also requires one
  if (followUp.action_required === 'Yes' && followUp.action?.trim()) {
    await supabase.from('actions').insert({
      interaction_id: newInt.id,
      date: now,
      cub_id: followUp.cub_id,
      cub_first_name: followUp.cub_first_name,
      cub_last_name: followUp.cub_last_name,
      parent_first_name: followUp.parent_first_name,
      parent_last_name: followUp.parent_last_name,
      handled_by: followUp.handled_by,
      type: followUp.type,
      purpose: followUp.purpose,
      action_required: 'Yes',
      action: followUp.action.trim(),
      action_deadline: followUp.action_deadline || null,
      action_status: 'Pending',
      logged_by: user.id,
    });
  }

  // 5. Update cub's last engagement record
  await supabase
    .from('cubs')
    .update({
      last_engagement_activity: now,
      handled_by_last: followUp.handled_by,
      purpose_last: followUp.purpose,
    })
    .eq('cub_id', followUp.cub_id);

  revalidatePath('/engagements');
  revalidatePath('/dashboard');
  return { success: true };
}

// ─── Update Action Status ──────────────────────────────────────
const UpdateActionSchema = z.object({
  id: z.number(),
  action_status: z.enum(['Pending', 'Overdue', 'Completed', 'Cancelled', 'Not started', 'In Progress']),
  feedback: z.string().optional(),
});

export async function updateActionStatus(formData: z.infer<typeof UpdateActionSchema>) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const parsed = UpdateActionSchema.safeParse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from('actions')
    .update({
      action_status: parsed.data.action_status,
      ...(parsed.data.feedback ? { feedback: parsed.data.feedback } : {}),
    })
    .eq('id', parsed.data.id);

  if (error) return { error: error.message };

  revalidatePath('/engagements');
  revalidatePath('/dashboard');
  return { success: true };
}

// ─── Delete Interaction ────────────────────────────────────────
export async function deleteInteraction(interactionId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  const profile = await getProfile(supabase, user.id);
  if (profile?.role !== 'admin') {
    return { error: 'Only administrators have permission to delete interaction logs' };
  }

  // Verify interaction exists
  const { data: existing } = await supabase
    .from('interactions')
    .select('id, interaction_id')
    .eq('id', interactionId)
    .single();

  if (!existing) return { error: 'Interaction not found' };

  // Delete linked action first (matching both id and interaction_id to guarantee consistency)
  if (existing.interaction_id) {
    await supabase.from('actions').delete().or(`interaction_id.eq.${existing.id},interaction_id.eq.${existing.interaction_id}`);
  } else {
    await supabase.from('actions').delete().eq('interaction_id', existing.id);
  }

  const { error } = await supabase
    .from('interactions')
    .delete()
    .eq('id', interactionId);

  if (error) return { error: error.message };

  revalidatePath('/engagements');
  revalidatePath('/dashboard');
  return { success: true };
}
