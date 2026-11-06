import { createPrismaClient } from '../../../../lib/prisma';
import {
  getCustomerAuthConfig,
  jsonWithCookies,
  publicUser,
  sameOrigin,
  serializeSessionCookie,
  verifyPassword,
} from '../../../../lib/auth';

export const runtime = 'nodejs';

function jsonError(message: string, status: number) {
  return jsonWithCookies({ error: message }, status);
}

export async function POST(request: Request) {
  let config: Awaited<ReturnType<typeof getCustomerAuthConfig>>;
  try {
    config = await getCustomerAuthConfig(request);
  } catch {
    return jsonError('Login is temporarily unavailable.', 503);
  }

  if (!sameOrigin(request)) return jsonError('Cross-origin login requests are not allowed.', 403);

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError('Request body must be valid JSON.', 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    return jsonError('Enter your email address and password.', 400);
  }

  const prisma = createPrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { storeCode_email: { storeCode: config.storeCode, email } },
      select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true, passwordHash: true },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return jsonError('That email or password is incorrect.', 401);
    }
    return jsonWithCookies(
      { message: 'Login successful.', user: publicUser(user) },
      200,
      [serializeSessionCookie({ userId: user.id, email: user.email, storeCode: config.storeCode }, config.secret)],
    );
  } catch {
    console.error('Unable to complete login.');
    return jsonError('Unable to sign in right now.', 500);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      console.error('Unable to disconnect Prisma Client after login.');
    }
  }
}
