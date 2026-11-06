import { adminContext, brandingResponse, lockScope, ok, snapshot, withBrandingDb } from './branding';
import { BrandingError, brandingInput, categoryInput, heroInput, limitedJson, object, text } from './branding-validation';

export async function brandingAdmin(request: Request, resource: 'branding' | 'hero' | 'categories' | 'workspace', id?: string) {
  try {
    const { storeCode, adminId } = await adminContext(request);
    if (request.method === 'GET') return ok(await withBrandingDb(db => snapshot(db, storeCode)));
    const body = request.method === 'DELETE' ? {} : await limitedJson(request);
    // Validate the complete payload before entering a write transaction.
    const brand = resource === 'branding' || (resource === 'workspace' && body.section === 'Branding') ? brandingInput(body.branding ?? body) : null;
    const hero = resource === 'hero' || (resource === 'workspace' && body.section === 'Branding') ? heroInput(body.hero ?? body) : null;
    const batch = resource === 'workspace' && body.section === 'Categories';
    if (resource === 'workspace' && !brand && !batch) throw new BrandingError('Invalid workspace section.');
    const incoming = batch ? body.categories : null;
    if (batch && (!Array.isArray(incoming) || incoming.length > 100)) throw new BrandingError('Expected at most 100 categories.');
    const categories = Array.isArray(incoming) ? incoming.map(value => {
      const c = object(value);
      return { id: text(c.id, 100, true), data: categoryInput(c) };
    }) : [];
    if (new Set(categories.map(c => c.id)).size !== categories.length) throw new BrandingError('Duplicate category IDs.');
    const removed = batch ? body.removedIds : [];
    if (!Array.isArray(removed) || removed.some(value => typeof value !== 'string') || removed.length > 100) throw new BrandingError('Invalid removed category IDs.');
    if (removed.some(id => categories.some(c => c.id === id))) throw new BrandingError('A category cannot be updated and removed together.');
    const category = resource === 'categories' && request.method !== 'DELETE' ? categoryInput(body) : null;
    const result = await withBrandingDb(db => db.$transaction(async tx => {
      if (brand || hero) await lockScope(tx, storeCode, 'HERO_BANNER');
      if (batch || resource === 'categories') await lockScope(tx, storeCode, 'CATEGORY');
      if (brand) await tx.websiteBranding.upsert({ where: { storeCode }, create: { storeCode, ...brand, createdBy: adminId, updatedBy: adminId }, update: { ...brand, updatedBy: adminId } });
      if (hero) {
        const current = await tx.heroBanner.findFirst({ where: { storeCode, status: 1 } });
        if (resource === 'workspace' && (body.heroId ?? null) !== (current?.id ?? null)) throw new BrandingError('The active banner changed. Reload before saving.', 409);
        if (resource === 'hero' && request.method === 'POST') {
          await tx.heroBanner.updateMany({ where: { storeCode, status: 1 }, data: { status: 0, updatedBy: adminId } });
          await tx.heroBanner.create({ data: { storeCode, ...hero, source: 'ADMIN', createdBy: adminId, updatedBy: adminId } });
        } else if (current) {
          if ((id && current.id !== id) || (body.heroId && current.id !== body.heroId)) throw new BrandingError('The active banner changed. Reload before saving.', 409);
          await tx.heroBanner.update({ where: { id: current.id }, data: { ...hero, source: 'ADMIN', updatedBy: adminId } });
        } else {
          if (id || body.heroId) throw new BrandingError('Banner no longer active.', 409);
          await tx.heroBanner.create({ data: { storeCode, ...hero, createdBy: adminId, updatedBy: adminId } });
        }
      }
      async function updateCategory(categoryId: string, data: ReturnType<typeof categoryInput> | { status: number }) {
        const result = await tx.websiteCategory.updateMany({ where: { id: categoryId, storeCode, status: 1 }, data: { ...data, updatedBy: adminId } });
        if (result.count !== 1) throw new BrandingError('Category changed or is unavailable. Reload before saving.', 409);
      }
      if (batch) {
        for (const c of categories) {
          if (c.id.startsWith('new-')) await tx.websiteCategory.create({ data: { storeCode, ...c.data, source: 'ADMIN', createdBy: adminId, updatedBy: adminId } });
          else await updateCategory(c.id, c.data);
        }
        for (const categoryId of removed as string[]) await updateCategory(categoryId, { status: 0 });
      }
      if (resource === 'categories') {
        if (request.method === 'DELETE' && id) await updateCategory(id, { status: 0 });
        else if (id && category) await updateCategory(id, category);
        else if (category) await tx.websiteCategory.create({ data: { storeCode, ...category, source: 'ADMIN', createdBy: adminId, updatedBy: adminId } });
      }
      return snapshot(tx, storeCode);
    }, { timeout: 15000 }));
    return ok(result, request.method === 'POST' ? 201 : 200);
  } catch (error) { return brandingResponse(error); }
}
