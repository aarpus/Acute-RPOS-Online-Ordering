import { Prisma } from '@prisma/client';
import { createPrismaClient } from './prisma';
import { getAuthenticatedAdmin } from './admin-auth';
import { getTrustedStoreContext } from './admin-stores';
import { sameOrigin } from './auth';
import { BrandingError, text } from './branding-validation';

export type BrandingTx = Prisma.TransactionClient;
export async function lockScope(tx: BrandingTx, storeCode: string, scope: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`website:${scope}:${storeCode}`}, 0))::text`;
}
export async function withBrandingDb<T>(action: (db: ReturnType<typeof createPrismaClient>) => Promise<T>) {
  const db = createPrismaClient();
  try { return await action(db); } finally { await db.$disconnect(); }
}
export async function adminContext(request: Request) {
  if (request.method !== 'GET' && !sameOrigin(request)) throw new BrandingError('Invalid origin.', 403);
  const admin = await getAuthenticatedAdmin(request);
  if (!admin) throw new BrandingError('Authentication required.', 401);
  const storeCode = text(new URL(request.url).searchParams.get('store_code') ?? admin.storeCode, 50, true);
  const { companyCode } = getTrustedStoreContext(admin);
  await withBrandingDb(async db => {
    const matches = await db.store.findMany({ where: { store_code: storeCode, OR: [{ is_delete: false }, { is_delete: null }] } });
    if (matches.length !== 1 || matches[0].company_code !== companyCode) throw new BrandingError('Store access denied or store code is ambiguous.', 403);
  });
  return { storeCode, adminId: admin.id };
}
export async function snapshot(tx: BrandingTx, storeCode: string) {
  const [branding, hero, categories] = await Promise.all([
    tx.websiteBranding.findUnique({ where: { storeCode } }),
    tx.heroBanner.findFirst({ where: { storeCode, status: 1 } }),
    tx.websiteCategory.findMany({ where: { storeCode, status: 1 }, orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] }),
  ]);
  return { branding, hero, categories };
}
export function brandingResponse(error: unknown) {
  const known = error instanceof BrandingError;
  if (!known) console.error('Branding request failed:', error);
  return Response.json({ success: false, error: known ? error.message : 'Unable to process branding request.' }, { status: known ? error.status : 500, headers: { 'Cache-Control': 'no-store' } });
}
export function ok(data: unknown, status = 200) { return Response.json({ success: true, data }, { status, headers: { 'Cache-Control': 'no-store' } }); }
