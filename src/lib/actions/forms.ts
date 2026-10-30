'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { createClient as createSupabaseClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/supabase/getProfile';
import { google } from 'googleapis';
import { getSystemAdminSession } from '@/lib/systemAdminAuth';
import { requireAdminOrSuperAdmin as _requireAdminOrSuperAdmin, getServiceClient } from '@/lib/auth/getAdminSession';
import type { SessionConfig, FormsConfig } from '@/lib/constants/forms';
import {
  KNOWN_ORI_SESSION_ITEM_ID,
  KNOWN_RC_LOWER_ITEM_IDS,
  KNOWN_RC_UPPER_ITEM_IDS,
  DEFAULT_ORI_SESSIONS,
  DEFAULT_RC_SESSIONS_LOWER,
  DEFAULT_RC_SESSIONS_UPPER,
} from '@/lib/constants/forms';

// ─── Helpers ──────────────────────────────────────────────────

async function requireSuperAdmin() {
  const session = await getSystemAdminSession();
  if (!session) throw new Error('Unauthorized - Super Admin Only');
  return session;
}

/**
 * Accepts either a system-admin JWT session OR a logged-in dashboard admin.
 * Returns a display email/identifier for audit purposes.
 * Delegates to the canonical shared helper in src/lib/auth/getAdminSession.ts.
 */
const requireAdminOrSuperAdmin = _requireAdminOrSuperAdmin;

function getGoogleAuth() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    throw new Error('Google service account credentials missing in environment variables.');
  }
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/forms.body'],
  });
}

/**
 * Generate the next upcoming date for each session day (1 date per session).
 * e.g. { day: "Tuesday", startTime: "7:00 pm", endTime: "8:00 pm" }
 * → "Tuesday (13-Oct) 7:00 pm – 8:00 pm"
 */
function generateRollingDates(sessions: SessionConfig[], count = 1): string[] {
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const options: string[] = [];
  const today = new Date();

  for (const s of sessions) {
    const targetIdx = DAYS.indexOf(s.day);
    if (targetIdx === -1) {
      options.push(`${s.day} ${s.startTime} – ${s.endTime}`);
      continue;
    }
    for (let i = 1; i <= count; i++) {
      const d = new Date(today);
      const daysUntil = ((targetIdx + 7 - today.getDay()) % 7) || 7;
      d.setDate(today.getDate() + daysUntil + (i - 1) * 7);
      const dayNum = d.getDate().toString().padStart(2, '0');
      const month = d.toLocaleString('en-US', { month: 'short' });
      options.push(`${s.day} (${dayNum}-${month}) ${s.startTime} – ${s.endTime}`);
    }
  }
  return options;
}

/**
 * Format RC sessions — no dates, just recurring day + time.
 * e.g. { day: "Saturday", startTime: "9:00 am", endTime: "9:45 am" }
 * → "Saturdays 9:00 am – 9:45 am"
 */
function formatRCSessions(sessions: SessionConfig[]): string[] {
  return sessions.map(s => `${s.day} ${s.startTime} – ${s.endTime}`.trim());
}

/** Build a Forms API batchUpdate request object for a choice question item. */
function buildUpdateRequest(itemId: string, options: string[], index: number) {
  return {
    updateItem: {
      item: {
        itemId,
        questionItem: {
          question: {
            choiceQuestion: {
              type: 'RADIO',
              options: options.map(val => ({ value: val })),
            },
          },
        },
      },
      updateMask: 'questionItem.question.choiceQuestion.options',
      location: { index },
    },
  };
}

// ─── Server Actions ───────────────────────────────────────────

export async function saveFormsConfig(config: FormsConfig) {
  const callerEmail = await requireAdminOrSuperAdmin();
  const supabase = getServiceClient();

  const rows = [
    { key: 'forms_orientation_form_id',         value: config.oriFormId },
    { key: 'forms_orientation_session_item_id', value: config.oriSessionItemId },
    { key: 'forms_orientation_sessions',        value: JSON.stringify(config.oriSessions) },
    { key: 'forms_rc_form_id',                  value: config.rcFormId },
    { key: 'forms_rc_sessions_lower',           value: JSON.stringify(config.rcSessionsLower) },
    { key: 'forms_rc_sessions_upper',           value: JSON.stringify(config.rcSessionsUpper) },
    { key: 'forms_rc_category_lower',           value: config.rcCategoryLower },
    { key: 'forms_rc_category_upper',           value: config.rcCategoryUpper },
    { key: 'forms_rc_grade_mapping',            value: JSON.stringify(config.rcGradeMapping) },
    { key: 'forms_rc_lower_item_ids',           value: JSON.stringify(config.rcLowerItemIds) },
    { key: 'forms_rc_upper_item_ids',           value: JSON.stringify(config.rcUpperItemIds) },
  ].map(r => ({ ...r, updated_at: new Date().toISOString(), updated_by: callerEmail }));

  const { error } = await supabase.from('app_config').upsert(rows, { onConflict: 'key' });
  if (error) return { success: false, error: error.message };

  revalidatePath('/system-admin');
  revalidatePath('/settings');
  updateTag('rc-sessions');
  return { success: true };
}

