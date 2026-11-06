import { createHmac, timingSafeEqual } from 'node:crypto';

export const verificationCookieName = 'st_email_verification';

export type VerificationCookie = {
  id: string;
  email: string;
  storeCode: string;
  codeHash: string;
  expiresAt: number;
  sentAt: number;
  attempts: number;
  verified: boolean;
};

function cookieSecurity() {
  return process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

function signPayload(payload: VerificationCookie, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(`cookie\0${encodedPayload}`).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function getVerificationCookie(request: Request, secret: string): VerificationCookie | null {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  const entry = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${verificationCookieName}=`));
  if (!entry) return null;

  const token = entry.slice(verificationCookieName.length + 1);
  const separator = token.lastIndexOf('.');
  if (separator < 1) return null;

  const encodedPayload = token.slice(0, separator);
  const providedSignature = Buffer.from(token.slice(separator + 1), 'base64url');
  const expectedSignature = createHmac('sha256', secret).update(`cookie\0${encodedPayload}`).digest();
  if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()) as Partial<VerificationCookie>;
    if (typeof payload.id !== 'string' || typeof payload.email !== 'string' || typeof payload.storeCode !== 'string'
      || typeof payload.codeHash !== 'string' || typeof payload.expiresAt !== 'number' || typeof payload.sentAt !== 'number'
      || typeof payload.attempts !== 'number' || typeof payload.verified !== 'boolean') return null;
    return payload as VerificationCookie;
  } catch {
    return null;
  }
}

export function serializeVerificationCookie(payload: VerificationCookie | null, secret?: string) {
  if (!payload) return `${verificationCookieName}=; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=0${cookieSecurity()}`;
  if (!secret) throw new Error('Email verification signing secret is unavailable.');
  const token = signPayload(payload, secret);
  return `${verificationCookieName}=${token}; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=${Math.max(0, Math.floor((payload.expiresAt - Date.now()) / 1000))}${cookieSecurity()}`;
}
