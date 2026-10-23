'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getProfile } from '@/lib/supabase/getProfile';
import { getSystemAdminSession } from '@/lib/systemAdminAuth';
import { revalidatePath } from 'next/cache';
import { updateCubAndParentProfile, updateFamilyProfile } from '@/lib/actions/update-profile';
import { sanitizePhone, sanitizeEmail } from '@/lib/utils/contact';
import type { ContactEditRequest } from '@/lib/types';

// ─── Unified Admin Context ────────────────────────────────────────────────────
// Checks system_admin_session JWT first (for /system-admin portal), then falls
// back to supabase.auth.getUser() + profile.role === 'admin' (for in-app admins).
async function getAdminContext(): Promise<{ isAdmin: true; name: string; userId?: string } | null> {
  // 1. Check System Admin JWT session (cookie-based, no Supabase Auth)
  try {
    const sysSession = await getSystemAdminSession();
    if (sysSession?.role === 'super_admin') {
      return { isAdmin: true, name: sysSession.name || 'System Administrator' };
    }
  } catch {
    // ignore and fall through
  }

  // 2. Fall back to Supabase Auth user + profile role check
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const profile = await getProfile(supabase, user.id);
      if (profile?.role === 'admin') {
        return {
          isAdmin: true,
          name: profile.full_name || profile.sheet_rep_name || user.email || 'Administrator',
          userId: user.id,
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export interface SubmitEditRequestParams {
  entityType: 'cub' | 'family';
  entityId: string;
  entityName: string;
  currentData: Record<string, any>;
  proposedData: Record<string, any>;
}

export type SubmitEditRequestResult =
  | { success: true; autoApplied: true; sheetSynced: boolean; sheetError?: string }
  | { success: true; autoApplied: false; requestId: number; msg: string }
  | { success: false; error: string };

// ─── 1. Submit Contact Edit (Auto-applies for Admin, Queues for Rep) ───────────
export async function submitContactEditRequest(params: SubmitEditRequestParams): Promise<SubmitEditRequestResult> {
  // Check admin status via unified context (handles both JWT cookie + Supabase auth)
  const adminCtx = await getAdminContext();
  const isAdmin = adminCtx !== null;

  // For non-admin paths, we still need a Supabase user for identity
  let repUser: { id: string; email?: string | null } | null = null;
  let repProfile: Awaited<ReturnType<typeof getProfile>> | null = null;
  if (!isAdmin) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Unauthorized' };
    repUser = user;
    repProfile = await getProfile(supabase, user.id);
  }

  const { entityType, entityId, entityName, currentData, proposedData } = params;

  // Clean and detect changed fields
  const changedFields: string[] = [];

  const cleanedProposed: Record<string, any> = {};

  for (const [key, val] of Object.entries(proposedData)) {
    let cleanVal = typeof val === 'string' ? val.trim() : val;
    if (key.includes('email')) {
      cleanVal = sanitizeEmail(cleanVal) ?? '';
    } else if (key.includes('phone') || key.includes('number')) {
      cleanVal = sanitizePhone(cleanVal) ?? '';
    }
    cleanedProposed[key] = cleanVal;

    let currVal = typeof currentData[key] === 'string' ? currentData[key].trim() : (currentData[key] ?? '');
    if (key.includes('email')) {
      currVal = sanitizeEmail(currVal) ?? '';
    } else if (key.includes('phone') || key.includes('number')) {
      currVal = sanitizePhone(currVal) ?? '';
    }

    if (cleanVal !== currVal) {
      changedFields.push(key);
    }
  }

  if (changedFields.length === 0) {
    return { success: false, error: 'No changes detected compared to existing contact data' };
  }

  // If user is Admin: Apply immediately and sync to Google Sheets
  if (isAdmin) {
    if (entityType === 'cub') {
      const cubFields = {
        cub_first_name: cleanedProposed.cub_first_name,
        cub_last_name: cleanedProposed.cub_last_name,
        grade: cleanedProposed.grade,
        stream: cleanedProposed.stream,
        school_name: cleanedProposed.school_name,
      };
      const parentFields = {
        parent_first_name: cleanedProposed.parent_first_name,
        parent_last_name: cleanedProposed.parent_last_name,
        parent_phone: cleanedProposed.parent_phone,
        parent_email: cleanedProposed.parent_email,
        preferred_language: cleanedProposed.preferred_language,
        alternative_contact_name: cleanedProposed.alternative_contact_name,
        alternative_contact_phone: cleanedProposed.alternative_contact_phone,
      };
      const res = await updateCubAndParentProfile(entityId, cubFields, parentFields);
      if (!res.success) return { success: false, error: res.error };
      return { success: true, autoApplied: true, sheetSynced: res.sheetSynced, sheetError: res.sheetError };
    } else {
      const res = await updateFamilyProfile(Number(entityId), cleanedProposed);
      if (!res.success) return { success: false, error: res.error };
      return { success: true, autoApplied: true, sheetSynced: res.sheetSynced, sheetError: res.sheetError };
    }
  }

  // If user is a Rep: Queue request for System Admin approval
  // First, verify there is no existing pending request for this entity
  const existingPending = await getPendingRequestForEntity(entityType, entityId);
  if (existingPending) {
    return {
      success: false,
      error: `An edit request for ${entityName} is already pending approval (submitted by ${existingPending.requester_name}). Please wait for it to be reviewed.`,
    };
  }

  const requesterName = repProfile?.sheet_rep_name || repProfile?.full_name || repUser?.email || 'Relationship Officer';

  const db = getServiceClient();
  const { data: inserted, error: insertErr } = await db
    .from('contact_edit_requests')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      requester_id: repUser!.id,
      requester_name: requesterName,
      requester_email: repUser?.email,
      status: 'pending',
      current_data: currentData,
      proposed_data: cleanedProposed,
      changed_fields: changedFields,
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    return { success: false, error: insertErr?.message || 'Failed to submit edit request for approval' };
  }

  revalidatePath('/directory');
  revalidatePath('/system-admin');

  return {
    success: true,
    autoApplied: false,
    requestId: inserted.id,
    msg: 'Edit request submitted for Admin approval. Changes will sync to Supabase and Google Sheet upon approval.',
  };
}

// ─── 2. Check Pending Request for an Entity ─────────────────────────────────
export async function getPendingRequestForEntity(entityType: 'cub' | 'family', entityId: string): Promise<ContactEditRequest | null> {
  const db = getServiceClient();
  const { data } = await db
    .from('contact_edit_requests')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as ContactEditRequest) || null;
}

