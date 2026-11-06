import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { authorizePos } from './pos-credentials';
import { brandingResponse, lockScope, withBrandingDb } from './branding';
import { BrandingError, limitedJson, object, text } from './branding-validation';
import { lockMenu } from './menu-db';

const syncType = 'MENU_TAX_RULE';
export function posTaxRuleInput(value: unknown) {
  const input = object(value);
  const externalTaxId = text(input.external_tax_id, 100, true);
  const name = text(input.name, 150, true);
  const ratePercent = input.rate_percent;
  if (typeof ratePercent !== 'number' || !Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100 || Math.abs(ratePercent * 10000 - Math.round(ratePercent * 10000)) > 0.000001) {
    throw new BrandingError('rate_percent must be a number from 0 to 100 with at most 4 decimal places.');
  }
  for (const field of ['price_includes_tax', 'is_active']) {
    if (input[field] !== undefined && typeof input[field] !== 'boolean') throw new BrandingError(`${field} must be boolean.`);
  }
  if (input.configuration !== undefined && input.configuration !== null) {
    object(input.configuration);
    if (JSON.stringify(input.configuration).length > 30000) throw new BrandingError('configuration is too large.');
  }
  return {
    externalTaxId, name, ratePercent,
    ...(input.price_includes_tax === undefined ? {} : { priceIncludesTax: input.price_includes_tax as boolean }),
    ...(input.is_active === undefined ? {} : { isActive: input.is_active as boolean }),
    ...(input.configuration === undefined ? {} : { configuration: input.configuration === null ? Prisma.DbNull : input.configuration as Prisma.InputJsonObject }),
  };
}
type Counts = { receivedCount: number; insertedCount: number; deactivatedCount: number };
function result(storeCode: string, counts: Counts) {
  return {
    success: true, message: 'Tax rules synchronized successfully', store_code: storeCode,
    received_count: counts.receivedCount, inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount,
    deactivated_count: counts.deactivatedCount, status: 1,
  };
}
export async function syncPosTaxRules(request: Request, pathStoreCode: string) {
  let authorizedStore = ''; let requestId = ''; let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (pathStoreCode && body.store_code !== undefined && body.store_code !== pathStoreCode) throw new BrandingError('Body store_code does not match the API URL.', 403);
    requestId = text(body.request_id, 100, true);
    authorizedStore = storeCode;
    if (!Array.isArray(body.tax_rules)) throw new BrandingError('tax_rules must be a JSON array.');
    if (!body.tax_rules.length) throw new BrandingError('Send at least one tax rule in tax_rules.');
    const rules = body.tax_rules.map(posTaxRuleInput);
    const externalIds = rules.map(rule => rule.externalTaxId);
    if (new Set(externalIds).size !== externalIds.length) throw new BrandingError('Duplicate external tax IDs.');
    receivedCount = rules.length;
    const response = await withBrandingDb(db => db.$transaction(async tx => {
      await lockScope(tx, storeCode, syncType);
      await lockMenu(tx, storeCode);
      const stores = await tx.store.findMany({ where: { store_code: storeCode, is_active: true, OR: [{ is_delete: false }, { is_delete: null }] } });
      if (stores.length !== 1) throw new BrandingError('Store unavailable or ambiguous.', 403);
      const key = { storeCode, syncType, requestId };
      const previous = await tx.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: key } });
      if (previous?.syncStatus === 'SUCCESS') return { body: result(storeCode, previous), replayed: true };
      const existing = await tx.menuTaxRule.findMany({
        where: { storeCode, externalTaxId: { in: externalIds } },
        select: { id: true, externalTaxId: true, sourceType: true, archivedAt: true },
      });
      const matches = new Map(existing.map(rule => [rule.externalTaxId, rule]));
      let insertedCount = 0;
      for (const rule of rules) {
        const current = matches.get(rule.externalTaxId);
        if (current && (current.sourceType !== 'pos' || current.archivedAt)) throw new BrandingError(`Tax rule ${rule.externalTaxId} is manual or archived.`, 409);
        const data = { ...rule, sourceType: 'pos' };
        if (current) await tx.menuTaxRule.update({ where: { id: current.id }, data, select: { id: true } });
        else { await tx.menuTaxRule.create({ data: { storeCode, ...data }, select: { id: true } }); insertedCount++; }
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
          const log = { syncBatchId: randomUUID(), receivedCount, insertedCount: 0, deactivatedCount: 0, syncStatus: 'FAILED', errorMessage: error instanceof BrandingError ? error.message : 'Tax rules synchronization transaction failed.' };
          await tx.posSyncLog.upsert({ where: { storeCode_syncType_requestId: key }, create: { ...key, ...log }, update: log });
        }));
      } catch { /* The database may be unavailable or awaiting migration. */ }
    }
    return brandingResponse(error);
  }
}
