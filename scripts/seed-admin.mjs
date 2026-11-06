import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/password.ts';

const envText = (value) => String(value ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
const storeCode = envText(process.argv[2]);
const connectionString = envText(process.env.DATABASE_URL);
if (!connectionString) throw new Error('DATABASE_URL is required.');
if (!storeCode || storeCode.length > 50) throw new Error('Pass the initial admin store/company code: npm run db:seed:admin -- <code>');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const email = 'admin123@gmail.com';
  const existing = await prisma.admin.findFirst({ where: { email } });
  if (existing && existing.storeCode !== storeCode) throw new Error('This admin email already belongs to another store/company code.');
  const role = process.argv.includes('--super-admin') ? 'super_admin' : 'admin';
  if (existing) {
    if (role === 'super_admin') await prisma.admin.update({ where: { id: existing.id }, data: { role } });
    console.log(`Admin already exists for ${storeCode}; password unchanged.${role === 'super_admin' ? ' Super Admin role enabled.' : ''}`);
  }
  else { await prisma.admin.create({ data: { storeCode, email, role, passwordHash: await hashPassword('123123') } }); console.log(`Created ${email} for ${storeCode} with role ${role}.`); }
} finally { await prisma.$disconnect(); }
