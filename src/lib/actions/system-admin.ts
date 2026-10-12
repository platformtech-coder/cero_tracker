'use server';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { getSystemAdminSession } from '@/lib/systemAdminAuth';

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireSuperAdmin() {
  const session = await getSystemAdminSession();
  if (!session) throw new Error('Unauthorized - Super Admin Only');
  return session;
}



export async function getSystemOverview() {
  await requireSuperAdmin();
  const supabase = getServiceClient();

  const tables = [
    'cubs', 'master_cubs', 'interactions', 'actions', 'orientation',
    'reading_circle', 'pending_signups', 'profiles', 'config_dropdowns',
    'audit_log', 'sync_state', 'families', 'rc_attendance',
  ];

  const startMs = Date.now();
  const countPromises = tables.map(t =>
    supabase.from(t as any).select('*', { count: 'exact', head: true })
      .then(r => ({ table: t, count: r.count ?? 0 }))
  );
  const tableCounts = await Promise.all(countPromises);
  const latencyMs = Date.now() - startMs;

  const { data: syncState } = await supabase
    .from('sync_state')
    .select('id, sync_type, status, last_run_at, error_message, updated_at, last_processed_row, processed_count')
    .order('updated_at', { ascending: false })
    .limit(50);

  const { data: auditLog } = await supabase
    .from('audit_log')
    .select('id, timestamp, action, details, status, user_id, duration_ms')
    .order('timestamp', { ascending: false })
    .limit(50);

  const { count: pendingSignups } = await supabase
    .from('pending_signups')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'Pending');

  // Read sheet/form config from app_config table (may not exist yet)
  let cfg: Record<string, string> = {};
  try {
    const { data: appConfigRows, error: appConfigError } = await supabase
      .from('app_config')
      .select('key, value');
    if (!appConfigError && appConfigRows) {
      (appConfigRows ?? []).forEach(r => { cfg[r.key] = r.value; });
    }
  } catch {
    // app_config table doesn't exist, use empty config
    cfg = {};
  }

  const totalRows = tableCounts.reduce((sum, t) => sum + t.count, 0);

  return {
    tableCounts: tableCounts.reduce((acc, t) => ({ ...acc, [t.table]: t.count }), {} as Record<string, number>),
    totalRows,
    latencyMs,
    syncState: (syncState ?? []).map(s => ({
      key: s.sync_type ?? String(s.id),
      label: s.sync_type ?? 'Unknown',
      status: s.status ?? '—',
      lastRunAt: s.last_run_at ?? null,
      error: s.error_message ?? null,
      processedCount: s.processed_count ?? 0,
      lastProcessedRow: s.last_processed_row ?? 0,
      updatedAt: s.updated_at,
    })),
    // Named sheet/form configs (for the Pipeline tab) — from app_config
    sheetConfig: {
      directory:     { id: cfg['sheet_directory_id'] ?? '', tab: cfg['sheet_directory_tab'] ?? '' },
      readingData:   { id: cfg['sheet_reading_data_id'] ?? '', tab: cfg['sheet_reading_data_tab'] ?? '' },
      scoreCalendar: { id: cfg['sheet_score_calendar_id'] ?? '', tab: cfg['sheet_score_calendar_tab'] ?? '' },
      emailHistory:  { id: cfg['sheet_email_history_id'] ?? '', tab: cfg['sheet_email_history_tab'] ?? '' },
    },
    formConfig: {
      orientation:   cfg['form_orientation_url'] ?? '',
      readingCircle: cfg['form_reading_circle_url'] ?? '',
    },
    auditLog: (auditLog ?? []).map(a => ({
      id: a.id,
      action: a.action ?? '—',
      details: typeof a.details === 'object' && a.details !== null ? JSON.stringify(a.details) : (a.details ?? '—'),
      status: a.status ?? '—',
      userId: a.user_id ?? null,
      durationMs: a.duration_ms ?? null,
      timestamp: a.timestamp,
    })),
    pendingSignups: pendingSignups ?? 0,
  };
}

// ─── Sync Logs ────────────────────────────────────────────────
export async function getSyncLogs(limit = 100) {
  await requireSuperAdmin();
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('audit_log')
    .select('id, timestamp, action, details, status, user_id, duration_ms')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []).map(a => ({
    id: a.id,
    action: a.action ?? '—',
    details: typeof a.details === 'object' && a.details !== null ? JSON.stringify(a.details) : (a.details ?? '—'),
    status: a.status ?? '—',
    userId: a.user_id ?? null,
    durationMs: a.duration_ms ?? null,
    timestamp: a.timestamp,
  }));
}

