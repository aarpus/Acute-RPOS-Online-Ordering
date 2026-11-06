import { createHmac, timingSafeEqual } from 'node:crypto';
import { createPrismaClient } from './prisma';
import { getAuthConfig } from './auth';

const cookieName = 'st_admin_session';
const lifetimeMs = 8 * 60 * 60 * 1000;
type AdminSession = { adminId: string; email: string; storeCode: string; expiresAt: number };

export function normalizeAdminEmail(value: unknown) { return String(value ?? '').trim().toLowerCase(); }

function sign(payload: AdminSession, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`admin-session\0${encoded}`).digest('base64url');
  return `${encoded}.${signature}`;
}

export function createAdminSessionCookie(admin: { id: string; email: string; storeCode: string }, secret: string) {
  return { name: cookieName, value: sign({ adminId: admin.id, email: admin.email, storeCode: admin.storeCode, expiresAt: Date.now() + lifetimeMs }, secret), maxAge: Math.floor(lifetimeMs / 1000) };
}

export function clearAdminSessionCookie() { return { name: cookieName, value: '', maxAge: 0 }; }

export function readAdminSession(request: Request, secret: string): AdminSession | null {
  const entry = request.headers.get('cookie')?.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${cookieName}=`));
  const token = entry?.slice(cookieName.length + 1);
  if (!token) return null;
  const separator = token.lastIndexOf('.');
  if (separator < 1) return null;
  const encoded = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1), 'base64url');
  const expected = createHmac('sha256', secret).update(`admin-session\0${encoded}`).digest();
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as Partial<AdminSession>;
    if (typeof payload.adminId !== 'string' || typeof payload.email !== 'string' || typeof payload.storeCode !== 'string' || typeof payload.expiresAt !== 'number' || payload.expiresAt <= Date.now()) return null;
    return payload as AdminSession;
  } catch { return null; }
}

export async function getAuthenticatedAdmin(request: Request) {
  const { secret } = getAuthConfig();
  const session = readAdminSession(request, secret);
  if (!session) return null;
  const prisma = createPrismaClient();
  try { return await prisma.admin.findFirst({ where: { id: session.adminId, storeCode: session.storeCode, email: session.email } }); }
  finally { await prisma.$disconnect(); }
}

export function cookieOptions(cookie: { name: string; value: string; maxAge: number }) {
  return { ...cookie, httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: cookie.maxAge };
}
