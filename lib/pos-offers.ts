import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, imageUrl, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';
import { menuResources } from './menu-contract';

const syncType = 'MENU_OFFER';
export function posOfferInput(value: unknown) {
  const input = { ...object(value) };
  for (const key of ['offer_type', 'discount_value', 'max_discount', 'minimum_order', 'coupon_required', 'start_at', 'end_at', 'priority', 'is_stackable', 'usage_limit', 'per_customer_limit', 'applicable_channels', 'external_item_ids', 'external_category_ids', 'conditions', 'rewards', 'is_active', 'configuration']) {
    if (typeof input[key] === 'string' && !input[key].trim()) delete input[key];
  }
  if (['applicable_items', 'applicable_categories', 'id', 'source_type'].some(key => Object.hasOwn(input, key))) throw new BrandingError('Use external IDs; internal IDs and ownership are assigned by the server.');
  const data: Partial<Prisma.MenuOfferUncheckedCreateInput> & { externalOfferId: string; offerName: string } = {
    externalOfferId: text(input.external_offer_id, 100, true), offerName: text(input.offer_name, 200, true),
  };
  if (input.offer_type !== undefined) {
    if (!menuResources.offers.fields.find(field => field.key === 'offerType')!.choices!.includes(input.offer_type as string)) throw new BrandingError('Invalid offer_type.');
    data.offerType = input.offer_type as string;
  }
  for (const [key, target, max] of [['description', 'description', 10000], ['offer_code', 'offerCode', 100]] as const) {
    if (input[key] !== undefined) data[target] = input[key] === null ? null : text(input[key], max) || null;
  }
  for (const [key, target] of [['discount_value', 'discountValue'], ['max_discount', 'maxDiscount'], ['minimum_order', 'minimumOrder']] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null) { data[target] = null; continue; }
    const n = input[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 9999999999.99 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw new BrandingError(`${key} must be nonnegative with at most 2 decimal places (maximum 9,999,999,999.99).`);
    data[target] = n;
  }
  for (const [key, target] of [['priority', 'priority'], ['usage_limit', 'usageLimit'], ['per_customer_limit', 'perCustomerLimit']] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null && target !== 'priority') { data[target] = null; continue; }
    const number = input[key];
    if (typeof number !== 'number' || !Number.isInteger(number) || number < 0 || number > 2147483647) throw new BrandingError(`${key} must be a nonnegative integer up to 2,147,483,647.`);
    data[target] = number;
  }
  for (const [key, target] of [['coupon_required', 'couponRequired'], ['is_stackable', 'isStackable'], ['is_active', 'isActive']] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new BrandingError(`${key} must be boolean.`);
    data[target] = input[key];
  }
  for (const [key, target] of [['start_at', 'startAt'], ['end_at', 'endAt']] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null) { data[target] = null; continue; }
    const value = input[key];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(`${value.slice(0,10)}T00:00:00Z`).toISOString().slice(0,10) !== value.slice(0,10)) throw new BrandingError(`${key} must be an ISO timestamp with a timezone, or null.`);
    data[target] = new Date(value);
  }
  for (const key of ['conditions', 'rewards', 'configuration'] as const) {
    if (input[key] === undefined) continue;
    if (input[key] === null) { data[key] = Prisma.DbNull; continue; }
    const json = { ...object(input[key]) };
    if (key === 'configuration') validateConfiguration(json);
    if (JSON.stringify(json).length > 30000) throw new BrandingError(`${key} is too large.`);
    data[key] = json as Prisma.InputJsonObject;
  }
  if (input.applicable_channels !== undefined) {
    if (input.applicable_channels === null) data.applicableChannels = Prisma.DbNull;
    else {
      const channels = stringIds(input.applicable_channels, 'applicable_channels');
      if (channels.some(channel => !['website', 'app', 'pos', 'delivery', 'pickup', 'dine_in'].includes(channel))) throw new BrandingError('Invalid applicable_channels value.');
      data.applicableChannels = channels;
    }
  }
  return { data,
    itemIds: input.external_item_ids === undefined ? undefined : stringIds(input.external_item_ids, 'external_item_ids'),
    categoryIds: input.external_category_ids === undefined ? undefined : stringIds(input.external_category_ids, 'external_category_ids'),
  };
}
function stringIds(value: unknown, key: string) {
  if (value === null) return [];
  if (!Array.isArray(value)) throw new BrandingError(`${key} must be an array of external IDs or null.`);
  const ids = value.map(id => text(id, 100, true));
  if (new Set(ids).size !== ids.length) throw new BrandingError(`${key} contains duplicate values.`);
  return ids;
}
function validateConfiguration(json: Record<string, unknown>) {
  if (json.image !== undefined && json.image !== null) json.image = imageUrl(json.image);
  for (const key of ['website', 'app']) if (json[key] !== undefined && typeof json[key] !== 'boolean') throw new BrandingError(`configuration.${key} must be boolean.`);
  for (const key of ['buyQty', 'getQty', 'minItems']) if (json[key] !== undefined && (typeof json[key] !== 'number' || !Number.isInteger(json[key]) || Number(json[key]) < 1 || Number(json[key]) > 2147483647)) throw new BrandingError(`configuration.${key} must be a positive integer.`);
  if (json.customer !== undefined && !['All Customers', 'New Customers', 'Existing Customers'].includes(json.customer as string)) throw new BrandingError('Invalid configuration.customer.');
  if (json.scope !== undefined && !['All Items', 'Selected Items', 'Selected Categories'].includes(json.scope as string)) throw new BrandingError('Invalid configuration.scope.');
  if (json.days !== undefined && (!Array.isArray(json.days) || json.days.some(day => ![1,2,3,4,5,6,7,'Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(day)))) throw new BrandingError('configuration.days must contain weekdays 1–7 or Mon–Sun.');
  for (const key of ['startTime', 'endTime']) if (json[key] !== undefined && (typeof json[key] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(json[key]))) throw new BrandingError(`configuration.${key} must use HH:mm.`);
  if (!!json.startTime !== !!json.endTime) throw new BrandingError('Provide both configuration.startTime and configuration.endTime.');
  if (json.timezone !== undefined) { try { if (typeof json.timezone !== 'string' || !json.timezone) throw new Error(); new Intl.DateTimeFormat('en', { timeZone: json.timezone }); } catch { throw new BrandingError('Invalid configuration.timezone.'); } }
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return { success: true, message: 'Offers synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount, deactivated_count: counts.deactivatedCount, status: 1 };
}
export async function syncPosOffers(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (body.store_code !== undefined && body.store_code !== storeCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true); authorizedStore = storeCode;
    if (!Array.isArray(body.offers)) throw new BrandingError('offers must be a JSON array.');
    if (!body.offers.length) throw new BrandingError('Send at least one offer in offers.');
    const offers = body.offers.map(posOfferInput);
    const ids = offers.map(offer => offer.data.externalOfferId);
    if (new Set(ids).size !== ids.length) throw new BrandingError('Duplicate external offer IDs.');
    receivedCount = offers.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType); await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const existing = await tx.menuOffer.findMany({ where: { storeCode } });
      const matches = new Map(existing.map(offer => [offer.externalOfferId, offer]));
      const items = await tx.menuItem.findMany({ where: { storeCode, archivedAt: null }, select: { id: true, externalItemId: true } });
      const categories = await tx.menuCategory.findMany({ where: { storeCode, archivedAt: null }, select: { id: true, externalCategoryId: true } });
      const resolveTargets = (ids: string[] | undefined, rows: { id: string; externalId: string | null }[], key: string) => ids?.map(id => {
        const row = rows.find(row => row.externalId === id);
        if (!row) throw new BrandingError(`${key} ${id} is missing or archived in this store. Upload it first.`, 409);
        return row.id;
      });
      const claimedCodes = new Map<string, string>();
      let insertedCount = 0;
      for (const offer of offers) {
        const current = matches.get(offer.data.externalOfferId);
        if (current && (current.sourceType !== 'pos' || current.archivedAt)) throw new BrandingError(`Offer ${offer.data.externalOfferId} is manual or archived.`, 409);
        const offerType = offer.data.offerType ?? current?.offerType;
        if (!offerType) throw new BrandingError('offer_type is required when creating an offer.');
        const amount = offer.data.discountValue === undefined ? current?.discountValue : offer.data.discountValue;
        if (offerType === 'percentage' && (amount == null || Number(amount) > 100)) throw new BrandingError('Percentage discounts require discount_value between 0 and 100.');
        if (offerType === 'fixed' && amount == null) throw new BrandingError('Fixed discounts require discount_value.');
        const code = offer.data.offerCode === undefined ? current?.offerCode : offer.data.offerCode;
        if ((offer.data.couponRequired ?? current?.couponRequired ?? false) && !code) throw new BrandingError('offer_code is required when coupon_required is true.');
        if (code) {
          const normalized = code.toLowerCase();
          if (claimedCodes.has(normalized) || existing.some(row => row.id !== current?.id && row.offerCode?.toLowerCase() === normalized)) throw new BrandingError('offer_code is already used by another offer in this store.', 409);
          claimedCodes.set(normalized, offer.data.externalOfferId);
        }
        const start = offer.data.startAt === undefined ? current?.startAt : offer.data.startAt;
        const end = offer.data.endAt === undefined ? current?.endAt : offer.data.endAt;
        if (start && end && (start instanceof Date ? start.getTime() : Date.parse(start)) >= (end instanceof Date ? end.getTime() : Date.parse(end))) throw new BrandingError('end_at must be after start_at.');
        const itemIds = resolveTargets(offer.itemIds, items.map(row => ({ id: row.id, externalId: row.externalItemId })), 'Item');
        const categoryIds = resolveTargets(offer.categoryIds, categories.map(row => ({ id: row.id, externalId: row.externalCategoryId })), 'Category');
        const finalItems = itemIds ?? (Array.isArray(current?.applicableItems) ? current.applicableItems : []);
        const finalCategories = categoryIds ?? (Array.isArray(current?.applicableCategories) ? current.applicableCategories : []);
        const config = offer.data.configuration === Prisma.DbNull ? {} : offer.data.configuration ?? current?.configuration ?? {};
        const configuration = { ...object(config), scope: finalCategories.length ? 'Selected Categories' : finalItems.length ? 'Selected Items' : 'All Items' } as Prisma.InputJsonObject;
        const data = { ...offer.data, offerType, sourceType: 'pos', configuration,
          ...(itemIds === undefined ? {} : { applicableItems: itemIds }), ...(categoryIds === undefined ? {} : { applicableCategories: categoryIds }) };
        if (current) await tx.menuOffer.update({ where: { id: current.id }, data, select: { id: true } });
        else { await tx.menuOffer.create({ data: { applicableChannels: ['website'], ...data, storeCode }, select: { id: true } }); insertedCount++; }
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Offers synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
