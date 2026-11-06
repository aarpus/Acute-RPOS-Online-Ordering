import { adminContext, withBrandingDb, ok } from '../../../../../lib/branding';
import { limitedJson, BrandingError } from '../../../../../lib/branding-validation';
import { archiveMenuRecord, lockMenu, menuFailure, menuRecordVersion, menuSnapshot, saveMenuRecord } from '../../../../../lib/menu-db';
import { object, MenuError, uuidPattern } from '../../../../../lib/menu-validation';
import { menuResources } from '../../../../../lib/menu-contract';

export async function POST(request: Request) {
  try {
    const { storeCode, adminId } = await adminContext(request);
    const body = await limitedJson(request, 1024 * 1024);
    if (!Array.isArray(body.operations) || !body.operations.length || body.operations.length > 200) throw new MenuError('Expected 1–200 menu operations.');
    const operations = body.operations.map(value => {
      const op = object(value);
      if (typeof op.resource !== 'string' || !menuResources[op.resource] || (op.id !== undefined && (typeof op.id !== 'string' || !uuidPattern.test(op.id))) || (op.method !== undefined && op.method !== 'DELETE') || (op.clientKey !== undefined && (typeof op.clientKey !== 'string' || op.clientKey.length > 100))) throw new MenuError('Invalid menu operation.');
      return { resource: op.resource, id: op.id as string | undefined, method: op.method, data: object(op.data), clientKey: op.clientKey as string | undefined };
    });
    const result = await withBrandingDb(db => db.$transaction(async tx => {
      await lockMenu(tx, storeCode);
      // Check every caller version before any write; later parent touches in the
      // same transaction cannot turn its own subsequent update into a conflict.
      for (const op of operations) if (op.id && await menuRecordVersion(tx, storeCode, op.resource, op.id) !== op.data.updatedAt) throw new MenuError('This record changed. Reload before saving.', 409);
      const created: Record<string, string> = {};
      const resolve = (value: unknown): unknown => {
        if (typeof value === 'string' && value.startsWith('@new:')) { const id = created[value.slice(5)]; if (!id) throw new MenuError('Unresolved new record reference.'); return id; }
        if (Array.isArray(value)) return value.map(resolve);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, resolve(val)]));
        return value;
      };
      for (const op of operations) {
        const data = resolve(op.data) as Record<string, unknown>;
        if (op.id) data.updatedAt = await menuRecordVersion(tx, storeCode, op.resource, op.id);
        if (op.method === 'DELETE') { if (!op.id) throw new MenuError('Archive requires an existing record.'); await archiveMenuRecord(tx, storeCode, op.resource, op.id, data.updatedAt); }
        else { const row = await saveMenuRecord(tx, storeCode, adminId, op.resource, data, op.id); if (op.clientKey) created[op.clientKey] = row.id; }
      }
      return { snapshot: await menuSnapshot(tx, storeCode), created };
    }, { timeout: 30000 }));
    return ok(result);
  } catch (error) { return menuFailure(error instanceof BrandingError ? new MenuError(error.message, error.status) : error); }
}