export type FormRebuildTarget = 'all' | 'orientation' | 'reading-circle';

export async function saveFormsPartialConfig(partial: Partial<FormsConfig>) {
  const callerEmail = await requireAdminOrSuperAdmin();
  const supabase = getServiceClient();

  const rows: { key: string; value: string; updated_at: string; updated_by: string }[] = [];
  const now = new Date().toISOString();

  if (partial.oriFormId !== undefined) {
    rows.push({ key: 'forms_orientation_form_id', value: partial.oriFormId, updated_at: now, updated_by: callerEmail });
  }
  if (partial.oriSessionItemId !== undefined) {
    rows.push({ key: 'forms_orientation_session_item_id', value: partial.oriSessionItemId, updated_at: now, updated_by: callerEmail });
  }
  if (partial.oriSessions !== undefined) {
    rows.push({ key: 'forms_orientation_sessions', value: JSON.stringify(partial.oriSessions), updated_at: now, updated_by: callerEmail });
  }
  if (partial.rcFormId !== undefined) {
    rows.push({ key: 'forms_rc_form_id', value: partial.rcFormId, updated_at: now, updated_by: callerEmail });
  }
  if (partial.rcSessionsLower !== undefined) {
    rows.push({ key: 'forms_rc_sessions_lower', value: JSON.stringify(partial.rcSessionsLower), updated_at: now, updated_by: callerEmail });
  }
  if (partial.rcSessionsUpper !== undefined) {
    rows.push({ key: 'forms_rc_sessions_upper', value: JSON.stringify(partial.rcSessionsUpper), updated_at: now, updated_by: callerEmail });
  }
  if (partial.rcCategoryLower !== undefined) {
    rows.push({ key: 'forms_rc_category_lower', value: partial.rcCategoryLower, updated_at: now, updated_by: callerEmail });
  }
  if (partial.rcCategoryUpper !== undefined) {
    rows.push({ key: 'forms_rc_category_upper', value: partial.rcCategoryUpper, updated_at: now, updated_by: callerEmail });
  }
  if (partial.rcGradeMapping !== undefined) {
    rows.push({ key: 'forms_rc_grade_mapping', value: JSON.stringify(partial.rcGradeMapping), updated_at: now, updated_by: callerEmail });
  }
  if (partial.rcLowerItemIds !== undefined) {
    rows.push({ key: 'forms_rc_lower_item_ids', value: JSON.stringify(partial.rcLowerItemIds), updated_at: now, updated_by: callerEmail });
  }
  if (partial.rcUpperItemIds !== undefined) {
    rows.push({ key: 'forms_rc_upper_item_ids', value: JSON.stringify(partial.rcUpperItemIds), updated_at: now, updated_by: callerEmail });
  }

  if (rows.length === 0) return { success: true };

  const { error } = await supabase.from('app_config').upsert(rows, { onConflict: 'key' });
  if (error) return { success: false, error: error.message };

  revalidatePath('/system-admin');
  revalidatePath('/settings');
  updateTag('rc-sessions');
  return { success: true };
}


