import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';

const syncType = 'MENU_COMBO_OPTION';
export function posComboOptionInput(value: unknown) {
  const input = { ...object(value) };
  for (const key of ['external_component_item_id', 'quantity', 'extra_price', 'is_default', 'is_available', 'display_order', 'configuration']) {
    if (typeof input[key] === 'string' && !input[key].trim()) delete input[key];
  }
  if (['component_item_id', 'combo_group_id'].some(key => Object.hasOwn(input, key))) throw new BrandingError('Use external IDs; internal IDs are assigned by the server.');
  const externalGroupId = text(input.external_group_id, 100, true);
  const externalComponentItemId = input.external_component_item_id === undefined ? undefined : text(input.external_component_item_id, 100, true);
  const data: Partial<Prisma.MenuComboOptionUncheckedCreateInput> & { externalOptionId: string; optionName: string } = {
    externalOptionId: text(input.external_option_id, 100, true), optionName: text(input.option_name, 150, true),
  };
  if (input.quantity !== undefined) {
    const n = input.quantity;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0.001 || n > 9999999.999 || Math.abs(n * 1000 - Math.round(n * 1000)) > 0.00001) throw new BrandingError('quantity must be between 0.001 and 9,999,999.999 with at most 3 decimal places.');
    data.quantity = n;
  }
  if (input.extra_price !== undefined && input.extra_price !== null) {
    const n = input.extra_price;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 9999999999.99 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw new BrandingError('extra_price must be nonnegative with at most 2 decimal places (maximum 9,999,999,999.99).');
    data.extraPrice = n;
  }
  if (input.display_order !== undefined) {
    const number = input.display_order;
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 2147483647) throw new BrandingError('display_order must be a nonnegative integer up to 2,147,483,647.');
    data.displayOrder = number;
  }
  for (const [key, target] of [['is_default', 'isDefault'], ['is_available', 'isAvailable']] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new BrandingError(`${key} must be boolean.`);
    data[target] = input[key];
  }
  if (input.configuration !== undefined) {
    if (input.configuration === null) data.configuration = Prisma.DbNull;
    else {
      const json = { ...object(input.configuration) };
      if (json.useItemPrice !== undefined && typeof json.useItemPrice !== 'boolean') throw new BrandingError('configuration.useItemPrice must be boolean.');
      if (JSON.stringify(json).length > 30000) throw new BrandingError('configuration is too large.');
      data.configuration = json as Prisma.InputJsonObject;
    }
  }
  return { externalGroupId, externalComponentItemId, data, useItemPrice: input.extra_price === undefined ? undefined : input.extra_price === null };
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return { success: true, message: 'Combo options synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount, deactivated_count: counts.deactivatedCount, status: 1 };
}
export async function syncPosComboOptions(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true); authorizedStore = storeCode;
    if (!Array.isArray(body.combo_options)) throw new BrandingError('combo_options must be a JSON array.');
    if (!body.combo_options.length) throw new BrandingError('Send at least one combo option in combo_options.');
    const options = body.combo_options.map(posComboOptionInput);
    const ids = options.map(option => option.data.externalOptionId);
    if (new Set(ids).size !== ids.length) throw new BrandingError('Duplicate external combo option IDs.');
    receivedCount = options.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType); await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const groups = await tx.menuComboGroup.findMany({ where: { storeCode, externalGroupId: { in: [...new Set(options.map(option => option.externalGroupId))] } }, include: { comboItem: true } });
      const groupMap = new Map(groups.map(group => [group.externalGroupId, group]));
      const existing = await tx.menuComboOption.findMany({ where: { storeCode, externalOptionId: { in: ids } } });
      const matches = new Map(existing.map(option => [option.externalOptionId, option]));
      let insertedCount = 0;
      for (const option of options) {
        const group = groupMap.get(option.externalGroupId);
        if (!group || group.archivedAt) throw new BrandingError(`Combo group ${option.externalGroupId} is missing or archived in this store. Upload it first.`, 409);
        const parent = group.comboItem;
        if (group.sourceType !== 'pos' || parent.archivedAt || parent.itemType !== 'combo' || parent.sourceType !== 'pos' || !parent.syncEnabled) throw new BrandingError('The combo group and parent combo must be unarchived POS records with sync enabled.', 409);
        const current = matches.get(option.data.externalOptionId);
        if (current && (current.sourceType !== 'pos' || current.archivedAt)) throw new BrandingError(`Combo option ${option.data.externalOptionId} is manual or archived.`, 409);
        if (current && current.comboGroupId !== group.id) throw new BrandingError(`Combo option ${option.data.externalOptionId} belongs to another group and cannot be moved.`, 409);
        const componentExternalId = option.externalComponentItemId ?? current?.externalComponentItemId;
        if (!componentExternalId) throw new BrandingError('external_component_item_id is required when creating a combo option.');
        const component = await tx.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode, externalItemId: componentExternalId } }, select: { id: true, archivedAt: true, itemType: true } });
        if (!component || component.archivedAt) throw new BrandingError(`Component item ${componentExternalId} is missing or archived in this store. Upload it first.`, 409);
        if (component.itemType !== 'regular') throw new BrandingError('Choose a regular item as the combo component; nested combos are not supported.', 409);
        const data = { ...option.data, sourceType: 'pos', componentItemId: component.id, externalComponentItemId: componentExternalId };
        if (option.useItemPrice !== undefined) {
          const config = data.configuration === Prisma.DbNull ? {} : data.configuration ?? current?.configuration ?? {};
          data.configuration = { ...object(config), useItemPrice: option.useItemPrice } as Prisma.InputJsonObject;
          if (option.useItemPrice) data.extraPrice = 0;
        }
        if (current) await tx.menuComboOption.update({ where: { id: current.id }, data, select: { id: true } });
        else { await tx.menuComboOption.create({ data: { ...data, storeCode, comboGroupId: group.id }, select: { id: true } }); insertedCount++; }
      }
      for (const group of groups) {
        if (group.selectionType !== 'selectable') continue;
        const defaults = await tx.menuComboOption.count({ where: { storeCode, comboGroupId: group.id, archivedAt: null, isDefault: true, isAvailable: true } });
        if (defaults > group.maxSelect) throw new BrandingError(`Default options exceed max_select for combo group ${group.externalGroupId}.`, 409);
      }
      await tx.menuItem.updateMany({ where: { storeCode, id: { in: groups.map(group => group.comboItemId) } }, data: { updatedAt: new Date() } });
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Combo options synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
