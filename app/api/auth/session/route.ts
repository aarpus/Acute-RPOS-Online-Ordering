import { createPrismaClient } from '../../../../lib/prisma';
import { getCustomerAuthConfig, getSessionCookie, jsonWithCookies, publicUser, serializeSessionCookie } from '../../../../lib/auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  let config: Awaited<ReturnType<typeof getCustomerAuthConfig>>;
  try {
    config = await getCustomerAuthConfig(request);
  } catch {
    return jsonWithCookies({ user: null, error:'Unable to check your login right now. Please retry.' }, 503);
  }

  const session = getSessionCookie(request, config.secret);
  if (!session || session.storeCode !== config.storeCode) {
    return jsonWithCookies({ user: null }, 200);
  }

  const prisma = createPrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, firstName: true, lastName: true, phoneNumber: true, email: true, storeCode: true },
    });
    if (!user || user.storeCode !== config.storeCode || user.email !== session.email) {
      return jsonWithCookies({ user: null }, 200, [serializeSessionCookie(null)]);
    }
    return jsonWithCookies({ user: publicUser(user) }, 200, [serializeSessionCookie({userId:user.id,email:user.email,storeCode:config.storeCode},config.secret)]);
  } catch {
    console.error('Unable to load the signed-in session.');
    return jsonWithCookies({ user: null, error:'Unable to check your login right now. Please retry.' }, 503);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      console.error('Unable to disconnect Prisma Client after session lookup.');
    }
  }
}