// ─── Upsert a single app_config key ──────────────────────────
export async function upsertSyncSetting(key: string, value: string) {
  const session = await requireSuperAdmin();
  const supabase = getServiceClient();

  const { error } = await supabase.from('app_config').upsert({
    key,
    value: value ?? '',
    updated_at: new Date().toISOString(),
    updated_by: session.email,
  }, { onConflict: 'key' });

  if (error) return { success: false, error: error.message };

  try {
    await supabase.from('audit_log').insert({
      action: 'SETTINGS_UPDATE',
      details: `Config updated: ${key} = ${value.substring(0, 80)}`,
      status: 'SUCCESS',
      user_id: session.email,
      timestamp: new Date().toISOString(),
    });
  } catch { /* ignore */ }

  revalidatePath('/system-admin');
  return { success: true };
}

// ─── Save multiple app_config settings at once ───────────────
export async function saveSheetConfig(configs: Record<string, string>) {
  const session = await requireSuperAdmin();
  const supabase = getServiceClient();

  const rows = Object.entries(configs).map(([key, value]) => ({
    key,
    value: value ?? '',
    updated_at: new Date().toISOString(),
    updated_by: session.email,
  }));

  const { error } = await supabase.from('app_config').upsert(rows, { onConflict: 'key' });
  if (error) return { success: false, error: error.message };

  try {
    await supabase.from('audit_log').insert({
      action: 'SETTINGS_UPDATE',
      details: `Sheet/form config updated (${rows.length} keys)`,
      status: 'SUCCESS',
      user_id: session.email,
      timestamp: new Date().toISOString(),
    });
  } catch { /* ignore */ }

  revalidatePath('/system-admin');
  return { success: true };
}

// ─── Trigger External Sync ────────────────────────────────────
export async function triggerExternalSync(sheetKey: string, _sheetId: string, _tabName: string) {
  const session = await requireSuperAdmin();
  const supabase = getServiceClient();

  // Map UI sheet keys → edge function sheet identifiers
  const SHEET_KEY_MAP: Record<string, string> = {
    directory:     'directory',
    readingData:   'reading_data',
    scoreCalendar: 'score_calendar',
    emailHistory:  'email_history',
    all:           'all',
  };
  const edgeKey = SHEET_KEY_MAP[sheetKey] ?? sheetKey;

  // Mark as triggered immediately
  await supabase.from('sync_state').upsert({
    sync_type: edgeKey, status: 'triggered',
    last_run_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'sync_type' });

  const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-master-cubs`;

  try {
    const res = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ sheet: edgeKey }),
    });
    const result = await res.json();

    await supabase.from('audit_log').insert({
      action: 'SYNC_TRIGGER',
      details: `Manual sync: ${sheetKey} → result: ${JSON.stringify(result)}`,
      status: res.ok ? 'SUCCESS' : 'ERROR',
      user_id: session.email,
      timestamp: new Date().toISOString(),
    });

    // Invalidate all pages that display data sourced from synced sheets
    revalidatePath('/system-admin');
    revalidatePath('/dashboard');
    revalidatePath('/', 'layout');
    revalidatePath('/directory');
    revalidatePath('/engagements');
    revalidatePath('/reading-circle');
    revalidatePath('/orientation');
    if (res.ok) return { success: true, message: `Sync completed for ${sheetKey}`, result };
    return { success: false, error: result?.error ?? 'Edge function returned an error' };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    await supabase.from('sync_state').upsert({
      sync_type: edgeKey, status: 'failed', error_message: `Trigger failed: ${msg}`,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'sync_type' });
    revalidatePath('/system-admin');
    return { success: false, error: msg };
  }
}




// ─── Data Cleanup ─────────────────────────────────────────────
export async function clearTable(tableName: string, confirm: string) {
  if (confirm !== 'DELETE') return { success: false, error: 'Confirmation text does not match' };
  await requireSuperAdmin();

  const ALLOWED_TABLES = [
    'interactions', 'actions', 'audit_log', 'pending_signups',
    'orientation', 'reading_circle', 'rc_attendance',
  ];

  if (!ALLOWED_TABLES.includes(tableName)) {
    return { success: false, error: `Table "${tableName}" cannot be cleared from this panel` };
  }

  const supabase = getServiceClient();
  const { count: before } = await supabase.from(tableName as any).select('*', { count: 'exact', head: true });

  const { error } = await supabase.from(tableName as any).delete().gte('id', 0);
  if (error) return { success: false, error: error.message };

  revalidatePath('/system-admin');
  return { success: true, rowsCleared: before ?? 0 };
}

export async function clearAllTables(confirm: string) {
  if (confirm !== 'PURGE_ALL') return { success: false, error: 'Confirmation text does not match' };
  const session = await requireSuperAdmin();

  const supabase = getServiceClient();
  
  // Call the new RPC function to purge all relevant data tables
  const { error } = await supabase.rpc('purge_database');
  
  if (error) {
    return { success: false, error: error.message };
  }

  await supabase.from('audit_log').insert({
    action: 'DATA_PURGE',
    details: 'Triggered full database purge',
    status: 'SUCCESS',
    user_id: session.email,
    timestamp: new Date().toISOString(),
  });

  revalidatePath('/system-admin');
  return { success: true };
}
