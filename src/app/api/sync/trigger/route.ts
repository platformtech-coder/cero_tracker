import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── Manual Sync Trigger (Admin only) ─────────────────────────
// POST /api/sync/trigger
// Calls the Supabase Edge Function to run the sync immediately.
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

  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: '{}',
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data.error ?? 'Sync failed' }, { status: 502 });
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Network error calling sync function' }, { status: 500 });
  }
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
    .select('*')
    .order('sync_type');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ syncState: data });
}
