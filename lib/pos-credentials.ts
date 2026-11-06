import { createHash, randomBytes } from 'node:crypto';
import { getAuthenticatedAdmin } from './admin-auth';
import { findStore, getTrustedStoreContext } from './admin-stores';
import { sameOrigin } from './auth';
import { brandingResponse, ok, withBrandingDb } from './branding';
import { BrandingError, limitedJson } from './branding-validation';
import { menuCreateSections } from './menu-create-policy';

export function hashPosToken(token: string) { return createHash('sha256').update(token).digest('hex'); }

export async function authorizePos(request: Request, storeCode: string) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.length < 32 || token.length > 256) throw new BrandingError('Invalid or missing POS token.', 401);
  const credential = await withBrandingDb(db => {
    if (!db.posApiCredential) throw new BrandingError('POS API client is out of date. Regenerate Prisma and restart the server.', 503);
    return db.posApiCredential.findUnique({ where: { tokenHash: hashPosToken(token) } });
  });
  if (!credential?.isActive) throw new BrandingError('Invalid or disabled POS token.', 401);
  if (credential.storeCode !== storeCode) throw new BrandingError('Token is not authorized for this store.', 403);
}

export async function managePosCredential(request: Request, storeId: string) {
  try {
    if (request.method !== 'GET' && !sameOrigin(request)) throw new BrandingError('Invalid origin.', 403);
    const admin = await getAuthenticatedAdmin(request);
    if (!admin) throw new BrandingError('Authentication required.', 401);
    if (!/^\d+$/.test(storeId)) throw new BrandingError('Invalid store ID.');
    const { companyCode } = getTrustedStoreContext(admin);
    const store = await findStore(storeId, companyCode);
    if (!store?.store_code) throw new BrandingError('Store unavailable.', 404);
    const storeCode = store.store_code;
    return await withBrandingDb(async db => {
      if (!db.posApiCredential) throw new BrandingError('POS API client is out of date. Regenerate Prisma and restart the server.', 503);
      const count = await db.store.count({ where: { store_code: storeCode, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (count !== 1) throw new BrandingError('Store code must be unique.', 409);
      const path = `/api/pos/stores/${encodeURIComponent(storeCode)}`;
      const urls = { heroUrl: `${path}/hero-banner/sync`, categoriesUrl: `${path}/categories/sync`, taxRulesUrl: `${path}/tax-rules/sync`, modifierGroupsUrl: `${path}/modifier-groups/sync`, itemsUrl: `${path}/items/sync`, comboItemsUrl: `${path}/combo-items/sync`, variantsUrl: `${path}/variants/sync`, modifierOptionsUrl: `${path}/modifier-options/sync`, modifierLinksUrl: `${path}/modifier-links/sync`, comboGroupsUrl: `${path}/combo-groups/sync`, comboOptionsUrl: `${path}/combo-options/sync`, imagesUrl: `${path}/images/sync`, offersUrl: `${path}/offers/sync` };
      if (request.method === 'GET') {
        const credential = await db.posApiCredential.findUnique({ where: { storeCode }, select: { isActive: true, updatedAt: true, menuCreateVisibility: true } });
        return ok({ storeCode, configured: credential?.isActive ?? false, updatedAt: credential?.updatedAt ?? null, menuCreateVisibility: credential?.menuCreateVisibility ?? {}, canManageMenuCreation: admin.role === 'super_admin', ...urls });
      }
      if (request.method === 'PATCH') {
        if (admin.role !== 'super_admin') throw new BrandingError('Super Admin access required.', 403);
        const body = await limitedJson(request, 8192);
        const visibility = body.menuCreateVisibility;
        if (!visibility || typeof visibility !== 'object' || Array.isArray(visibility) || Object.entries(visibility).some(([key, value]) => !Object.hasOwn(menuCreateSections, key) || typeof value !== 'boolean')) throw new BrandingError('Invalid menu creation settings.');
        const credential = await db.posApiCredential.findUnique({ where: { storeCode } });
        if (!credential) throw new BrandingError('Enable POS API before configuring menu creation.', 409);
        await db.posApiCredential.update({ where: { storeCode }, data: { menuCreateVisibility: visibility, updatedBy: admin.id } });
        return ok({ storeCode, configured: credential.isActive, menuCreateVisibility: visibility, canManageMenuCreation: true, ...urls });
      }
      if (request.method === 'DELETE') {
        await db.posApiCredential.updateMany({ where: { storeCode }, data: { isActive: false, updatedBy: admin.id } });
        const credential = await db.posApiCredential.findUnique({ where: { storeCode } });
        return ok({ storeCode, configured: false, menuCreateVisibility: credential?.menuCreateVisibility ?? {}, canManageMenuCreation: admin.role === 'super_admin', ...urls });
      }
      const token = `pos_${randomBytes(32).toString('base64url')}`;
      const tokenHash = hashPosToken(token);
      const credential = await db.posApiCredential.upsert({ where: { storeCode }, create: { storeCode, tokenHash, createdBy: admin.id, updatedBy: admin.id }, update: { tokenHash, isActive: true, updatedBy: admin.id } });
      // Only the hash is persisted. A rotated token invalidates the previous one.
      return ok({ storeCode, configured: true, token, menuCreateVisibility: credential.menuCreateVisibility, canManageMenuCreation: admin.role === 'super_admin', ...urls });
    });
  } catch (error) { return brandingResponse(error); }
}
