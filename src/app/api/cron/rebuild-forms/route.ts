import { NextRequest, NextResponse } from 'next/server';
import { executeRebuildForms } from '@/lib/actions/forms';

// GET or POST /api/cron/rebuild-forms
// Can be called daily by Vercel Cron, Google Apps Script, Supabase pg_cron, or any scheduler
// Header: x-webhook-secret: <WEBHOOK_SECRET> or Authorization: Bearer <WEBHOOK_SECRET>
export async function GET(req: NextRequest) {
  return handleRebuild(req);
}

export async function POST(req: NextRequest) {
  return handleRebuild(req);
}

async function handleRebuild(req: NextRequest) {
  const secretHeader = req.headers.get('x-webhook-secret');
  const authHeader = req.headers.get('authorization');
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const provided = secretHeader || bearerSecret;

  const validSecrets = [process.env.WEBHOOK_SECRET, process.env.CRON_SECRET].filter(Boolean);

  if (!provided || !validSecrets.includes(provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await executeRebuildForms();
    if (!res.success) {
      return NextResponse.json({ success: false, error: res.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
