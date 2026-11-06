import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, imageUrl, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';

const syncType = 'MENU_IMAGE';
export function posImageInput(value: unknown) {
  const input = { ...object(value) };
  for (const key of ['image_url', 'is_primary', 'is_active', 'display_order', 'configuration']) {
    if (typeof input[key] === 'string' && !input[key].trim()) delete input[key];
  }
  if (Object.hasOwn(input, 'menu_item_id')) throw new BrandingError('Use external_item_id; menu_item_id is assigned by the server.');
  const externalItemId = text(input.external_item_id, 100, true);
  const data: Partial<Prisma.MenuItemImageUncheckedCreateInput> & { externalImageId: string } = {
    externalImageId: text(input.external_image_id, 100, true),
  };
  if (input.image_url !== undefined) data.imageUrl = imageUrl(input.image_url, true);
  if (input.alt_text !== undefined) data.altText = input.alt_text === null ? null : text(input.alt_text, 250);
  if (input.display_order !== undefined) {
    const number = input.display_order;
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 2147483647) throw new BrandingError('display_order must be a nonnegative integer up to 2,147,483,647.');
    data.displayOrder = number;
  }
  for (const [key, target] of [['is_primary', 'isPrimary'], ['is_active', 'isActive']] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new BrandingError(`${key} must be boolean.`);
    data[target] = input[key];
  }
  if (input.configuration !== undefined) {
    if (input.configuration === null) data.configuration = Prisma.DbNull;
    else {
      const json = object(input.configuration);
      if (JSON.stringify(json).length > 30000) throw new BrandingError('configuration is too large.');
      data.configuration = json as Prisma.InputJsonObject;
    }
  }
  return { externalItemId, data };
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return { success: true, message: 'Images synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount, deactivated_count: counts.deactivatedCount, status: 1 };
}
export async function syncPosImages(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true); authorizedStore = storeCode;
    if (!Array.isArray(body.images)) throw new BrandingError('images must be a JSON array.');
    if (!body.images.length) throw new BrandingError('Send at least one image in images.');
    const images = body.images.map(posImageInput);
    const ids = images.map(image => image.data.externalImageId);
    if (new Set(ids).size !== ids.length) throw new BrandingError('Duplicate external image IDs.');
    receivedCount = images.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType); await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const parents = await tx.menuItem.findMany({ where: { storeCode, externalItemId: { in: [...new Set(images.map(image => image.externalItemId))] } }, select: { id: true, externalItemId: true, sourceType: true, syncEnabled: true, archivedAt: true } });
      const parentMap = new Map(parents.map(parent => [parent.externalItemId, parent]));
      const existing = await tx.menuItemImage.findMany({ where: { storeCode, OR: [{ externalImageId: { in: ids } }, { menuItemId: { in: parents.map(parent => parent.id) } }] }, select: { id: true, externalImageId: true, menuItemId: true, sourceType: true, archivedAt: true, isPrimary: true, isActive: true } });
      const matches = new Map(existing.map(image => [image.externalImageId, image]));
      const primaryTargets = new Map<string, string>();
      const prepared = images.map(image => {
        const parent = parentMap.get(image.externalItemId);
        if (!parent || parent.archivedAt) throw new BrandingError(`Item ${image.externalItemId} is missing or archived in this store. Upload it first.`, 409);
        if (parent.sourceType !== 'pos' || !parent.syncEnabled) throw new BrandingError(`Item ${image.externalItemId} is manual or has POS sync disabled.`, 409);
        const current = matches.get(image.data.externalImageId);
        if (current && (current.sourceType !== 'pos' || current.archivedAt)) throw new BrandingError(`Image ${image.data.externalImageId} is manual or archived.`, 409);
        if (current && current.menuItemId !== parent.id) throw new BrandingError(`Image ${image.data.externalImageId} belongs to another item and cannot be moved.`, 409);
        if (!current && !image.data.imageUrl) throw new BrandingError('image_url is required when creating an image.');
        const active = image.data.isActive ?? current?.isActive ?? true;
        if (image.data.isPrimary === true) {
          if (!active) throw new BrandingError('A primary image must be active.');
          if (primaryTargets.has(parent.id)) throw new BrandingError('Choose only one primary image per item in a batch.');
          primaryTargets.set(parent.id, image.data.externalImageId);
        }
        return { parent, current, data: { ...image.data, ...(!active ? { isPrimary: false } : {}) } };
      });
      for (const [parentId, externalImageId] of primaryTargets) {
        const peers = existing.filter(image => image.menuItemId === parentId && image.isPrimary && image.externalImageId !== externalImageId);
        if (peers.some(image => image.sourceType !== 'pos' || image.archivedAt)) throw new BrandingError('The current primary image is manual or archived and cannot be replaced by POS.', 409);
        await tx.menuItemImage.updateMany({ where: { storeCode, menuItemId: parentId, isPrimary: true, sourceType: 'pos', archivedAt: null, OR: [{ externalImageId: { not: externalImageId } }, { externalImageId: null }] }, data: { isPrimary: false } });
      }
      let insertedCount = 0;
      for (const image of prepared) {
        const selected = primaryTargets.get(image.parent.id);
        const data = { ...image.data, sourceType: 'pos', ...(selected && selected !== image.data.externalImageId ? { isPrimary: false } : {}) };
        if (image.current) await tx.menuItemImage.update({ where: { id: image.current.id }, data, select: { id: true } });
        else { await tx.menuItemImage.create({ data: { ...data, imageUrl: data.imageUrl!, storeCode, menuItemId: image.parent.id }, select: { id: true } }); insertedCount++; }
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Images synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
