import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { menuResources } from './menu-contract';
import { assertMenuCreateAccess } from './menu-create-access';
import { MenuError, object, uuidPattern, validateMenuInput, windowsOverlap } from './menu-validation';

type Row = Record<string, unknown> & { id: string; updatedAt: Date; sourceType?: unknown; configuration?: unknown };
type Delegate = {
  findMany(args: Record<string, unknown>): Promise<Row[]>;
  findFirst(args: Record<string, unknown>): Promise<Row | null>;
  create(args: Record<string, unknown>): Promise<Row>;
  update(args: Record<string, unknown>): Promise<Row>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  createMany(args: Record<string, unknown>): Promise<{ count: number }>;
};
export type MenuDb = Prisma.TransactionClient;
export function isPosManagedMenuRecord(resource: string, row: { sourceType?: unknown; configuration?: unknown }) {
  const configuration = row.configuration as { _posManaged?: unknown } | null;
  return row.sourceType === 'pos' || resource === 'modifier-links' && configuration?._posManaged === true;
}
function table(db: MenuDb, resource: string) {
  const spec = menuResources[resource];
  if (!spec) throw new MenuError('Unknown menu resource.', 404);
  return (db as unknown as Record<string, Delegate>)[spec.model];
}
export const itemChildren: Record<string, string> = { variants: 'menuItemId', images: 'menuItemId', inventory: 'menuItemId', schedules: 'menuItemId', pricing: 'menuItemId', 'modifier-links': 'menuItemId', 'combo-groups': 'comboItemId', 'seo-meta': 'targetId' };
export function childScopes(resource: string) {
  return resource === 'items' || resource === 'combo-items' ? itemChildren : resource === 'modifier-groups' ? { 'modifier-options': 'modifierGroupId' } : resource === 'combo-groups' ? { 'combo-options': 'comboGroupId' } : {};
}
function resourceWhere(resource: string) { return resource === 'combo-items' ? { itemType: 'combo' } : {}; }
export async function menuRows(db: MenuDb, storeCode: string, resource: string) {
  const rows = await table(db, resource).findMany({ where: { storeCode, archivedAt: null, ...resourceWhere(resource) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  if (resource === 'items' || resource === 'combo-items') {
    const links = await db.menuItemCategory.findMany({ where: { storeCode }, select: { menuItemId: true, categoryId: true } });
    for (const row of rows) row.categoryIds = links.filter(link => link.menuItemId === row.id).map(link => link.categoryId);
  }
  return rows;
}
export async function menuSnapshot(db: MenuDb, storeCode: string) {
  const entries = await Promise.all(Object.keys(menuResources).filter(key => key !== 'combo-items').map(async key => [key, await menuRows(db, storeCode, key)] as const));
  const result = Object.fromEntries(entries);
  result['combo-items'] = result.items.filter(row => row.itemType === 'combo');
  return result;
}
export async function lockMenu(db: MenuDb, storeCode: string) {
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`menu:${storeCode}`}, 0))::text`;
}
async function requireRow(db: MenuDb, storeCode: string, resource: string, id: unknown) {
  if (typeof id !== 'string' || !uuidPattern.test(id)) throw new MenuError('Invalid record ID.');
  const row = await table(db, resource).findFirst({ where: { id, storeCode, archivedAt: null, ...resourceWhere(resource) } });
  if (!row) throw new MenuError(`${menuResources[resource].label} record is unavailable in this store.`, 404);
  return row;
}
export async function menuRecordVersion(db: MenuDb, storeCode: string, resource: string, id: string) {
  return (await requireRow(db, storeCode, resource, id)).updatedAt.toISOString();
}
function assertVersion(current: Row, expected: unknown) {
  if (typeof expected !== 'string' || expected !== current.updatedAt.toISOString()) throw new MenuError('This record changed. Reload before saving.', 409);
}
function nextTimestamp(current?: Row) { return new Date(Math.max(Date.now(), current ? current.updatedAt.getTime() + 1 : 0)); }
async function checkReferences(db: MenuDb, storeCode: string, resource: string, data: Record<string, unknown>) {
  for (const field of menuResources[resource].fields) {
    const value = data[field.key];
    if (!field.resource || value == null) continue;
    for (const id of Array.isArray(value) ? value : [value]) await requireRow(db, storeCode, field.resource, id);
  }
  if (data.variantId) {
    const variant = await requireRow(db, storeCode, 'variants', data.variantId);
    if (variant.menuItemId !== data.menuItemId) throw new MenuError('The variant belongs to a different item.');
  }
  if (resource === 'seo-meta' && data.targetType !== 'page') await requireRow(db, storeCode, data.targetType === 'item' ? 'items' : 'categories', data.targetId);
  if (resource === 'combo-options') {
    const group = await requireRow(db, storeCode, 'combo-groups', data.comboGroupId);
    if (group.comboItemId === data.componentItemId) throw new MenuError('A combo cannot contain itself.');
    // Avoid recursive combo cycles; components are regular menu items in this release.
    const component = await requireRow(db, storeCode, 'items', data.componentItemId);
    if (component.itemType === 'combo') throw new MenuError('Choose a regular item as the combo component.');
  }
}
async function checkRules(db: MenuDb, storeCode: string, resource: string, data: Record<string, unknown>, id: string) {
  if (resource === 'modifier-links') {
    const group = await requireRow(db, storeCode, 'modifier-groups', data.modifierGroupId);
    const min = Number(data.minSelectOverride ?? (data.isRequiredOverride === false ? 0 : data.isRequiredOverride === true ? Math.max(1, Number(group.minSelect)) : group.minSelect));
    const max = Number(data.maxSelectOverride ?? group.maxSelect);
    if (min > max || (group.selectionType === 'single' && max !== 1)) throw new MenuError('Selection overrides conflict with the modifier group.');
    const available = await db.menuModifierOption.count({ where: { storeCode, modifierGroupId: group.id, archivedAt: null, isAvailable: true } });
    if (min > available) throw new MenuError('Add enough available modifier options before requiring this group.');
  }
  if (resource === 'variants') {
    const duplicate = await db.menuItemVariant.findFirst({ where: { storeCode, menuItemId: String(data.menuItemId), archivedAt: null, id: { not: id }, name: { equals: String(data.name), mode: 'insensitive' } } });
    if (duplicate) throw new MenuError('This item already has a variant with that name.', 409);
  }
  if (resource === 'pricing' && data.isActive) {
    const rows = await db.menuItemPrice.findMany({ where: { storeCode, menuItemId: String(data.menuItemId), variantId: data.variantId as string | null, archivedAt: null, isActive: true, currency: String(data.currency), priority: Number(data.priority), id: { not: id } } });
    // Different applicable price types can both match an online order.
    for (const row of rows) {
      const disjointModes = ['pickup', 'delivery', 'dine_in'].includes(row.priceType) && ['pickup', 'delivery', 'dine_in'].includes(String(data.priceType)) && row.priceType !== data.priceType;
      if (!disjointModes && windowsOverlap(row, data)) throw new MenuError('An active price overlaps at the same priority. Change the window or priority.', 409);
    }
  }
}
async function touchParent(db: MenuDb, storeCode: string, resource: string, row: Row) {
  let itemId = row.menuItemId ?? row.comboItemId;
  if (resource === 'combo-options') itemId = (await requireRow(db, storeCode, 'combo-groups', row.comboGroupId)).comboItemId;
  if (resource === 'seo-meta' && row.targetType === 'item') itemId = row.targetId;
  if (itemId) {
    const item = await requireRow(db, storeCode, 'items', itemId);
    await db.menuItem.update({ where: { id: item.id }, data: { updatedAt: nextTimestamp(item) } });
  }
  if (resource === 'modifier-options') {
    const group = await requireRow(db, storeCode, 'modifier-groups', row.modifierGroupId);
    await db.menuModifierGroup.update({ where: { id: group.id }, data: { updatedAt: nextTimestamp(group) } });
  }
}

// Caller holds the store lock and a transaction. Nested records share its commit/rollback.
export async function saveMenuRecord(db: MenuDb, storeCode: string, adminId: string, resource: string, input: Record<string, unknown>, id?: string, depth = 0): Promise<Row> {
  if (depth > 3) throw new MenuError('Nested menu data is too deep.');
  if (!id) await assertMenuCreateAccess(db, storeCode, [resource]);
  const current = id ? await requireRow(db, storeCode, resource, id) : undefined;
  if (current) assertVersion(current, input.updatedAt);
  if (current && isPosManagedMenuRecord(resource, current)) throw new MenuError('POS-owned records cannot be changed by manual entry.', 409);
  const existing = current ? { ...current } : undefined;
  if (current && (resource === 'items' || resource === 'combo-items')) existing!.categoryIds = (await db.menuItemCategory.findMany({ where: { storeCode, menuItemId: current.id } })).map(link => link.categoryId);
  const data = validateMenuInput(resource, input, existing);
  if (resource === 'combo-options' && Object.hasOwn(input, 'extraPrice')) {
    const useItemPrice = data.extraPrice === null;
    if (useItemPrice) data.extraPrice = 0;
    data.configuration = { ...(data.configuration as Record<string, unknown> | null), useItemPrice };
  }
  const recordId = id ?? randomUUID();
  if (data.itemType === 'regular' && current?.itemType === 'combo' && await db.menuComboGroup.count({ where: { storeCode, comboItemId: recordId, archivedAt: null } })) throw new MenuError('Archive the combo groups before changing this to a regular item.', 409);
  await checkReferences(db, storeCode, resource, data);
  await checkRules(db, storeCode, resource, data, recordId);
  // Defaults/primary selections are unique per item, including archived history.
  if (resource === 'variants' && data.isDefault) await db.menuItemVariant.updateMany({ where: { storeCode, menuItemId: String(data.menuItemId), id: { not: recordId }, isDefault: true }, data: { isDefault: false } });
  if (resource === 'images' && data.isPrimary && data.isActive) await db.menuItemImage.updateMany({ where: { storeCode, menuItemId: String(data.menuItemId), id: { not: recordId }, isPrimary: true }, data: { isPrimary: false } });
  const categories = data.categoryIds;
  delete data.categoryIds;
  for (const field of menuResources[resource].fields) if (field.kind === 'json' && data[field.key] === null) data[field.key] = Prisma.DbNull;
  const now = nextTimestamp(current);
  data.updatedAt = now;
  if (resource === 'items' || resource === 'combo-items') { data.updatedBy = adminId; if (!current) data.createdBy = adminId; }
  if (resource === 'variants') data.inventoryQuantity = null;
  const row = current ? await table(db, resource).update({ where: { id: recordId }, data }) : await table(db, resource).create({ data: { ...data, id: recordId, storeCode } });
  if (Array.isArray(categories)) {
    await db.menuItemCategory.deleteMany({ where: { storeCode, menuItemId: recordId } });
    if (categories.length) await db.menuItemCategory.createMany({ data: categories.map((categoryId, displayOrder) => ({ storeCode, menuItemId: recordId, categoryId, displayOrder })) });
  }
  if (input.children !== undefined) {
    const children = object(input.children);
    const scopes = childScopes(resource);
    const copiedVariants = new Map<string, string>();
    for (const [childResource, value] of Object.entries(children).sort(([a], [b]) => a === 'variants' ? -1 : b === 'variants' ? 1 : 0)) {
      const parentKey = scopes[childResource];
      if (!parentKey || !Array.isArray(value) || value.length > 200) throw new MenuError('Invalid nested menu records.');
      const old = await table(db, childResource).findMany({ where: { storeCode, [parentKey]: recordId, archivedAt: null, ...(childResource === 'seo-meta' ? { targetType: 'item' } : {}) } });
      const incoming = value.map(object);
      const ids = incoming.filter(child => child.id).map(child => child.id);
      if (new Set(ids).size !== ids.length) throw new MenuError('Duplicate child IDs.');
      for (const child of incoming) if (child.id && !old.some(row => row.id === child.id)) throw new MenuError('Nested record belongs to another parent.', 403);
      for (const child of incoming) if (child.id) assertVersion(old.find(row => row.id === child.id)!, child.updatedAt);
      if (childResource === 'variants' && incoming.filter(child => child.isDefault).length > 1) throw new MenuError('Choose only one default variant.');
      if (childResource === 'images' && incoming.filter(child => child.isPrimary && child.isActive).length > 1) throw new MenuError('Choose only one primary image.');
      // Remove before inserting, so partial unique indexes permit replacement.
      for (const child of old.filter(child => !ids.includes(child.id))) await archiveMenuRecord(db, storeCode, childResource, child.id, child.updatedAt.toISOString());
      for (const child of incoming) {
        const fresh = child.id ? await requireRow(db, storeCode, childResource, child.id) : undefined;
        const saved = await saveMenuRecord(db, storeCode, adminId, childResource, { ...child, [parentKey]: recordId, ...(typeof child.variantId === 'string' && copiedVariants.has(child.variantId) ? { variantId: copiedVariants.get(child.variantId) } : {}), ...(fresh ? { updatedAt: fresh.updatedAt.toISOString() } : {}), ...(childResource === 'seo-meta' ? { targetType: 'item' } : {}) }, typeof child.id === 'string' ? child.id : undefined, depth + 1);
        if (childResource === 'variants' && typeof child._copyFrom === 'string') copiedVariants.set(child._copyFrom, saved.id);
      }
    }
  }
  await touchParent(db, storeCode, resource, row);
  return (await table(db, resource).findFirst({ where: { id: recordId, storeCode } }))!;
}

export async function archiveMenuRecord(db: MenuDb, storeCode: string, resource: string, id: string, expected: unknown) {
  const row = await requireRow(db, storeCode, resource, id);
  assertVersion(row, expected);
  if (isPosManagedMenuRecord(resource, row)) throw new MenuError('POS-owned records cannot be archived manually.', 409);
  const dependency = async (model: string, key: string, message: string) => {
    if (await table(db, model).findFirst({ where: { storeCode, [key]: id, archivedAt: null } })) throw new MenuError(message, 409);
  };
  if (resource === 'categories') {
    if (await db.menuItemCategory.count({ where: { storeCode, categoryId: id, item: { archivedAt: null } } })) throw new MenuError('Unlink this category from its items first.', 409);
  }
  if (resource === 'tax-rules') await dependency('items', 'taxRuleId', 'Reassign this tax rule on its items first.');
  if (resource === 'modifier-groups') await dependency('modifier-links', 'modifierGroupId', 'Unlink this modifier group from its items first.');
  if (resource === 'variants') {
    for (const r of ['inventory', 'pricing', 'modifier-links']) await dependency(r, 'variantId', `Remove variant ${menuResources[r].label.toLowerCase()} first.`);
  }
  if (resource === 'items' || resource === 'combo-items') {
    await dependency('combo-options', 'componentItemId', 'Remove this item from combo options first.');
    await dependency('modifier-options', 'linkedItemId', 'Unlink this item from modifier options first.');
  }
  // Offers hold JSON targets; reject dangling targets rather than silently changing eligibility.
  if (resource === 'items' || resource === 'combo-items' || resource === 'categories') {
    const offers = await db.menuOffer.findMany({ where: { storeCode, archivedAt: null } });
    if (offers.some(offer => { const targets = resource === 'categories' ? offer.applicableCategories : offer.applicableItems; return Array.isArray(targets) && targets.includes(id); })) throw new MenuError('Remove this target from its offers first.', 409);
  }
  const data: Record<string, unknown> = { archivedAt: new Date(), updatedAt: nextTimestamp(row) };
  if ('isDefault' in row) data.isDefault = false;
  if ('isPrimary' in row) data.isPrimary = false;
  if ('isActive' in row) data.isActive = false;
  if ('isAvailable' in row) data.isAvailable = false;
  if ('isVisible' in row) data.isVisible = false;
  // Archive owned children without deleting history or leaving visible orphan rows.
  for (const [childResource, parentKey] of Object.entries(childScopes(resource))) {
    const childData: Record<string, unknown> = { archivedAt: new Date(), updatedAt: new Date() };
    if (childResource === 'variants') { childData.isDefault = false; childData.isAvailable = false; }
    if (childResource === 'images') { childData.isPrimary = false; childData.isActive = false; }
    if (['pricing', 'schedules', 'seo-meta'].includes(childResource)) childData.isActive = false;
    const childRows = await table(db, childResource).findMany({ where: { storeCode, [parentKey]: id, archivedAt: null, ...(childResource === 'seo-meta' ? { targetType: 'item' } : {}) } });
    if (childResource === 'combo-groups') for (const group of childRows) await db.menuComboOption.updateMany({ where: { storeCode, comboGroupId: group.id, archivedAt: null }, data: { archivedAt: new Date(), isAvailable: false } });
    await table(db, childResource).updateMany({ where: { storeCode, id: { in: childRows.map(row => row.id) } }, data: childData });
  }
  if (resource === 'categories') await db.menuSeo.updateMany({ where: { storeCode, targetType: 'category', targetId: id, archivedAt: null }, data: { archivedAt: new Date(), isActive: false } });
  await table(db, resource).update({ where: { id }, data });
  await touchParent(db, storeCode, resource, row);
}

export function menuFailure(error: unknown) {
  if (error instanceof MenuError) return Response.json({ success: false, error: error.message }, { status: error.status });
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  if (code === 'P2002') {
    const meta = (error as { meta?: { target?: unknown } }).meta;
    const target = JSON.stringify(meta?.target ?? '');
    const field = /offer_code|offerCode/.test(target) ? 'Promo code' : /external_offer_id|externalOfferId/.test(target) ? 'External offer ID' : /slug/.test(target) ? 'URL slug' : '';
    return Response.json({ success: false, error: field ? `${field} is already used in this store. Enter a different value.` : 'This identifier, slug, default or stock scope already exists in this store.' }, { status: 409 });
  }
  if (code === 'P2003' || code === 'P2004') return Response.json({ success: false, error: 'Invalid values or related records. Check this record before saving.' }, { status: 400 });
  console.error('Menu operation failed:', error instanceof Error ? error.message : 'Database error');
  return Response.json({ success: false, error: 'Unable to access the menu database. Please retry.' }, { status: 503 });
}
