import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, imageUrl, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';

const syncType = 'MENU_VARIANT';
export function posVariantInput(value: unknown) {
  const input = { ...object(value) };
  for (const key of ['price', 'compare_price', 'is_default', 'is_available', 'display_order', 'metadata', 'configuration']) {
    if (typeof input[key] === 'string' && !input[key].trim()) delete input[key];
  }
  if (Object.hasOwn(input, 'inventory_quantity')) throw new BrandingError('Use the Inventory API for stock; inventory_quantity is not a variant field.');
  const externalItemId = text(input.external_item_id, 100, true);
  const data: Partial<Prisma.MenuItemVariantUncheckedCreateInput> & { externalVariantId: string; name: string } = {
    externalVariantId: text(input.external_variant_id, 100, true), name: text(input.name, 150, true),
  };
  if (input.sku !== undefined) data.sku = text(input.sku, 100) || null;
  for (const [key, target] of [['price', 'price'], ['compare_price', 'comparePrice']] as const) {
    if (input[key] === undefined) continue;
    if (key === 'compare_price' && input[key] === null) { data.comparePrice = null; continue; }
    const price = input[key];
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 9999999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001) throw new BrandingError(`${key} must be a nonnegative number with at most 2 decimal places (maximum 9,999,999,999.99).`);
    data[target] = price;
  }
  for (const [key, target] of [['is_default', 'isDefault'], ['is_available', 'isAvailable']] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new BrandingError(`${key} must be boolean.`);
    data[target] = input[key];
  }
  if (input.display_order !== undefined) {
    if (typeof input.display_order !== 'number' || !Number.isInteger(input.display_order) || input.display_order < 0 || input.display_order > 2147483647) throw new BrandingError('display_order must be a nonnegative integer up to 2,147,483,647.');
    data.displayOrder = input.display_order;
  }
  for (const key of ['metadata', 'configuration'] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null) { data[key] = Prisma.DbNull; continue; }
    const json = { ...object(input[key]) };
    if (key === 'configuration') {
      if (typeof json.group === 'string' && !json.group.trim()) delete json.group;
      if (json.group !== undefined && (typeof json.group !== 'string' || !['Size', 'Portion', 'Serving'].includes(json.group))) throw new BrandingError('configuration.group must be Size, Portion or Serving.');
      if (json.image !== undefined && json.image !== null) json.image = imageUrl(json.image);
    }
    if (JSON.stringify(json).length > 30000) throw new BrandingError(`${key} is too large.`);
    data[key] = json as Prisma.InputJsonObject;
  }
  return { externalItemId, data };
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return { success: true, message: 'Variants synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount, deactivated_count: counts.deactivatedCount, status: 1 };
}
export async function syncPosVariants(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true); authorizedStore = storeCode;
    if (!Array.isArray(body.variants)) throw new BrandingError('variants must be a JSON array.');
    if (!body.variants.length) throw new BrandingError('Send at least one variant in variants.');
    const variants = body.variants.map(posVariantInput);
    const ids = variants.map(variant => variant.data.externalVariantId);
    if (new Set(ids).size !== ids.length) throw new BrandingError('Duplicate external variant IDs.');
    receivedCount = variants.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType); await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const parents = await tx.menuItem.findMany({ where: { storeCode, externalItemId: { in: [...new Set(variants.map(variant => variant.externalItemId))] } }, select: { id: true, externalItemId: true, sourceType: true, syncEnabled: true, archivedAt: true } });
      const parentMap = new Map(parents.map(parent => [parent.externalItemId, parent]));
      const existing = await tx.menuItemVariant.findMany({ where: { storeCode, OR: [{ externalVariantId: { in: ids } }, { menuItemId: { in: parents.map(parent => parent.id) } }] }, select: { id: true, externalVariantId: true, menuItemId: true, name: true, isDefault: true, sourceType: true, archivedAt: true } });
      const matches = new Map(existing.filter(variant => variant.externalVariantId).map(variant => [variant.externalVariantId, variant]));
      const defaultTargets = new Map<string, string>();
      const prepared = variants.map(variant => {
        const parent = parentMap.get(variant.externalItemId);
        if (!parent || parent.archivedAt) throw new BrandingError(`Item ${variant.externalItemId} is missing or archived in this store. Upload it first.`, 409);
        if (parent.sourceType !== 'pos' || !parent.syncEnabled) throw new BrandingError(`Item ${variant.externalItemId} is manual or has POS sync disabled.`, 409);
        const current = matches.get(variant.data.externalVariantId);
        if (current && (current.sourceType !== 'pos' || current.archivedAt)) throw new BrandingError(`Variant ${variant.data.externalVariantId} is manual or archived.`, 409);
        if (current && current.menuItemId !== parent.id) throw new BrandingError(`Variant ${variant.data.externalVariantId} belongs to another item and cannot be moved.`, 409);
        if (!current && variant.data.price === undefined) throw new BrandingError('price is required for a new variant.');
        if (variant.data.isDefault === true) {
          if (defaultTargets.has(parent.id)) throw new BrandingError('Send only one default variant per item.');
          defaultTargets.set(parent.id, variant.data.externalVariantId);
        }
        return { ...variant, parent, current };
      });
      // Validate the final names, allowing atomic name swaps in the same batch.
      const changes = new Map(prepared.filter(entry => entry.current).map(entry => [entry.current!.id, entry]));
      const names = new Set<string>();
      const checkName = (parentId: string, name: string) => {
        const identity = `${parentId}:${name.trim().toLowerCase()}`;
        if (names.has(identity)) throw new BrandingError('This item already has a variant with that name.', 409);
        names.add(identity);
      };
      const parentIds = new Set(parents.map(parent => parent.id));
      for (const current of existing) if (!current.archivedAt && parentIds.has(current.menuItemId)) checkName(current.menuItemId, changes.get(current.id)?.data.name ?? current.name);
      for (const entry of prepared) if (!entry.current) checkName(entry.parent.id, entry.data.name);
      for (const [parentId, externalVariantId] of defaultTargets) {
        const peers = existing.filter(variant => variant.menuItemId === parentId && variant.isDefault && variant.externalVariantId !== externalVariantId);
        if (peers.some(variant => variant.sourceType !== 'pos' || variant.archivedAt)) throw new BrandingError('The current default variant is manual or archived and cannot be replaced by POS.', 409);
        await tx.menuItemVariant.updateMany({ where: { storeCode, menuItemId: parentId, isDefault: true, OR: [{ externalVariantId: { not: externalVariantId } }, { externalVariantId: null }], sourceType: 'pos', archivedAt: null }, data: { isDefault: false } });
      }
      let insertedCount = 0;
      for (const entry of prepared) {
        const selectedDefault = defaultTargets.get(entry.parent.id);
        const data = { ...entry.data, sourceType: 'pos', inventoryQuantity: null,
          ...(selectedDefault && selectedDefault !== entry.data.externalVariantId ? { isDefault: false } : {}) };
        if (entry.current) await tx.menuItemVariant.update({ where: { id: entry.current.id }, data, select: { id: true } });
        else { await tx.menuItemVariant.create({ data: { ...data, storeCode, menuItemId: entry.parent.id }, select: { id: true } }); insertedCount++; }
      }
      await tx.menuItem.updateMany({ where: { storeCode, id: { in: parents.map(parent => parent.id) } }, data: { updatedAt: new Date() } });
      const counts = { receivedCount, insertedCount, deactivatedCount: 0 };
      const log = { ...counts, syncBatchId: randomUUID(), syncStatus: 'SUCCESS', errorMessage: null };
      await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
      return { body: result(storeCode, counts), replayed: false };
    }, { timeout: 15000 }));
    return Response.json(response.body, { headers: { 'Cache-Control': 'no-store', 'X-POS-Request-Id': encodeURIComponent(requestId), 'X-POS-Replayed': String(response.replayed) } });
  } catch (error) {
    if (authorizedStore) {
      try {
        await withBrandingDb(db => db.$transaction(async tx => {
          await lockScope(tx, authorizedStore, syncType);
          const key = { storeCode: authorizedStore, syncType, requestId };
          const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
          if (previous?.syncStatus === 'SUCCESS') return;
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Variants synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
