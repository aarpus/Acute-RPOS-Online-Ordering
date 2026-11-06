import type { PrismaClient } from '@prisma/client';
import { getTrustedStoreContext } from './admin-stores';
import { OrderError } from './order-service';

export async function adminOrderStores(db: PrismaClient, admin: { storeCode: string }, requested?: string | null) {
  const { companyCode } = getTrustedStoreContext(admin);
  const rows = await db.store.findMany({
    where: { OR: [{ is_delete: false }, { is_delete: null }] },
    select: { store_code: true, company_code: true, storename: true },
  });
  const stores = rows.filter(row => row.company_code === companyCode && row.store_code?.trim()
    && rows.filter(other => other.store_code === row.store_code).length === 1)
    .map(row => ({ code: row.store_code!, name: row.storename || row.store_code! }));
  if (requested && !stores.some(store => store.code === requested)) throw new OrderError('Store access denied.', 403);
  return { stores, codes: requested ? [requested] : stores.map(store => store.code) };
}
