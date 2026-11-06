import { NextResponse } from 'next/server';
import { getAuthenticatedAdmin } from '../../../../lib/admin-auth';

export async function GET(request: Request) {
  try {
    const admin = await getAuthenticatedAdmin(request);
    return NextResponse.json({ authenticated: !!admin }, { status: admin ? 200 : 401 });
  } catch { return NextResponse.json({ authenticated: false }, { status: 401 }); }
}
