'use server';

import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
import type { Cub, Family, Interaction, Action } from '@/lib/types';

// ─── Get Directory Cubs ─────────────────────────────────────────
export async function getDirectoryCubs(repFilter?: string): Promise<(Cub & { cub_first_name: string; cub_last_name: string })[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  const isAdmin = profile?.role === 'admin';
  // Use sheet_rep_name if explicitly set, otherwise fall back to full_name
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilter = !isAdmin || isFilteredRep;
  const filterRep = shouldFilter ? effectiveName : null;

  // 1. Fast path: single-query RPC bypassing PostgREST pagination limits
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_directory_cubs', {
    p_rep: filterRep,
  });

  if (!rpcError && rpcData) {
    return rpcData as (Cub & { cub_first_name: string; cub_last_name: string })[];
  }

  let allData: any[] = [];
  let from = 0;
  const size = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('cubs')
      .select(`
        *,
        master_cubs (
          cub_first_name,
          cub_last_name,
          parent_first_name,
          parent_last_name,
          parent_phone,
          parent_email,
          parent_whatsapp
        )
      `)
      .order('date_onboarded', { ascending: false, nullsFirst: false })
      .range(from, from + size - 1);

    query = query.eq('is_archived', false);

    if (shouldFilter) query = query.eq('relationship_owner', effectiveName!);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    if (data && data.length > 0) {
      allData.push(...data);
      from += size;
      hasMore = data.length === size;
    } else {
      hasMore = false;
    }
  }

  return allData.map((row: any) => ({
    ...row,
    cub_first_name: row.master_cubs?.cub_first_name ?? '',
    cub_last_name: row.master_cubs?.cub_last_name ?? '',
    parent_first_name: row.master_cubs?.parent_first_name ?? '',
    parent_last_name: row.master_cubs?.parent_last_name ?? '',
    parent_phone: row.master_cubs?.parent_phone ?? '',
    parent_email: row.master_cubs?.parent_email ?? '',
    parent_whatsapp: row.master_cubs?.parent_whatsapp ?? '',
    master_cubs: undefined, 
  }));
}

// ─── Get Directory Families ──────────────────────────────────────
export async function getDirectoryFamilies(repFilter?: string): Promise<Family[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const profile = await getProfile(supabase, user.id);

  const isAdmin = profile?.role === 'admin';
  const effectiveRepName = profile?.sheet_rep_name || profile?.full_name;
  const isFilteredRep = isAdmin && repFilter && repFilter !== 'All Reps';
  const effectiveName = isFilteredRep ? repFilter : effectiveRepName;
  const shouldFilter = !isAdmin || isFilteredRep;
  const filterRep = shouldFilter ? effectiveName : null;

  // 1. Fast path: single-query RPC bypassing PostgREST pagination limits
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_directory_families', {
    p_rep: filterRep,
  });

  if (!rpcError && rpcData) {
    return rpcData as Family[];
  }

  let allData: any[] = [];
  let from = 0;
  const size = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('families')
      .select('*')
      .order('parent_last_name', { ascending: true })
      .range(from, from + size - 1);

    if (shouldFilter) query = query.eq('relationship_owner', effectiveName!);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    
    if (data && data.length > 0) {
      allData.push(...data);
      from += size;
      hasMore = data.length === size;
    } else {
      hasMore = false;
    }
  }

  return (allData as Family[]) ?? [];
}

// ─── Get Cub Activity (Interactions & Actions & Emails) ──────
export async function getCubActivity(cubId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { interactions: [], actions: [], email_history: null };

  const [intsRes, actsRes, emailRes] = await Promise.all([
    supabase.from('interactions').select('*').eq('cub_id', cubId).order('date', { ascending: false }).limit(50),
    supabase.from('actions').select('*').eq('cub_id', cubId).neq('action_status', 'Completed').neq('action_status', 'Cancelled').order('action_deadline', { ascending: true }),
    supabase.from('email_history').select('*').eq('cub_id', cubId).single()
  ]);

  return {
    interactions: (intsRes.data as Interaction[]) || [],
    actions: (actsRes.data as Action[]) || [],
    email_history: emailRes.data || null
  };
}

import { sanitizeEmail, sanitizePhone } from '@/lib/utils/contact';

