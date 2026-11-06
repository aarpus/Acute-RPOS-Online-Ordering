import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is missing.');
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await client.connect();
  const result = await client.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('menu_categories', 'tbl_pos_sync_log') ORDER BY table_name, ordinal_position");
  console.log(JSON.stringify(result.rows, null, 2));
  await prisma.menuCategory.findFirst();
  console.log('Prisma MenuCategory read passed.');
  await prisma.posSyncLog.findFirst();
  console.log('Prisma PosSyncLog read passed.');
  const checks = await client.query("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = to_regclass('public.tbl_pos_sync_log') AND contype = 'c'");
  console.log(JSON.stringify(checks.rows, null, 2));
  if (process.argv.includes('--verify-write')) {
    const rollback = new Error('POS verification rollback');
    try {
      await prisma.$transaction(async tx => {
        const storeCode = `POS_CHECK_${randomUUID().slice(0, 8)}`;
        const category = await tx.menuCategory.create({ data: { storeCode, externalCategoryId: 'CHECK', categoryName: 'Verification', sourceType: 'pos', syncEnabled: true, lastSyncedAt: new Date() } });
        await tx.menuCategory.update({ where: { id: category.id }, data: { categoryName: 'Updated verification' } });
        await tx.posSyncLog.create({ data: { storeCode, syncType: 'MENU_CATEGORY', requestId: randomUUID(), syncBatchId: randomUUID(), receivedCount: 1, insertedCount: 1, deactivatedCount: 0, syncStatus: 'SUCCESS' } });
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    console.log('PostgreSQL category insert/update and MENU_CATEGORY log write passed; verification transaction rolled back.');
  }
} catch (error) {
  console.error('POS schema check failed:', error.code || '', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
  await prisma.$disconnect();
}