async function getFormsConfigInternal(): Promise<FormsConfig> {
  const supabase = getServiceClient();
  const { data: rows } = await supabase.from('app_config').select('key, value');
  const cfg: Record<string, string> = {};
  (rows ?? []).forEach((r: any) => { cfg[r.key] = r.value; });

  function parseJSON<T>(key: string, fallback: T): T {
    try { return JSON.parse(cfg[key] || ''); } catch { return fallback; }
  }

  return {
    oriFormId:        cfg['forms_orientation_form_id'] ?? '1euyObOz6KNG3QgzdUG5otCxjfgV-0fZ9iCo3GFKKSXU',
    oriSessionItemId: cfg['forms_orientation_session_item_id'] ?? KNOWN_ORI_SESSION_ITEM_ID,
    oriSessions:      parseJSON('forms_orientation_sessions', DEFAULT_ORI_SESSIONS),
    rcFormId:         cfg['forms_rc_form_id'] ?? '1NQPCb59uhpmo72BMxb9EHbxpAXqlmLlstyICTa8DJls',
    rcSessionsLower:  parseJSON('forms_rc_sessions_lower', DEFAULT_RC_SESSIONS_LOWER),
    rcSessionsUpper:  parseJSON('forms_rc_sessions_upper', DEFAULT_RC_SESSIONS_UPPER),
    rcCategoryLower:  cfg['forms_rc_category_lower'] ?? 'Word Astronauts',
    rcCategoryUpper:  cfg['forms_rc_category_upper'] ?? 'Word Miners',
    rcGradeMapping:   parseJSON('forms_rc_grade_mapping', []),
    rcLowerItemIds:   parseJSON('forms_rc_lower_item_ids', KNOWN_RC_LOWER_ITEM_IDS),
    rcUpperItemIds:   parseJSON('forms_rc_upper_item_ids', KNOWN_RC_UPPER_ITEM_IDS),
  };
}

export async function loadFormsConfig(): Promise<FormsConfig> {
  await requireAdminOrSuperAdmin();
  return getFormsConfigInternal();
}

/** Alias for use in server components — requires dashboard admin OR super-admin. */
export async function getFormsConfigForAdmin(): Promise<FormsConfig> {
  await requireAdminOrSuperAdmin();
  return getFormsConfigInternal();
}


export async function executeRebuildForms(target: FormRebuildTarget = 'all'): Promise<{ success: boolean; error?: string }> {
  const config = await getFormsConfigInternal();
  const auth = getGoogleAuth();
  const forms = google.forms({ version: 'v1', auth });
  const errors: string[] = [];

  // Helper to safely update questions by dynamically looking up their current form index
  async function updateFormQuestions(formId: string, itemsToUpdate: { itemId: string; options: string[] }[]) {
    const form = await forms.forms.get({ formId });
    const indexMap = new Map<string, number>();
    (form.data.items || []).forEach((it, idx) => {
      if (it.itemId) indexMap.set(it.itemId, idx);
    });

    const requests = itemsToUpdate
      .filter(({ itemId }) => indexMap.has(itemId))
      .map(({ itemId, options }) => buildUpdateRequest(itemId, options, indexMap.get(itemId)!));

    if (requests.length > 0) {
      await forms.forms.batchUpdate({
        formId,
        requestBody: { requests },
      });
    }
  }

  const shouldRebuildOri = target === 'all' || target === 'orientation';
  const shouldRebuildRC = target === 'all' || target === 'reading-circle';

  // ── Orientation ──────────────────────────────────────────────
  if (shouldRebuildOri) {
    if (!config.oriFormId) {
      errors.push('Orientation form ID is not configured.');
    } else if (config.oriSessions.length === 0) {
      errors.push('No orientation sessions configured to rebuild.');
    } else {
      try {
        const oriOptions = generateRollingDates(config.oriSessions);
        await updateFormQuestions(config.oriFormId, [
          { itemId: config.oriSessionItemId, options: oriOptions },
        ]);
      } catch (e: any) {
        errors.push(`Orientation form: ${e.message}`);
      }
    }
  }

  // ── Reading Circle ────────────────────────────────────────────
  if (shouldRebuildRC) {
    if (!config.rcFormId) {
      errors.push('Reading Circle form ID is not configured.');
    } else {
      try {
        const lowerOptions = formatRCSessions(config.rcSessionsLower);
        const upperOptions = formatRCSessions(config.rcSessionsUpper);
        const items: { itemId: string; options: string[] }[] = [];

        if (lowerOptions.length > 0) {
          config.rcLowerItemIds.forEach(id => items.push({ itemId: id, options: lowerOptions }));
        }
        if (upperOptions.length > 0) {
          config.rcUpperItemIds.forEach(id => items.push({ itemId: id, options: upperOptions }));
        }

        if (items.length > 0) {
          await updateFormQuestions(config.rcFormId, items);
        }
      } catch (e: any) {
        errors.push(`Reading Circle form: ${e.message}`);
      }
    }
  }

  if (errors.length > 0) return { success: false, error: errors.join(' | ') };
  return { success: true };
}

export async function rebuildForms(target: FormRebuildTarget = 'all') {
  await requireAdminOrSuperAdmin();
  return executeRebuildForms(target);
}
