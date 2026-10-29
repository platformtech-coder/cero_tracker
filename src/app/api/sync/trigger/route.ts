import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── Manual Sync Trigger (Admin only) ─────────────────────────
// POST /api/sync/trigger
// Fires the Supabase Edge Function asynchronously and returns 202 immediately.
// Clients should poll GET /api/sync/trigger to track progress via sync_state.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only admins can trigger sync
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-master-cubs`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!functionUrl || !serviceKey) {
    return NextResponse.json({ error: 'Sync not configured (missing env vars)' }, { status: 500 });
  }

  // Fire-and-forget: start the Edge Function call but do NOT await it.
  // This prevents Vercel 504 Gateway Timeouts on large sync operations.
  // The Edge Function writes its own progress into the `sync_state` table,
  // which clients can poll via GET /api/sync/trigger.
  fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: '{}',
  }).catch(() => {
    // Intentional no-op: network errors from the async call are non-fatal.
    // The sync_state table will reflect the outcome when the function completes.
  });

  return NextResponse.json(
    { message: 'Sync triggered. Poll GET /api/sync/trigger for status.' },
    { status: 202 }
  );
}

// ─── Get Sync Status (Admin only) ─────────────────────────────
// GET /api/sync/trigger
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('sync_state')
    .select('sync_type, last_synced_at, status, row_count, error_message')
    .order('sync_type');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ syncState: data });
}
