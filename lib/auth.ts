import { createHmac, timingSafeEqual } from 'node:crypto';
import { env as workerEnv } from 'cloudflare:workers';
import { getStorefront } from './storefront';
export { hashPassword, verifyPassword } from './password';

const sessionCookieName = 'st_session';
const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
};

type SessionCookie = {
  userId: string;
  email: string;
  storeCode: string;
  expiresAt: number;
};

export function envText(value: unknown) {
  return String(value ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
}

export function getAuthConfig() {
  const secret = envText(workerEnv.EMAIL_VERIFICATION_SECRET) || envText(process.env.EMAIL_VERIFICATION_SECRET);
  if (!secret || secret.length < 32) throw new Error('EMAIL_VERIFICATION_SECRET');
  return { secret };
}

export async function getCustomerAuthConfig(request: Request) {
  const config = getAuthConfig();
  const { store } = await getStorefront(request);
  return { ...config, storeCode: store.code, storeName: store.name };
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || new URL(request.url).origin === origin;
}

function cookieSecurity() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

function signSession(payload: SessionCookie, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`session\0${encodedPayload}`).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function getSessionCookie(request: Request, secret: string): SessionCookie | null {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  const entry = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${sessionCookieName}=`));
  if (!entry) return null;

  const token = entry.slice(sessionCookieName.length + 1);
  const separator = token.lastIndexOf('.');
  if (separator < 1) return null;

  const encodedPayload = token.slice(0, separator);
  const providedSignature = Buffer.from(token.slice(separator + 1), 'base64url');
  const expectedSignature = createHmac('sha256', secret).update(`session\0${encodedPayload}`).digest();
  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as Partial<SessionCookie>;
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string' || typeof payload.storeCode !== 'string' || typeof payload.expiresAt !== 'number') {
      return null;
    }
    if (payload.expiresAt <= Date.now()) return null;
    return payload as SessionCookie;
  } catch {
    return null;
  }
}

export function serializeSessionCookie(payload: { userId: string; email: string; storeCode: string } | null, secret?: string) {
  if (!payload) return `${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity()}`;
  if (!secret) throw new Error('Session signing secret is unavailable.');
  const session: SessionCookie = {
    ...payload,
    expiresAt: Date.now() + sessionLifetimeMs,
  };
  const token = signSession(session, secret);
  return `${sessionCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${cookieSecurity()}`;
}

export function jsonWithCookies(body: unknown, status: number, cookies: string[] = []) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control':'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  // Expire the former auth-only cookie when issuing, renewing or clearing the
  // root-scoped session used by both authentication and checkout API routes.
  if (cookies.some(cookie=>cookie.startsWith(`${sessionCookieName}=`))) headers.append('Set-Cookie',`${sessionCookieName}=; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=0${cookieSecurity()}`);
  return new Response(JSON.stringify(body), { status, headers });
}

export function publicUser(user: SessionUser) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumber: user.phoneNumber,
    email: user.email,
  };
}
