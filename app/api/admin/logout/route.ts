import { NextResponse } from 'next/server';
import { clearAdminSessionCookie, cookieOptions } from '../../../../lib/admin-auth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(cookieOptions(clearAdminSessionCookie()));
  return response;
}
