import { randomUUID } from "node:crypto";
import { authorizePos } from "./pos-credentials";
import { brandingResponse, lockScope, withBrandingDb } from "./branding";
import {
  BrandingError,
  posMenuCategoryInput,
  heroInput,
  limitedJson,
  text,
} from "./branding-validation";
import { lockMenu } from "./menu-db";

type SyncCounts = {
  receivedCount: number;
  insertedCount: number;
  deactivatedCount: number;
};
function syncResponse(storeCode: string, syncType: string, counts: SyncCounts) {
  const summary = {
    received_count: counts.receivedCount,
    inserted_count: counts.insertedCount,
    updated_count: counts.receivedCount - counts.insertedCount,
    deactivated_count: counts.deactivatedCount,
  };
  return syncType === "HERO_BANNER"
    ? {
        success: true,
        message: "Hero banner synchronized successfully",
        store_code: storeCode,
        ...summary,
        data: { status: 1, source: "POS" },
      }
    : {
        success: true,
        message: "Categories synchronized successfully",
        store_code: storeCode,
        ...summary,
        status: 1,
      };
}
export async function syncPos(
  request: Request,
  syncType: "HERO_BANNER" | "CATEGORY",
  pathStoreCode: string,
) {
  // Keep menu sync replays separate from historical website-category requests.
  const logType = syncType === "CATEGORY" ? "MENU_CATEGORY" : syncType;
  let authorizedStore = "";
  let authorizedRequestId = "";
  let receivedCount = 0;
  try {
    const body = await limitedJson(request);
    const storeCode = text(pathStoreCode, 50, true);
    await authorizePos(request, storeCode);
    if (
      pathStoreCode &&
      body.store_code !== undefined &&
      body.store_code !== pathStoreCode
    )
      throw new BrandingError(
        "Body store_code does not match the API URL.",
        403,
      );
    const requestId = text(body.request_id, 100, true);
    authorizedStore = storeCode;
    authorizedRequestId = requestId;
    if ("banners" in body)
      throw new BrandingError("Send one banner object, not a banners array.");
    const hero =
      syncType === "HERO_BANNER" ? heroInput(body.banner, true) : null;
    if (
      syncType === "CATEGORY" &&
      (!Array.isArray(body.categories) ||
        !body.categories.length ||
        body.categories.length > 100)
    )
      throw new BrandingError("Send between 1 and 100 categories.");
    const categories =
      syncType === "CATEGORY"
        ? (body.categories as unknown[]).map(posMenuCategoryInput)
        : [];
    const externalIds = categories
      .map((c) => c.externalCategoryId)
      .filter(Boolean);
    if (new Set(externalIds).size !== externalIds.length)
      throw new BrandingError("Duplicate external category IDs.");
    receivedCount = hero ? 1 : categories.length;
    const response = await withBrandingDb((db) =>
      db.$transaction(
        async (tx) => {
          await lockScope(tx, storeCode, logType);
          if (syncType === "CATEGORY") await lockMenu(tx, storeCode);
          const stores = await tx.store.findMany({
            where: {
              store_code: storeCode,
              is_active: true,
              OR: [{ is_delete: false }, { is_delete: null }],
            },
          });
          if (stores.length !== 1)
            throw new BrandingError("Store unavailable or ambiguous.", 403);
          const previous = await tx.posSyncLog.findUnique({
            where: {
              storeCode_syncType_requestId: {
                storeCode,
                syncType: logType,
                requestId,
              },
            },
          });
          if (previous?.syncStatus === "SUCCESS")
            return {
              result: syncResponse(storeCode, syncType, previous),
              replayed: true,
            };
          const syncBatchId = randomUUID();
          let deactivatedCount = 0;
          let insertedCount = 0;
          if (hero) {
            // Historical duplicates can exist from earlier full-replacement syncs.
            // Prefer the active match, otherwise reuse the most recent inactive row.
            const existing = hero.externalBannerId
              ? await tx.heroBanner.findFirst({
                  where: { storeCode, externalBannerId: hero.externalBannerId },
                  orderBy: [
                    { status: "desc" },
                    { updatedAt: "desc" },
                    { id: "asc" },
                  ],
                })
              : null;
            deactivatedCount = (
              await tx.heroBanner.updateMany({
                where: {
                  storeCode,
                  status: 1,
                  ...(existing ? { id: { not: existing.id } } : {}),
                },
                data: { status: 0, updatedBy: null },
              })
            ).count;
            if (existing) {
              await tx.heroBanner.update({
                where: { id: existing.id },
                data: {
                  ...hero,
                  status: 1,
                  source: "POS",
                  syncBatchId,
                  updatedBy: null,
                },
              });
            } else {
              await tx.heroBanner.create({
                data: { storeCode, ...hero, source: "POS", syncBatchId },
              });
              insertedCount = 1;
            }
          } else {
            const candidates = await tx.menuCategory.findMany({
              where: {
                storeCode,
                externalCategoryId: { in: externalIds as string[] },
              },
            });
            const matches = new Map(
              candidates.map((candidate) => [
                candidate.externalCategoryId,
                candidate,
              ]),
            );
            // Category sync is incremental: only incoming items are written.
            // Manual, archived and sync-disabled records must not be taken over.
            for (const category of categories) {
              const existing = matches.get(category.externalCategoryId);
              if (
                existing &&
                (existing.sourceType !== "pos" ||
                  !existing.syncEnabled ||
                  existing.archivedAt)
              ) {
                throw new BrandingError(
                  `Category ${category.externalCategoryId} is manual, archived, or has POS sync disabled.`,
                  409,
                );
              }
              const data = {
                ...category,
                sourceType: "pos",
                syncEnabled: true,
                lastSyncedAt: new Date(),
              };
              if (existing) {
                await tx.menuCategory.update({
                  where: { id: existing.id },
                  data,
                });
              } else {
                await tx.menuCategory.create({ data: { storeCode, ...data } });
                insertedCount++;
              }
            }
          }
          await tx.posSyncLog.upsert({
            where: {
              storeCode_syncType_requestId: {
                storeCode,
                syncType: logType,
                requestId,
              },
            },
            create: {
              storeCode,
              syncType: logType,
              requestId,
              syncBatchId,
              receivedCount,
              insertedCount,
              deactivatedCount,
              syncStatus: "SUCCESS",
            },
            update: {
              syncBatchId,
              receivedCount,
              insertedCount,
              deactivatedCount,
              syncStatus: "SUCCESS",
              errorMessage: null,
            },
          });
          return {
            result: syncResponse(storeCode, syncType, {
              receivedCount,
              insertedCount,
              deactivatedCount,
            }),
            replayed: false,
          };
        },
        { timeout: 15000 },
      ),
    );
    return Response.json(response.result, {
      headers: {
        "Cache-Control": "no-store",
        "X-POS-Request-Id": encodeURIComponent(requestId),
        "X-POS-Replayed": String(response.replayed),
      },
    });
  } catch (error) {
    if (authorizedStore) {
      // Log only after the data transaction rolls back, under the same store lock.
      // A late failing retry must never overwrite a successful idempotency record.
      try {
        await withBrandingDb((db) =>
          db.$transaction(async (tx) => {
            await lockScope(tx, authorizedStore, logType);
            const key = {
              storeCode: authorizedStore,
              syncType: logType,
              requestId: authorizedRequestId,
            };
            const previous = await tx.posSyncLog.findUnique({
              where: { storeCode_syncType_requestId: key },
            });
            if (previous?.syncStatus === "SUCCESS") return;
            const data = {
              syncBatchId: randomUUID(),
              receivedCount,
              insertedCount: 0,
              deactivatedCount: 0,
              syncStatus: "FAILED",
              errorMessage:
                error instanceof BrandingError
                  ? error.message
                  : "Synchronization transaction failed.",
            };
            await tx.posSyncLog.upsert({
              where: { storeCode_syncType_requestId: key },
              create: { ...key, ...data },
              update: data,
            });
          }),
        );
      } catch {
        /* Database may be unavailable. */
      }
    }
    return brandingResponse(error);
  }
}
