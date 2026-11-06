import { NextResponse } from 'next/server';
import { createPrismaClient } from '../../../../lib/prisma';
import { getAuthConfig, verifyPassword } from '../../../../lib/auth';
import { cookieOptions, createAdminSessionCookie, normalizeAdminEmail } from '../../../../lib/admin-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown; password?: unknown };
    const email = normalizeAdminEmail(body.email);
    const password = String(body.password ?? '');
    const { secret } = getAuthConfig();
    const prisma = createPrismaClient();
    let admin;
    try {
      const admins = await prisma.admin.findMany({ where: { email }, take: 2 });
      admin = admins.length === 1 ? admins[0] : null;
    } finally {
      await prisma.$disconnect();
    }
    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      return NextResponse.json({ error: 'Invalid admin credentials.' }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(cookieOptions(createAdminSessionCookie(admin, secret)));
    return response;
  } catch (error) {
    console.error('Admin login failed:', error);
    const detail = error instanceof Error ? error.message : 'Unknown server error.';
    return NextResponse.json({ error: process.env.NODE_ENV === 'production' ? 'Unable to sign in.' : `Unable to sign in: ${detail}` }, { status: 500 });
  }
}
