'use server';

import { createClient } from '@/lib/supabase/server';

export interface LinkedCubCandidate {
  cub_id: string;
  cub_first_name: string;
  cub_last_name: string;
  parent_first_name: string | null;
  parent_last_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  grade: string | null;
  relationship_owner?: string | null;
  segment?: string | null;
}

function normalisePhone(raw?: string | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0')) return '233' + digits.slice(1);
  if (digits.length === 9) return '233' + digits;
  return digits;
}

/**
 * Searches master_cubs to suggest or manually search candidates to link to a pending signup.
 */
export async function searchCubsForLinking(params: {
  query?: string;
  parentPhone?: string;
  limit?: number;
}): Promise<LinkedCubCandidate[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const limit = params.limit || 15;
  const rawQuery = (params.query || '').trim();
  const normPhone = normalisePhone(params.parentPhone);

  // 1. If explicit query provided:
  if (rawQuery.length >= 2) {
    const isCubId = /^C\d+/i.test(rawQuery);
    let dbQuery = supabase
      .from('master_cubs')
      .select(`
        cub_id,
        cub_first_name,
        cub_last_name,
        parent_first_name,
        parent_last_name,
        parent_phone,
        parent_email,
        grade,
        cubs(relationship_owner, segment)
      `);

    if (isCubId) {
      dbQuery = dbQuery.ilike('cub_id', `%${rawQuery}%`);
    } else {
      const q = `%${rawQuery}%`;
      dbQuery = dbQuery.or(
        `cub_id.ilike.${q},cub_first_name.ilike.${q},cub_last_name.ilike.${q},parent_first_name.ilike.${q},parent_last_name.ilike.${q},parent_phone.ilike.${q}`
      );
    }

    const { data, error } = await dbQuery.limit(limit);
    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      cub_id: row.cub_id,
      cub_first_name: row.cub_first_name,
      cub_last_name: row.cub_last_name,
      parent_first_name: row.parent_first_name,
      parent_last_name: row.parent_last_name,
      parent_phone: row.parent_phone,
      parent_email: row.parent_email,
      grade: row.grade,
      relationship_owner: row.cubs?.relationship_owner ?? null,
      segment: row.cubs?.segment ?? null,
    }));
  }

  // 2. If no query, but parentPhone provided: find all siblings under this phone
  if (normPhone) {
    const { data, error } = await supabase
      .from('master_cubs')
      .select(`
        cub_id,
        cub_first_name,
        cub_last_name,
        parent_first_name,
        parent_last_name,
        parent_phone,
        parent_email,
        grade,
        cubs(relationship_owner, segment)
      `)
      .eq('parent_phone', normPhone)
      .limit(limit);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row: any) => ({
      cub_id: row.cub_id,
      cub_first_name: row.cub_first_name,
      cub_last_name: row.cub_last_name,
      parent_first_name: row.parent_first_name,
      parent_last_name: row.parent_last_name,
      parent_phone: row.parent_phone,
      parent_email: row.parent_email,
      grade: row.grade,
      relationship_owner: row.cubs?.relationship_owner ?? null,
      segment: row.cubs?.segment ?? null,
    }));
  }

  return [];
}

/**
 * Fetch detailed profile for a specific cub by cub_id.
 */
export async function getLinkedCubDetails(cubId: string): Promise<LinkedCubCandidate | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data, error } = await supabase
    .from('master_cubs')
    .select(`
      cub_id,
      cub_first_name,
      cub_last_name,
      parent_first_name,
      parent_last_name,
      parent_phone,
      parent_email,
      grade,
      cubs(relationship_owner, segment)
    `)
    .eq('cub_id', cubId.trim())
    .maybeSingle();

  if (error || !data) return null;

  const row = data as any;
  return {
    cub_id: row.cub_id,
    cub_first_name: row.cub_first_name,
    cub_last_name: row.cub_last_name,
    parent_first_name: row.parent_first_name,
    parent_last_name: row.parent_last_name,
    parent_phone: row.parent_phone,
    parent_email: row.parent_email,
    grade: row.grade,
    relationship_owner: row.cubs?.relationship_owner ?? null,
    segment: row.cubs?.segment ?? null,
  };
}
