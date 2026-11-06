import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, imageUrl, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';

const syncType = 'MENU_MODIFIER_OPTION';
export function posModifierOptionInput(value: unknown) {
  const input = { ...object(value) };
  for (const key of ['price', 'is_default', 'is_available', 'min_quantity', 'max_quantity', 'display_order', 'linked_external_item_id', 'metadata', 'configuration']) {
    if (typeof input[key] === 'string' && !input[key].trim()) delete input[key];
  }
  if (Object.hasOwn(input, 'linked_item_id')) throw new BrandingError('Use linked_external_item_id; linked_item_id is assigned by the server.');
  const externalGroupId = text(input.external_group_id, 100, true);
  const data: Partial<Prisma.MenuModifierOptionUncheckedCreateInput> & { externalOptionId: string; name: string } = {
    externalOptionId: text(input.external_option_id, 100, true), name: text(input.name, 150, true),
  };
  if (input.price !== undefined) {
    const price = input.price;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 9999999999.99 || Math.abs(price * 100 - Math.round(price * 100)) > 0.00001) throw new BrandingError('price must be a nonnegative number with at most 2 decimal places (maximum 9,999,999,999.99).');
    data.price = price;
  }
  for (const [key, target] of [['is_default', 'isDefault'], ['is_available', 'isAvailable']] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new BrandingError(`${key} must be boolean.`);
    data[target] = input[key];
  }
  for (const [key, target] of [['min_quantity', 'minQuantity'], ['max_quantity', 'maxQuantity'], ['display_order', 'displayOrder']] as const) {
    if (input[key] === undefined) continue;
    const number = input[key];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 2147483647) throw new BrandingError(`${key} must be a nonnegative integer up to 2,147,483,647.`);
    data[target] = number;
  }
  for (const key of ['metadata', 'configuration'] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null) { data[key] = Prisma.DbNull; continue; }
    const json = { ...object(input[key]) };
    if (key === 'configuration' && json.image !== undefined && json.image !== null) json.image = imageUrl(json.image);
    if (JSON.stringify(json).length > 30000) throw new BrandingError(`${key} is too large.`);
    data[key] = json as Prisma.InputJsonObject;
  }
  const linkedExternalItemId = input.linked_external_item_id === undefined ? undefined : input.linked_external_item_id === null ? null : text(input.linked_external_item_id, 100, true);
  return { externalGroupId, linkedExternalItemId, data };
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return { success: true, message: 'Modifier options synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount, deactivated_count: counts.deactivatedCount, status: 1 };
}
export async function syncPosModifierOptions(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true); authorizedStore = storeCode;
    if (!Array.isArray(body.modifier_options)) throw new BrandingError('modifier_options must be a JSON array.');
    if (!body.modifier_options.length) throw new BrandingError('Send at least one modifier option in modifier_options.');
    const options = body.modifier_options.map(posModifierOptionInput);
    const ids = options.map(option => option.data.externalOptionId);
    if (new Set(ids).size !== ids.length) throw new BrandingError('Duplicate external modifier option IDs.');
    receivedCount = options.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType); await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const groups = await tx.menuModifierGroup.findMany({ where: { storeCode, externalGroupId: { in: [...new Set(options.map(option => option.externalGroupId))] } }, select: { id: true, externalGroupId: true, sourceType: true, archivedAt: true, maxSelect: true } });
      const groupMap = new Map(groups.map(group => [group.externalGroupId, group]));
      const existing = await tx.menuModifierOption.findMany({ where: { storeCode, OR: [{ externalOptionId: { in: ids } }, { modifierGroupId: { in: groups.map(group => group.id) } }] }, select: { id: true, externalOptionId: true, modifierGroupId: true, sourceType: true, archivedAt: true, minQuantity: true, maxQuantity: true, isDefault: true, isAvailable: true } });
      const matches = new Map(existing.filter(option => option.externalOptionId).map(option => [option.externalOptionId, option]));
      const linkedIds = [...new Set(options.flatMap(option => option.linkedExternalItemId ? [option.linkedExternalItemId] : []))];
      const linkedItems = await tx.menuItem.findMany({ where: { storeCode, externalItemId: { in: linkedIds }, archivedAt: null }, select: { id: true, externalItemId: true } });
      const linkedMap = new Map(linkedItems.map(item => [item.externalItemId, item.id]));
      for (const externalId of linkedIds) if (!linkedMap.has(externalId)) throw new BrandingError(`Linked item ${externalId} is missing or archived in this store. Upload it first.`, 409);
      const prepared = options.map(option => {
        const group = groupMap.get(option.externalGroupId);
        if (!group || group.archivedAt) throw new BrandingError(`Modifier group ${option.externalGroupId} is missing or archived in this store. Upload it first.`, 409);
        if (group.sourceType !== 'pos') throw new BrandingError(`Modifier group ${option.externalGroupId} is manual and cannot receive POS options.`, 409);
        const current = matches.get(option.data.externalOptionId);
        if (current && (current.sourceType !== 'pos' || current.archivedAt)) throw new BrandingError(`Modifier option ${option.data.externalOptionId} is manual or archived.`, 409);
        if (current && current.modifierGroupId !== group.id) throw new BrandingError(`Modifier option ${option.data.externalOptionId} belongs to another group and cannot be moved.`, 409);
        if (!current && option.data.price === undefined) throw new BrandingError('price is required for a new modifier option.');
        const min = option.data.minQuantity ?? current?.minQuantity ?? 0;
        const max = option.data.maxQuantity ?? current?.maxQuantity ?? 1;
        if (min > max) throw new BrandingError('max_quantity must be at least min_quantity.');
        return { ...option, group, current };
      });
      // Check the final batch state so an explicit default switch is atomic.
      const changes = new Map(prepared.filter(option => option.current).map(option => [option.current!.id, option]));
      const defaults = new Map<string, number>();
      const countDefault = (groupId: string, isDefault: boolean, isAvailable: boolean) => {
        if (isDefault && isAvailable) defaults.set(groupId, (defaults.get(groupId) ?? 0) + 1);
      };
      for (const current of existing) if (!current.archivedAt) {
        const change = changes.get(current.id);
        countDefault(current.modifierGroupId, change?.data.isDefault ?? current.isDefault, change?.data.isAvailable ?? current.isAvailable);
      }
      for (const option of prepared) if (!option.current) countDefault(option.group.id, option.data.isDefault ?? false, option.data.isAvailable ?? true);
      for (const group of groups) if ((defaults.get(group.id) ?? 0) > group.maxSelect) throw new BrandingError(`Default available options exceed max_select for modifier group ${group.externalGroupId}.`, 409);
      let insertedCount = 0;
      for (const option of prepared) {
        const data = { ...option.data, sourceType: 'pos',
          ...(option.linkedExternalItemId === undefined ? {} : { linkedItemId: option.linkedExternalItemId === null ? null : linkedMap.get(option.linkedExternalItemId)! }) };
        if (option.current) await tx.menuModifierOption.update({ where: { id: option.current.id }, data, select: { id: true } });
        else { await tx.menuModifierOption.create({ data: { ...data, storeCode, modifierGroupId: option.group.id }, select: { id: true } }); insertedCount++; }
      }
      await tx.menuModifierGroup.updateMany({ where: { storeCode, id: { in: groups.map(group => group.id) } }, data: { updatedAt: new Date() } });
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Modifier options synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
