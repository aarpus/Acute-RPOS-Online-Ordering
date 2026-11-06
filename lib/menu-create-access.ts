import type { MenuDb } from './menu-db';
import { MenuError } from './menu-validation';
import { canCreateMenuRecord } from './menu-create-policy';

export async function menuCreateAccess(db: MenuDb, storeCode: string) {
  const credential = await db.posApiCredential.findUnique({ where: { storeCode }, select: { isActive: true, menuCreateVisibility: true } });
  return { posEnabled: credential?.isActive ?? false, visibility: credential?.menuCreateVisibility ?? {} };
}
export async function assertMenuCreateAccess(db: MenuDb, storeCode: string, resources: string[]) {
  if (!resources.length) return;
  const policy = await menuCreateAccess(db, storeCode);
  for (const resource of resources) if (!canCreateMenuRecord(policy.posEnabled, policy.visibility, resource)) {
    throw new MenuError('Creation in this menu section is disabled by Super Admin while POS API is enabled.', 403);
  }
}
