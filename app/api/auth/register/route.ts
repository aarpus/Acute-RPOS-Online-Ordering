import { Prisma } from '@prisma/client';
import { createPrismaClient } from '../../../../lib/prisma';
import {
  getCustomerAuthConfig,
  hashPassword,
  jsonWithCookies,
  publicUser,
  sameOrigin,
  serializeSessionCookie,
} from '../../../../lib/auth';
import { getVerificationCookie, serializeVerificationCookie } from '../../../../lib/verification-cookie';

export const runtime = 'nodejs';

function jsonError(message: string, status: number, cookies: string[] = []) {
  return jsonWithCookies({ error: message }, status, cookies);
}

export async function POST(request: Request) {
  let config: Awaited<ReturnType<typeof getCustomerAuthConfig>>;
  try {
    config = await getCustomerAuthConfig(request);
  } catch {
    return jsonError('Account creation is temporarily unavailable.', 503);
  }

  if (!sameOrigin(request)) return jsonError('Cross-origin registration requests are not allowed.', 403);

  let body: {
    firstName?: unknown;
    lastName?: unknown;
    phoneNumber?: unknown;
    email?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON.', 400);
  }

  const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
  const phoneNumber = typeof body.phoneNumber === 'string' ? body.phoneNumber.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!firstName || firstName.length > 100) return jsonError('Enter a valid first name.', 400);
  if (!lastName || lastName.length > 100) return jsonError('Enter a valid last name.', 400);
  if (!phoneNumber || phoneNumber.length > 20 || !/^[+0-9 ()-]{7,20}$/.test(phoneNumber)) {
    return jsonError('Enter a valid phone number.', 400);
  }
  if (!email || email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Enter a valid email address.', 400);
  }
  if (password.length < 8 || password.length > 200) return jsonError('Password must be at least 8 characters.', 400);
  if (password !== confirmPassword) return jsonError('Passwords do not match. Please check both password fields.', 400);

  const verification = getVerificationCookie(request, config.secret);
  if (!verification || verification.email !== email || verification.storeCode !== config.storeCode) {
    return jsonError('Verify your email address before creating an account.', 400);
  }
  if (verification.expiresAt <= Date.now()) {
    return jsonError('This verification has expired. Request a new code.', 400, [serializeVerificationCookie(null)]);
  }
  if (!verification.verified) return jsonError('Verify your email address before creating an account.', 400);

  const prisma = createPrismaClient();
  try {
    const user = await prisma.user.create({
      data: {
        storeCode: config.storeCode,
        firstName,
        lastName,
        phoneNumber,
        email,
        passwordHash: await hashPassword(password),
      },
      select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true },
    });
    return jsonWithCookies(
      { message: 'Account created. You are now signed in.', user: publicUser(user) },
      201,
      [
        serializeVerificationCookie(null),
        serializeSessionCookie({ userId: user.id, email: user.email, storeCode: config.storeCode }, config.secret),
      ],
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return jsonError('An account already exists for this email.', 409);
    }
    console.error('Unable to create account.');
    return jsonError('Unable to create the account right now.', 500);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      console.error('Unable to disconnect Prisma Client after registration.');
    }
  }
}
