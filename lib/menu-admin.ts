import { adminContext, withBrandingDb, ok } from './branding';
import { BrandingError, limitedJson } from './branding-validation';
import { archiveMenuRecord, lockMenu, menuFailure, menuRows, menuSnapshot, saveMenuRecord } from './menu-db';
import { MenuError, object } from './menu-validation';
import { menuResources } from './menu-contract';

export async function menuAdmin(request: Request, resource: string, id?: string) {
  try {
    const { storeCode, adminId } = await adminContext(request);
    if (resource !== 'workspace' && !menuResources[resource]) throw new MenuError('Unknown resource.', 404);
    if (request.method === 'GET') {
      return ok(await withBrandingDb(db => db.$transaction(async tx => resource === 'workspace' ? menuSnapshot(tx, storeCode) : menuRows(tx, storeCode, resource), { isolationLevel: 'RepeatableRead', timeout: 20000 })));
    }
    if (resource === 'workspace') throw new MenuError('Method not allowed.', 405);
    const input = object(await limitedJson(request, 512 * 1024));
    const result = await withBrandingDb(db => db.$transaction(async tx => {
      await lockMenu(tx, storeCode);
      if (request.method === 'DELETE' && id) { await archiveMenuRecord(tx, storeCode, resource, id, input.updatedAt); return { id }; }
      if (request.method !== 'POST' && request.method !== 'PATCH') throw new MenuError('Method not allowed.', 405);
      return saveMenuRecord(tx, storeCode, adminId, resource, input, id);
    }, { timeout: 20000 }));
    return ok(result, request.method === 'POST' ? 201 : 200);
  } catch (error) {
    if (error instanceof BrandingError) return menuFailure(new MenuError(error.message, error.status));
    return menuFailure(error);
  }
}