// ─── Get Cubs Belonging to a Family ────────────────────────────
export async function getCubsForFamily(parentPhone: string | null, parentEmail: string | null): Promise<(Cub & { cub_first_name: string; cub_last_name: string })[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const validPhone = sanitizePhone(parentPhone);
  const validEmail = sanitizeEmail(parentEmail);

  // Find cub_ids from master_cubs that match this parent's phone or email
  let query = supabase.from('master_cubs').select('cub_id');
  if (validPhone && validEmail) {
    query = query.or(`parent_phone.eq.${validPhone},parent_email.eq.${validEmail}`);
  } else if (validPhone) {
    query = query.eq('parent_phone', validPhone);
  } else if (validEmail) {
    query = query.eq('parent_email', validEmail);
  } else {
    return [];
  }

  const { data: masterRows } = await query;
  if (!masterRows || masterRows.length === 0) return [];

  const cubIds = masterRows.map((r: any) => r.cub_id);

  const { data: cubs, error } = await supabase
    .from('cubs')
    .select(`*, master_cubs(cub_first_name, cub_last_name, parent_first_name, parent_last_name, parent_phone, parent_email, parent_whatsapp)`)
    .in('cub_id', cubIds);

  if (error || !cubs) return [];

  return cubs.map((row: any) => ({
    ...row,
    cub_first_name: row.master_cubs?.cub_first_name ?? '',
    cub_last_name: row.master_cubs?.cub_last_name ?? '',
    parent_first_name: row.master_cubs?.parent_first_name ?? '',
    parent_last_name: row.master_cubs?.parent_last_name ?? '',
    parent_phone: row.master_cubs?.parent_phone ?? '',
    parent_email: sanitizeEmail(row.master_cubs?.parent_email) ?? '',
    parent_whatsapp: row.master_cubs?.parent_whatsapp ?? '',
    master_cubs: undefined,
  })) as any[];
}

export interface CubSiblingItem {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  grade?: string | null;
  segment?: string | null;
  school_name?: string | null;
  sub_status?: string | null;
  last_engagement_activity?: string | null;
  handled_by_last?: string | null;
  purpose_last?: string | null;
}

export interface CubSiblingsResponse {
  siblings: CubSiblingItem[];
  parent_phone: string | null;
  parent_email: string | null;
  parent_first_name: string;
  parent_last_name: string;
  preferred_language?: string | null;
  last_engagement_date?: string | null;
  last_handled_by?: string | null;
  last_purpose?: string | null;
}

// ─── Get Siblings and Family Touchpoint for a Cub ──────────────
export async function getSiblingsForCub(cubId: string): Promise<CubSiblingsResponse> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { siblings: [], parent_phone: null, parent_email: null, parent_first_name: '', parent_last_name: '' };

  const { data: currentMaster } = await supabase
    .from('master_cubs')
    .select('parent_phone, parent_email, parent_first_name, parent_last_name, preferred_language')
    .eq('cub_id', cubId)
    .single();

  if (!currentMaster) return { siblings: [], parent_phone: null, parent_email: null, parent_first_name: '', parent_last_name: '' };

  const phone = sanitizePhone(currentMaster.parent_phone);
  const email = sanitizeEmail(currentMaster.parent_email);

  if (!phone && !email) {
    return {
      siblings: [],
      parent_phone: null,
      parent_email: null,
      parent_first_name: currentMaster.parent_first_name || '',
      parent_last_name: currentMaster.parent_last_name || '',
      preferred_language: currentMaster.preferred_language || null,
    };
  }

  let famQuery = supabase.from('families').select('*');
  if (phone) famQuery = famQuery.eq('parent_phone', phone);
  else famQuery = famQuery.eq('parent_email', email!);
  const { data: familyRow } = await famQuery.maybeSingle();

  let mcQuery = supabase.from('master_cubs').select('cub_id');
  if (phone && email) {
    mcQuery = mcQuery.or(`parent_phone.eq.${phone},parent_email.eq.${email}`);
  } else if (phone) {
    mcQuery = mcQuery.eq('parent_phone', phone);
  } else {
    mcQuery = mcQuery.eq('parent_email', email!);
  }

  const { data: masterRows } = await mcQuery;
  const allIds = (masterRows ?? []).map((r: any) => r.cub_id).filter((id: string) => id !== cubId);

  const prefLang = familyRow?.preferred_language || currentMaster.preferred_language || null;

  if (allIds.length === 0) {
    return {
      siblings: [],
      parent_phone: phone,
      parent_email: email,
      parent_first_name: currentMaster.parent_first_name || '',
      parent_last_name: currentMaster.parent_last_name || '',
      preferred_language: prefLang,
      last_engagement_date: familyRow?.last_engagement_date,
      last_handled_by: familyRow?.last_handled_by,
      last_purpose: familyRow?.last_purpose,
    };
  }

  const { data: cubs } = await supabase
    .from('cubs')
    .select('cub_id, grade, segment, school_name, sub_status, last_engagement_activity, handled_by_last, purpose_last, master_cubs(cub_first_name, cub_last_name)')
    .in('cub_id', allIds)
    .eq('is_archived', false);

  const siblings: CubSiblingItem[] = (cubs ?? []).map((c: any) => ({
    cub_id: c.cub_id,
    cub_first_name: c.master_cubs?.cub_first_name || '',
    cub_last_name: c.master_cubs?.cub_last_name || '',
    grade: c.grade,
    segment: c.segment,
    school_name: c.school_name,
    sub_status: c.sub_status,
    last_engagement_activity: c.last_engagement_activity,
    handled_by_last: c.handled_by_last,
    purpose_last: c.purpose_last,
  }));

  return {
    siblings,
    parent_phone: phone,
    parent_email: email,
    parent_first_name: currentMaster.parent_first_name || '',
    parent_last_name: currentMaster.parent_last_name || '',
    preferred_language: prefLang,
    last_engagement_date: familyRow?.last_engagement_date,
    last_handled_by: familyRow?.last_handled_by,
    last_purpose: familyRow?.last_purpose,
  };
}
