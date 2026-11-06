import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';

const syncType = 'MENU_COMBO_GROUP';
export function posComboGroupInput(value: unknown) {
  const input = { ...object(value) };
  for (const key of ['selection_type', 'min_select', 'max_select', 'is_required', 'display_order', 'rules', 'configuration']) {
    if (typeof input[key] === 'string' && !input[key].trim()) delete input[key];
  }
  if (['options', 'combo_options', 'children'].some(key => Object.hasOwn(input, key))) throw new BrandingError('Upload combo options separately after the combo group.');
  const externalComboItemId = text(input.external_combo_item_id, 100, true);
  const data: Partial<Prisma.MenuComboGroupUncheckedCreateInput> & { externalGroupId: string; groupName: string } = {
    externalGroupId: text(input.external_group_id, 100, true), groupName: text(input.group_name, 150, true),
  };
  if (input.selection_type !== undefined) {
    if (input.selection_type !== 'fixed' && input.selection_type !== 'selectable') throw new BrandingError('selection_type must be fixed or selectable.');
    data.selectionType = input.selection_type;
  }
  for (const [key, target] of [['min_select', 'minSelect'], ['max_select', 'maxSelect'], ['display_order', 'displayOrder']] as const) {
    if (input[key] === undefined) continue;
    const number = input[key];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 2147483647) throw new BrandingError(`${key} must be a nonnegative integer up to 2,147,483,647.`);
    data[target] = number;
  }
  if (input.is_required !== undefined) {
    if (typeof input.is_required !== 'boolean') throw new BrandingError('is_required must be boolean.');
    data.isRequired = input.is_required;
  }
  for (const key of ['rules', 'configuration'] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null) { data[key] = Prisma.DbNull; continue; }
    const json = object(input[key]);
    if (JSON.stringify(json).length > 30000) throw new BrandingError(`${key} is too large.`);
    data[key] = json as Prisma.InputJsonObject;
  }
  return { externalComboItemId, data };
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return { success: true, message: 'Combo groups synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount, deactivated_count: counts.deactivatedCount, status: 1 };
}
export async function syncPosComboGroups(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true); authorizedStore = storeCode;
    if (!Array.isArray(body.combo_groups)) throw new BrandingError('combo_groups must be a JSON array.');
    if (!body.combo_groups.length) throw new BrandingError('Send at least one combo group in combo_groups.');
    const groups = body.combo_groups.map(posComboGroupInput);
    const ids = groups.map(group => group.data.externalGroupId);
    if (new Set(ids).size !== ids.length) throw new BrandingError('Duplicate external combo group IDs.');
    receivedCount = groups.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType); await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const parents = await tx.menuItem.findMany({ where: { storeCode, externalItemId: { in: [...new Set(groups.map(group => group.externalComboItemId))] } }, select: { id: true, externalItemId: true, itemType: true, sourceType: true, syncEnabled: true, archivedAt: true } });
      const parentMap = new Map(parents.map(parent => [parent.externalItemId, parent]));
      const existing = await tx.menuComboGroup.findMany({ where: { storeCode, externalGroupId: { in: ids } }, select: { id: true, externalGroupId: true, comboItemId: true, sourceType: true, archivedAt: true, minSelect: true, maxSelect: true, isRequired: true } });
      const matches = new Map(existing.map(group => [group.externalGroupId, group]));
      let insertedCount = 0;
      for (const group of groups) {
        const parent = parentMap.get(group.externalComboItemId);
        if (!parent || parent.archivedAt) throw new BrandingError(`Combo item ${group.externalComboItemId} is missing or archived in this store. Upload it first.`, 409);
        if (parent.itemType !== 'combo') throw new BrandingError(`Item ${group.externalComboItemId} is not a combo item.`, 409);
        if (parent.sourceType !== 'pos' || !parent.syncEnabled) throw new BrandingError(`Combo item ${group.externalComboItemId} is manual or has POS sync disabled.`, 409);
        const current = matches.get(group.data.externalGroupId);
        if (current && (current.sourceType !== 'pos' || current.archivedAt)) throw new BrandingError(`Combo group ${group.data.externalGroupId} is manual or archived.`, 409);
        if (current && current.comboItemId !== parent.id) throw new BrandingError(`Combo group ${group.data.externalGroupId} belongs to another combo and cannot be moved.`, 409);
        const min = group.data.minSelect ?? current?.minSelect ?? 0;
        const max = group.data.maxSelect ?? current?.maxSelect ?? 1;
        const required = group.data.isRequired ?? current?.isRequired ?? false;
        if (min > max) throw new BrandingError('max_select must be at least min_select.');
        if (required && min < 1) throw new BrandingError('A required combo group needs min_select of at least 1.');
        const data = { ...group.data, sourceType: 'pos' };
        if (current) await tx.menuComboGroup.update({ where: { id: current.id }, data, select: { id: true } });
        else { await tx.menuComboGroup.create({ data: { ...data, storeCode, comboItemId: parent.id }, select: { id: true } }); insertedCount++; }
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Combo groups synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
