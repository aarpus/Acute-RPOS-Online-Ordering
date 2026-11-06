import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, limitedJson, object, text } from './branding-validation';
import { isPosManagedMenuRecord, lockMenu } from './menu-db';

const syncType = 'MENU_MODIFIER_LINK';
export function posModifierLinkInput(value: unknown) {
  const input = { ...object(value) };
  for (const key of ['external_variant_id', 'is_required_override', 'min_select_override', 'max_select_override', 'display_order', 'allowed_external_option_ids', 'conditions', 'configuration']) {
    if (typeof input[key] === 'string' && !input[key].trim()) delete input[key];
  }
  const externalItemId = text(input.external_item_id, 100, true);
  const externalGroupId = text(input.external_group_id, 100, true);
  const externalVariantId = input.external_variant_id == null ? null : text(input.external_variant_id, 100, true);
  const data: { isRequiredOverride?: boolean | null; minSelectOverride?: number | null; maxSelectOverride?: number | null; displayOrder?: number } = {};
  if (input.is_required_override !== undefined) {
    if (input.is_required_override !== null && typeof input.is_required_override !== 'boolean') throw new BrandingError('is_required_override must be boolean or null.');
    data.isRequiredOverride = input.is_required_override as boolean | null;
  }
  for (const [key, target] of [['min_select_override', 'minSelectOverride'], ['max_select_override', 'maxSelectOverride'], ['display_order', 'displayOrder']] as const) {
    if (input[key] === undefined) continue;
    if (key !== 'display_order' && input[key] === null) { if (target === 'minSelectOverride') data.minSelectOverride = null; else data.maxSelectOverride = null; continue; }
    const number = input[key];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 2147483647) throw new BrandingError(`${key} must be a nonnegative integer up to 2,147,483,647${key !== 'display_order' ? ', or null' : ''}.`);
    data[target] = number;
  }
  let allowedExternalOptionIds: string[] | null | undefined;
  if (input.allowed_external_option_ids !== undefined) {
    if (input.allowed_external_option_ids === null) allowedExternalOptionIds = null;
    else {
      if (!Array.isArray(input.allowed_external_option_ids)) throw new BrandingError('allowed_external_option_ids must be an array or null.');
      allowedExternalOptionIds = input.allowed_external_option_ids.map(id => text(id, 100, true));
      if (new Set(allowedExternalOptionIds).size !== allowedExternalOptionIds.length) throw new BrandingError('Duplicate allowed external option IDs.');
    }
  }
  const json = (key: 'conditions' | 'configuration') => {
    if (input[key] === undefined || input[key] === null) return input[key] as undefined | null;
    const value = object(input[key]);
    if (JSON.stringify(value).length > 30000) throw new BrandingError(`${key} is too large.`);
    if (key === 'conditions' && Object.hasOwn(value, 'allowedOptionIds')) throw new BrandingError('Use allowed_external_option_ids instead of internal conditions.allowedOptionIds.');
    return value;
  };
  return { externalItemId, externalGroupId, externalVariantId, data, allowedExternalOptionIds, conditions: json('conditions'), configuration: json('configuration') };
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return { success: true, message: 'Modifier links synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount, deactivated_count: counts.deactivatedCount, status: 1 };
}
const scopeKey = (item: string, group: string, variant: string | null) => JSON.stringify([item, group, variant]);
function jsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export async function syncPosModifierLinks(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true); authorizedStore = storeCode;
    if (!Array.isArray(body.modifier_links)) throw new BrandingError('modifier_links must be a JSON array.');
    if (!body.modifier_links.length) throw new BrandingError('Send at least one modifier link in modifier_links.');
    const links = body.modifier_links.map(posModifierLinkInput);
    const identities = links.map(link => scopeKey(link.externalItemId, link.externalGroupId, link.externalVariantId));
    if (new Set(identities).size !== identities.length) throw new BrandingError('Duplicate item/group/variant modifier links.');
    receivedCount = links.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType); await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const parents = await tx.menuItem.findMany({ where: { storeCode, externalItemId: { in: [...new Set(links.map(link => link.externalItemId))] } }, select: { id: true, externalItemId: true, sourceType: true, syncEnabled: true, archivedAt: true } });
      const groups = await tx.menuModifierGroup.findMany({ where: { storeCode, externalGroupId: { in: [...new Set(links.map(link => link.externalGroupId))] } }, select: { id: true, externalGroupId: true, sourceType: true, archivedAt: true, minSelect: true, maxSelect: true, selectionType: true } });
      const variants = await tx.menuItemVariant.findMany({ where: { storeCode, archivedAt: null, externalVariantId: { in: links.flatMap(link => link.externalVariantId ? [link.externalVariantId] : []) } }, select: { id: true, externalVariantId: true, menuItemId: true } });
      const options = await tx.menuModifierOption.findMany({ where: { storeCode, archivedAt: null, modifierGroupId: { in: groups.map(group => group.id) } }, select: { id: true, externalOptionId: true, modifierGroupId: true, isAvailable: true, isDefault: true } });
      const existing = await tx.menuItemModifierGroup.findMany({ where: { storeCode, archivedAt: null, menuItemId: { in: parents.map(item => item.id) }, modifierGroupId: { in: groups.map(group => group.id) } } });
      const parentMap = new Map(parents.map(parent => [parent.externalItemId, parent]));
      const groupMap = new Map(groups.map(group => [group.externalGroupId, group]));
      const variantMap = new Map(variants.map(variant => [variant.externalVariantId, variant]));
      const matches = new Map(existing.map(link => [scopeKey(link.menuItemId, link.modifierGroupId, link.variantId), link]));
      let insertedCount = 0;
      for (const link of links) {
        const parent = parentMap.get(link.externalItemId);
        if (!parent || parent.archivedAt) throw new BrandingError(`Item ${link.externalItemId} is missing or archived in this store.`, 409);
        if (parent.sourceType !== 'pos' || !parent.syncEnabled) throw new BrandingError(`Item ${link.externalItemId} is manual or has POS sync disabled.`, 409);
        const group = groupMap.get(link.externalGroupId);
        if (!group || group.archivedAt) throw new BrandingError(`Modifier group ${link.externalGroupId} is missing or archived in this store.`, 409);
        if (group.sourceType !== 'pos') throw new BrandingError(`Modifier group ${link.externalGroupId} is manual.`, 409);
        const variant = link.externalVariantId ? variantMap.get(link.externalVariantId) : null;
        if (link.externalVariantId && (!variant || variant.menuItemId !== parent.id)) throw new BrandingError(`Variant ${link.externalVariantId} is missing, archived, or does not belong to this item.`, 409);
        const variantId = variant?.id ?? null;
        const current = matches.get(scopeKey(parent.id, group.id, variantId));
        if (current && !isPosManagedMenuRecord('modifier-links', current)) throw new BrandingError('This item/group/variant link is manually managed and cannot be overwritten by POS.', 409);
        const data = { isRequiredOverride: current?.isRequiredOverride ?? null, minSelectOverride: current?.minSelectOverride ?? null, maxSelectOverride: current?.maxSelectOverride ?? null, ...link.data };
        const min = data.minSelectOverride ?? (data.isRequiredOverride === false ? 0 : data.isRequiredOverride === true ? Math.max(1, group.minSelect) : group.minSelect);
        const max = data.maxSelectOverride ?? group.maxSelect;
        if (min > max || group.selectionType === 'single' && max !== 1) throw new BrandingError('Selection overrides conflict with the modifier group.');
        if ((data.isRequiredOverride === true && min === 0) || (data.isRequiredOverride === false && min > 0)) throw new BrandingError('is_required_override conflicts with the effective minimum selections.');
        const conditions: Record<string, unknown> = { ...(link.conditions === undefined ? jsonObject(current?.conditions) : link.conditions ?? {}) };
        const groupOptions = options.filter(option => option.modifierGroupId === group.id);
        if (link.allowedExternalOptionIds === null) delete conditions.allowedOptionIds;
        else if (link.allowedExternalOptionIds !== undefined) {
          conditions.allowedOptionIds = link.allowedExternalOptionIds.map(externalId => {
            const option = groupOptions.find(option => option.externalOptionId === externalId);
            if (!option) throw new BrandingError(`Option ${externalId} is missing, archived, or belongs to another modifier group.`, 409);
            return option.id;
          });
        }
        const allowed = Array.isArray(conditions.allowedOptionIds) ? conditions.allowedOptionIds : null;
        const available = groupOptions.filter(option => option.isAvailable && (!allowed || allowed.includes(option.id)));
        if (min > available.length) throw new BrandingError(`Upload enough available options for group ${link.externalGroupId} before creating a required link.`, 409);
        if (available.filter(option => option.isDefault).length > max) throw new BrandingError('Selected default options exceed the effective maximum selections.', 409);
        const configuration = { ...(link.configuration === undefined ? jsonObject(current?.configuration) : link.configuration ?? {}), _posManaged: true } as Prisma.InputJsonObject;
        const saved = { ...data, configuration, conditions: Object.keys(conditions).length ? conditions as Prisma.InputJsonObject : Prisma.DbNull };
        if (current) await tx.menuItemModifierGroup.update({ where: { id: current.id }, data: saved, select: { id: true } });
        else { await tx.menuItemModifierGroup.create({ data: { ...saved, storeCode, menuItemId: parent.id, modifierGroupId: group.id, variantId }, select: { id: true } }); insertedCount++; }
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Modifier links synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
