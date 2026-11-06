import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, imageUrl, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';

type ItemType = 'regular' | 'combo';
export function posItemInput(value: unknown, itemType: ItemType = 'regular') {
  const input = { ...object(value) };
  // POS exports may include every optional field with a blank string.
  // Treat blank non-text values as omitted; explicit null still clears nullable fields.
  for (const key of [
    'item_type', 'food_type', 'base_price', 'compare_price', 'display_order',
    'preparation_time', 'special_instructions_max_length', 'minimum_quantity', 'maximum_quantity',
    'is_featured', 'is_visible', 'is_available', 'allow_special_instructions',
    'nutrition_info', 'metadata', 'configuration', 'allergens', 'tags',
    'external_category_ids', 'external_tax_id',
  ]) {
    if (typeof input[key] === 'string' && !input[key].trim()) delete input[key];
  }
  const data: Partial<Prisma.MenuItemUncheckedCreateInput> & { externalItemId: string; itemName: string } = {
    externalItemId: text(input.external_item_id, 100, true),
    itemName: text(input.item_name, 200, true),
  };
  if (input.item_type !== undefined && input.item_type !== itemType) throw new BrandingError(`This API accepts ${itemType} items only.`);
  if (itemType === 'combo' && ['combo_groups', 'combo_options', 'groups', 'children'].some(key => Object.hasOwn(input, key))) throw new BrandingError('Upload combo groups and options separately after the combo master.');
  for (const [key, target, max] of [['sku', 'sku', 100], ['description', 'description', 10000]] as const) {
    if (input[key] !== undefined) data[target] = text(input[key], max) || null;
  }
  if (input.image_url !== undefined) data.imageUrl = imageUrl(input.image_url) || null;
  if (input.food_type !== undefined) {
    if (input.food_type !== null && (typeof input.food_type !== 'string' || !['veg', 'non_veg', 'vegan', 'egg'].includes(input.food_type))) throw new BrandingError('food_type must be veg, non_veg, vegan, egg, or null.');
    data.foodType = input.food_type as string | null;
  }
  for (const [key, target] of [['base_price', 'basePrice'], ['compare_price', 'comparePrice']] as const) {
    if (input[key] === undefined) continue;
    if (key === 'compare_price' && input[key] === null) { data.comparePrice = null; continue; }
    const price = input[key];
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 9999999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001) throw new BrandingError(`${key} must be a nonnegative number with at most 2 decimal places (maximum 9,999,999,999.99).`);
    data[target] = price;
  }
  for (const [key, target, nullable, minimum] of [
    ['display_order', 'displayOrder', false, 0], ['preparation_time', 'preparationTime', true, 0],
    ['special_instructions_max_length', 'specialInstructionsMaxLength', false, 0],
    ['minimum_quantity', 'minimumQuantity', false, 1], ['maximum_quantity', 'maximumQuantity', true, 1],
  ] as const) {
    if (input[key] === undefined) continue;
    if (nullable && input[key] === null) {
      if (target === 'preparationTime') data.preparationTime = null;
      if (target === 'maximumQuantity') data.maximumQuantity = null;
      continue;
    }
    const number = input[key];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < minimum || number > 2147483647) throw new BrandingError(`${key} must be a whole number from ${minimum} to 2,147,483,647${nullable ? ', or null' : ''}.`);
    data[target] = number;
  }
  for (const [key, target] of [['is_featured', 'isFeatured'], ['is_visible', 'isVisible'], ['is_available', 'isAvailable'], ['allow_special_instructions', 'allowSpecialInstructions']] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new BrandingError(`${key} must be boolean.`);
    data[target] = input[key];
  }
  for (const [key, target] of [['nutrition_info', 'nutritionInfo'], ['metadata', 'metadata'], ['configuration', 'configuration'], ['allergens', 'allergens'], ['tags', 'tags']] as const) {
    if (input[key] === undefined) continue;
    const json = input[key];
    if (json === null) { data[target] = Prisma.DbNull; continue; }
    if (key === 'allergens' || key === 'tags') {
      if (!Array.isArray(json) || json.some(value => typeof value !== 'string' || !value.trim())) throw new BrandingError(`${key} must be an array of nonblank strings, or null.`);
    } else object(json);
    if (JSON.stringify(json).length > 30000) throw new BrandingError(`${key} is too large.`);
    data[target] = json as Prisma.InputJsonValue;
  }
  let categoryExternalIds: string[] | undefined;
  if (input.external_category_ids !== undefined) {
    if (!Array.isArray(input.external_category_ids) || !input.external_category_ids.length) throw new BrandingError('external_category_ids must be a nonempty array.');
    categoryExternalIds = input.external_category_ids.map(value => text(value, 100, true));
    if (new Set(categoryExternalIds).size !== categoryExternalIds.length) throw new BrandingError('Duplicate external category IDs on an item.');
  }
  const taxExternalId = input.external_tax_id === undefined ? undefined : input.external_tax_id === null ? null : text(input.external_tax_id, 100, true);
  return { data, categoryExternalIds, taxExternalId };
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts, itemType: ItemType) {
  return {
    success: true, message: itemType === 'combo' ? 'Combo items synchronized successfully' : 'Items synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount,
    deactivated_count: counts.deactivatedCount, status: 1,
  };
}
export async function syncPosItems(request: Request, pathStoreCode: string, itemType: ItemType = 'regular') {
  const syncType = itemType === 'combo' ? 'MENU_COMBO_ITEM' : 'MENU_ITEM';
  const payloadKey = itemType === 'combo' ? 'combo_items' : 'items';
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true); authorizedStore = storeCode;
    const incoming = body[payloadKey];
    if (!Array.isArray(incoming)) throw new BrandingError(`${payloadKey} must be a JSON array.`);
    if (!incoming.length) throw new BrandingError(`Send at least one item in ${payloadKey}.`);
    const items = incoming.map(value => posItemInput(value, itemType));
    const externalIds = items.map(item => item.data.externalItemId);
    if (new Set(externalIds).size !== externalIds.length) throw new BrandingError('Duplicate external item IDs.');
    receivedCount = items.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType); await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous, itemType), replayed: true };
      const existing = await tx.menuItem.findMany({
        where: { storeCode, externalItemId: { in: externalIds } },
        select: { id: true, externalItemId: true, sourceType: true, syncEnabled: true, archivedAt: true, itemType: true, minimumQuantity: true, maximumQuantity: true },
      });
      const matches = new Map(existing.map(item => [item.externalItemId, item]));
      const categoryIds = [...new Set(items.flatMap(item => item.categoryExternalIds ?? []))];
      const taxIds = [...new Set(items.flatMap(item => item.taxExternalId ? [item.taxExternalId] : []))];
      const categories = await tx.menuCategory.findMany({ where: { storeCode, externalCategoryId: { in: categoryIds }, archivedAt: null }, select: { id: true, externalCategoryId: true } });
      const taxes = await tx.menuTaxRule.findMany({ where: { storeCode, externalTaxId: { in: taxIds }, archivedAt: null }, select: { id: true, externalTaxId: true } });
      const categoryMap = new Map(categories.map(category => [category.externalCategoryId, category.id]));
      const taxMap = new Map(taxes.map(tax => [tax.externalTaxId, tax.id]));
      for (const externalId of categoryIds) if (!categoryMap.has(externalId)) throw new BrandingError(`Category ${externalId} is missing or archived in this store. Upload it before its items.`, 409);
      for (const externalId of taxIds) if (!taxMap.has(externalId)) throw new BrandingError(`Tax rule ${externalId} is missing or archived in this store. Upload it before its items.`, 409);
      let insertedCount = 0;
      for (const item of items) {
        const current = matches.get(item.data.externalItemId);
        if (current && (current.sourceType !== 'pos' || !current.syncEnabled || current.archivedAt || current.itemType !== itemType)) throw new BrandingError(`Item ${item.data.externalItemId} is manual, archived, sync-disabled, or is not a ${itemType} item.`, 409);
        if (!current && item.data.basePrice === undefined) throw new BrandingError('base_price is required for a new item.');
        if (!current && !item.categoryExternalIds) throw new BrandingError('external_category_ids is required for a new item.');
        if (current && !item.categoryExternalIds && !await tx.menuItemCategory.count({ where: { storeCode, menuItemId: current.id, category: { archivedAt: null } } })) throw new BrandingError('Send external_category_ids; the item has no unarchived category.');
        const min = item.data.minimumQuantity ?? current?.minimumQuantity ?? 1;
        const max = item.data.maximumQuantity === undefined ? current?.maximumQuantity ?? null : item.data.maximumQuantity;
        if (max !== null && max < min) throw new BrandingError('maximum_quantity must be at least minimum_quantity.');
        const data = { ...item.data, sourceType: 'pos', syncEnabled: true, lastSyncedAt: new Date(), updatedBy: null,
          ...(item.taxExternalId === undefined ? {} : { taxRuleId: item.taxExternalId === null ? null : taxMap.get(item.taxExternalId)! }),
        };
        const saved = current
          ? await tx.menuItem.update({ where: { id: current.id }, data, select: { id: true } })
          : await tx.menuItem.create({ data: { ...data, storeCode, itemType }, select: { id: true } });
        if (!current) insertedCount++;
        if (item.categoryExternalIds) {
          await tx.menuItemCategory.deleteMany({ where: { storeCode, menuItemId: saved.id } });
          await tx.menuItemCategory.createMany({ data: item.categoryExternalIds.map((externalId, displayOrder) => ({ storeCode, menuItemId: saved.id, categoryId: categoryMap.get(externalId)!, displayOrder })) });
        }
      }
      const counts = { receivedCount, insertedCount, deactivatedCount: 0 };
      const log = { ...counts, syncBatchId: randomUUID(), syncStatus: 'SUCCESS', errorMessage: null };
      await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
      return { body: result(storeCode, counts, itemType), replayed: false };
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Items synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
