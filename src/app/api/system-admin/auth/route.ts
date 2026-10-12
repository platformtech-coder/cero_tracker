import { NextRequest, NextResponse } from 'next/server';
import {
  getSystemAdminSession,
  createSystemAdminSession,
  clearSystemAdminSession,
  verifySystemAdminCredentials
} from '@/lib/systemAdminAuth';

export async function GET() {
  const session = await getSystemAdminSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, session });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const { valid, name } = await verifySystemAdminCredentials(email, password);
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid System Admin credentials' },
        { status: 401 }
      );
    }

    await createSystemAdminSession(email, name);
    return NextResponse.json({ success: true, message: 'System Admin authenticated' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  await clearSystemAdminSession();
  return NextResponse.json({ success: true, message: 'Logged out' });
}
