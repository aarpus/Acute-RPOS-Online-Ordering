import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';

const syncType = 'MENU_MODIFIER_GROUP';
export function posModifierGroupInput(value: unknown) {
  const input = object(value);
  const data: {
    externalGroupId: string; name: string; description?: string | null;
    selectionType?: string; minSelect?: number; maxSelect?: number; displayOrder?: number;
    isActive?: boolean; allowOptionQuantity?: boolean;
    rules?: Prisma.InputJsonObject | typeof Prisma.DbNull;
    configuration?: Prisma.InputJsonObject | typeof Prisma.DbNull;
  } = { externalGroupId: text(input.external_group_id, 100, true), name: text(input.name, 150, true) };
  if (input.description !== undefined) data.description = text(input.description, 10000) || null;
  if (input.selection_type !== undefined) {
    if (input.selection_type !== 'single' && input.selection_type !== 'multiple') throw new BrandingError('selection_type must be single or multiple.');
    data.selectionType = input.selection_type;
  }
  for (const [key, target] of [['min_select', 'minSelect'], ['max_select', 'maxSelect'], ['display_order', 'displayOrder']] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'number' || !Number.isInteger(input[key]) || input[key] < 0 || input[key] > 2147483647) throw new BrandingError(`${key} must be a nonnegative whole number within the database integer range.`);
    data[target] = input[key];
  }
  for (const [key, target] of [['is_active', 'isActive'], ['allow_option_quantity', 'allowOptionQuantity']] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new BrandingError(`${key} must be boolean.`);
    data[target] = input[key];
  }
  for (const key of ['rules', 'configuration'] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null) data[key] = Prisma.DbNull;
    else {
      const json = object(input[key]);
      if (JSON.stringify(json).length > 30000) throw new BrandingError(`${key} is too large.`);
      data[key] = json as Prisma.InputJsonObject;
    }
  }
  return data;
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return {
    success: true, message: 'Modifier groups synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount,
    deactivated_count: counts.deactivatedCount, status: 1,
  };
}
export async function syncPosModifierGroups(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true);
    authorizedStore = storeCode;
    if (!Array.isArray(body.modifier_groups)) throw new BrandingError('modifier_groups must be a JSON array.');
    if (!body.modifier_groups.length) throw new BrandingError('Send at least one modifier group in modifier_groups.');
    const groups = body.modifier_groups.map(posModifierGroupInput);
    const externalIds = groups.map(group => group.externalGroupId);
    if (new Set(externalIds).size !== externalIds.length) throw new BrandingError('Duplicate external modifier group IDs.');
    receivedCount = groups.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType);
      await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const existing = await tx.menuModifierGroup.findMany({
        where: { storeCode, externalGroupId: { in: externalIds } },
        select: { id: true, externalGroupId: true, sourceType: true, archivedAt: true, selectionType: true, minSelect: true, maxSelect: true },
      });
      const matches = new Map(existing.map(group => [group.externalGroupId, group]));
      let insertedCount = 0;
      for (const group of groups) {
        const current = matches.get(group.externalGroupId);
        if (current && (current.sourceType !== 'pos' || current.archivedAt)) throw new BrandingError(`Modifier group ${group.externalGroupId} is manual or archived.`, 409);
        const selectionType = group.selectionType ?? current?.selectionType ?? 'single';
        const minSelect = group.minSelect ?? current?.minSelect ?? 0;
        const maxSelect = group.maxSelect ?? current?.maxSelect ?? 1;
        if (minSelect > maxSelect) throw new BrandingError('max_select must be at least min_select.');
        if (selectionType === 'single' && maxSelect !== 1) throw new BrandingError('Single selection requires max_select = 1.');
        const data = { ...group, sourceType: 'pos' };
        if (current) await tx.menuModifierGroup.update({ where: { id: current.id }, data, select: { id: true } });
        else { await tx.menuModifierGroup.create({ data: { storeCode, ...data }, select: { id: true } }); insertedCount++; }
      }
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Modifier groups synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