// ─── 3. Get Requests for System Admin Approvals Tab ──────────────────────────
export async function getContactEditRequests(
  filter: 'pending' | 'approved' | 'declined' | 'all' = 'pending'
): Promise<{ requests: ContactEditRequest[]; pendingCount: number }> {
  const adminCtx = await getAdminContext();
  if (!adminCtx) return { requests: [], pendingCount: 0 };

  const db = getServiceClient();

  // Get total pending count for badge
  const { count: pendingCount } = await db
    .from('contact_edit_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  let q = db.from('contact_edit_requests').select('*').order('created_at', { ascending: false });
  if (filter !== 'all') {
    q = q.eq('status', filter);
  }

  const { data: requests, error } = await q.limit(100);
  if (error || !requests) return { requests: [], pendingCount: pendingCount || 0 };

  return {
    requests: requests as ContactEditRequest[],
    pendingCount: pendingCount || 0,
  };
}

// ─── 4. Approve Edit Request ────────────────────────────────────────────────
export async function approveContactEditRequest(requestId: number): Promise<{ success: boolean; error?: string; sheetSynced?: boolean; sheetError?: string }> {
  const adminCtx = await getAdminContext();
  if (!adminCtx) return { success: false, error: 'Unauthorized' };

  const db = getServiceClient();
  const { data: req, error: fetchErr } = await db
    .from('contact_edit_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchErr || !req) return { success: false, error: 'Request not found' };
  if (req.status !== 'pending') return { success: false, error: `Request is already ${req.status}` };

  const reviewerName = adminCtx.name;
  const proposed = req.proposed_data;

  // Execute the update
  let updateResult;
  if (req.entity_type === 'cub') {
    const cubFields = {
      cub_first_name: proposed.cub_first_name,
      cub_last_name: proposed.cub_last_name,
      grade: proposed.grade,
      stream: proposed.stream,
      school_name: proposed.school_name,
    };
    const parentFields = {
      parent_first_name: proposed.parent_first_name,
      parent_last_name: proposed.parent_last_name,
      parent_phone: proposed.parent_phone,
      parent_email: proposed.parent_email,
      preferred_language: proposed.preferred_language,
      alternative_contact_name: proposed.alternative_contact_name,
      alternative_contact_phone: proposed.alternative_contact_phone,
    };
    updateResult = await updateCubAndParentProfile(req.entity_id, cubFields, parentFields);
  } else {
    updateResult = await updateFamilyProfile(Number(req.entity_id), proposed);
  }

  if (!updateResult.success) {
    return { success: false, error: `Update failed: ${updateResult.error}` };
  }

  // Mark request as approved
  await db
    .from('contact_edit_requests')
    .update({
      status: 'approved',
      reviewed_by: reviewerName,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  revalidatePath('/directory');
  revalidatePath('/system-admin');

  return {
    success: true,
    sheetSynced: updateResult.sheetSynced,
    sheetError: updateResult.sheetError,
  };
}

// ─── 5. Decline Edit Request ────────────────────────────────────────────────
export async function declineContactEditRequest(requestId: number, reason?: string): Promise<{ success: boolean; error?: string }> {
  const adminCtx = await getAdminContext();
  if (!adminCtx) return { success: false, error: 'Unauthorized' };

  const db = getServiceClient();
  const reviewerName = adminCtx.name;

  const { error } = await db
    .from('contact_edit_requests')
    .update({
      status: 'declined',
      admin_notes: reason?.trim() || 'Declined by Administrator',
      reviewed_by: reviewerName,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/directory');
  revalidatePath('/system-admin');

  return { success: true };
}

// ─── 6. User Notifications (for Bell icon) ──────────────────────────────────
export interface UserNotificationItem {
  id: number;
  entity_type: 'cub' | 'family';
  entity_id: string;
  entity_name: string;
  requester_name: string;
  requester_email?: string | null;
  status: 'pending' | 'approved' | 'declined';
  changed_fields: string[];
  current_data?: Record<string, any>;
  proposed_data?: Record<string, any>;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  is_read: boolean;
}

export interface UserNotificationsResponse {
  isAdmin: boolean;
  pending: UserNotificationItem[];
  processed: UserNotificationItem[];
  unreadProcessedCount: number;
  pendingCount: number;
  // Backward compatibility
  notifications: UserNotificationItem[];
  unreadCount: number;
  pendingApprovalCount: number;
}

export async function getUserNotifications(): Promise<UserNotificationsResponse> {
  const adminCtx = await getAdminContext();
  const isAdmin = adminCtx !== null;
  const db = getServiceClient();

  if (isAdmin) {
    // ─── FOR SYSTEM ADMINS ───
    // 1. Pending requests awaiting admin decision
    const { data: pendingRows } = await db
      .from('contact_edit_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(30);

    // 2. Recent decisions made across the organization
    const { data: processedRows } = await db
      .from('contact_edit_requests')
      .select('*')
      .in('status', ['approved', 'declined'])
      .order('reviewed_at', { ascending: false })
      .limit(25);

    const pending: UserNotificationItem[] = (pendingRows || []).map((r: any) => ({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_name: r.entity_name,
      requester_name: r.requester_name,
      requester_email: r.requester_email,
      status: r.status,
      changed_fields: Array.isArray(r.changed_fields) ? r.changed_fields : [],
      current_data: r.current_data,
      proposed_data: r.proposed_data,
      admin_notes: r.admin_notes || `Submitted by ${r.requester_name}`,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
      is_read: false,
    }));

    const processed: UserNotificationItem[] = (processedRows || []).map((r: any) => ({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_name: r.entity_name,
      requester_name: r.requester_name,
      requester_email: r.requester_email,
      status: r.status,
      changed_fields: Array.isArray(r.changed_fields) ? r.changed_fields : [],
      current_data: r.current_data,
      proposed_data: r.proposed_data,
      admin_notes: r.admin_notes,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
      is_read: true,
    }));

    return {
      isAdmin: true,
      pending,
      processed,
      unreadProcessedCount: 0,
      pendingCount: pending.length,
      notifications: pending,
      unreadCount: pending.length,
      pendingApprovalCount: pending.length,
    };
  }

  // ─── FOR RELATIONSHIP REPS ───
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        isAdmin: false,
        pending: [],
        processed: [],
        unreadProcessedCount: 0,
        pendingCount: 0,
        notifications: [],
        unreadCount: 0,
        pendingApprovalCount: 0,
      };
    }

    // Fetch all requests submitted by this rep (both pending and processed)
    let query = db
      .from('contact_edit_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (user.email) {
      query = query.or(`requester_id.eq.${user.id},requester_email.eq.${user.email}`);
    } else {
      query = query.eq('requester_id', user.id);
    }

    const { data: allUserRequests } = await query.limit(50);
    const rows = allUserRequests || [];

    const mapItem = (r: any): UserNotificationItem => ({
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_name: r.entity_name,
      requester_name: r.requester_name,
      requester_email: r.requester_email,
      status: r.status,
      changed_fields: Array.isArray(r.changed_fields) ? r.changed_fields : [],
      current_data: r.current_data,
      proposed_data: r.proposed_data,
      admin_notes: r.admin_notes,
      reviewed_by: r.reviewed_by,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
      is_read: Boolean(r.is_read_by_requester),
    });

    // Partition into Pending Submissions (Tab 1) and Processed Requests (Tab 2)
    const pending = rows.filter((r: any) => r.status === 'pending').map(mapItem);
    const processed = rows.filter((r: any) => r.status === 'approved' || r.status === 'declined').map(mapItem);

    // Unread processed count determines the red alert badge on the bell for reps
    const unreadProcessedCount = processed.filter((r) => !r.is_read).length;

    return {
      isAdmin: false,
      pending,
      processed,
      unreadProcessedCount,
      pendingCount: pending.length,
      notifications: [...pending, ...processed],
      unreadCount: unreadProcessedCount,
      pendingApprovalCount: 0,
    };
  } catch {
    return {
      isAdmin: false,
      pending: [],
      processed: [],
      unreadProcessedCount: 0,
      pendingCount: 0,
      notifications: [],
      unreadCount: 0,
      pendingApprovalCount: 0,
    };
  }
}

// ─── 7. Mark User Notifications as Read ─────────────────────────────────────
export async function markNotificationsAsRead(requestId?: number): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false };

    const db = getServiceClient();
    let query = db
      .from('contact_edit_requests')
      .update({ is_read_by_requester: true, updated_at: new Date().toISOString() });

    if (user.email) {
      query = query.or(`requester_id.eq.${user.id},requester_email.eq.${user.email}`);
    } else {
      query = query.eq('requester_id', user.id);
    }

    if (requestId) {
      query = query.eq('id', requestId);
    } else {
      query = query.eq('is_read_by_requester', false);
    }

    await query;
    revalidatePath('/directory');
    return { success: true };
  } catch {
    return { success: false };
  }
}
