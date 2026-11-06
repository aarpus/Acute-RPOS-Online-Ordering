import { getAuthConfig, getSessionCookie, publicUser } from './auth';
import { createPrismaClient } from './prisma';

export async function authenticatedCustomer(request: Request, storeCode: string) {
  const {secret} = getAuthConfig();
  const session = getSessionCookie(request,secret);
  if (!session || session.storeCode !== storeCode) return null;
  const db = createPrismaClient();
  try {
    const user = await db.user.findUnique({where:{id:session.userId},select:{id:true,firstName:true,lastName:true,phoneNumber:true,email:true,storeCode:true}});
    if (!user || user.storeCode !== storeCode || user.email !== session.email) return null;
    return publicUser(user);
  } finally { await db.$disconnect(); }
}
