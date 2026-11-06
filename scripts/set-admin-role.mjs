import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const email = String(process.argv[2] ?? '').trim().toLowerCase();
const role = process.argv[3];
if (!email || !['admin', 'super_admin'].includes(role)) throw new Error('Usage: npm run db:admin:role -- <email> <admin|super_admin>');
const connectionString = String(process.env.DATABASE_URL ?? '').trim().replace(/^['"]|['"]$/g, '');
if (!connectionString) throw new Error('DATABASE_URL is required.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const admins = await db.admin.findMany({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (admins.length !== 1) throw new Error('Expected one existing admin for this email. No role was changed.');
  await db.admin.update({ where: { id: admins[0].id }, data: { role } });
  console.log(`Updated ${email} to ${role}. Password unchanged.`);
} finally { await db.$disconnect(); }
