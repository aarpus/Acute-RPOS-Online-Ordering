import { blankMenuRecord, type MenuRecord } from './menu-contract';

// Adapter boundary for the original screen-specific form shapes. Database/API
// fields remain validated by the canonical menu service, never by this display ID.
export type LegacyRow = { id: number; [key: string]: any };
export type MenuSnapshot = Record<string, MenuRecord[]>;
export type MenuOperation = { resource: string; id?: string; data: Record<string, unknown>; method?: 'DELETE'; clientKey?: string };
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const imageFallback = '/images/category-0.jpg';
export function displayId(id: string): number {
  if (/^[a-f\d-]{36}$/i.test(id)) return parseInt(id.replaceAll('-', '').slice(0, 12), 16);
  let hash = 2166136261; for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
const records = (snapshot: MenuSnapshot, resource: string): LegacyRow[] => (snapshot[resource] ?? []) as unknown as LegacyRow[];
const config = (row?: LegacyRow): Record<string, any> => row?.configuration && typeof row.configuration === 'object' ? row.configuration : {};
const legacy = (row?: LegacyRow): Record<string, any> => config(row).legacyForm ?? {};
const base = (row: LegacyRow) => ({ id: displayId(String(row.id)), _dbId: row.id, _updatedAt: row.updatedAt });
const byId = (s: MenuSnapshot, r: string, id: unknown) => records(s, r).find(row => row.id === id);
const related = (s: MenuSnapshot, r: string, key: string, id: unknown) => records(s, r).filter(row => row[key] === id);
const time = (value: unknown, fallback = '') => typeof value === 'string' ? value.includes('T') ? value.slice(11, 16) : value : fallback;
const date = (value: unknown) => typeof value === 'string' ? value.slice(0, 10) : '';
const dayNames = (value: unknown) => Array.isArray(value) ? value.map(day => days[Number(day) - 1]).filter(Boolean) : [...days];
const dayNumbers = (value: unknown) => Array.isArray(value) ? value.map(day => days.indexOf(String(day)) + 1).filter(Boolean) : [1, 2, 3, 4, 5, 6, 7];
const offerTypes: Record<string, string> = { percentage: 'Percentage Discount', fixed: 'Fixed Amount', bogo: 'Buy 1 Get 1 Free', free_delivery: 'Free Delivery' };
function primaryPrice(s: MenuSnapshot, itemId: unknown) {
  return related(s, 'pricing', 'menuItemId', itemId).filter(row => !row.variantId && (config(row).legacyPrimary || row.priceType === 'online' && !row.startAt && !row.endAt)).sort((a, b) => Number(b.priority) - Number(a.priority))[0];
}
function itemCategoryNames(s: MenuSnapshot, item: LegacyRow) { return (item.categoryIds ?? []).map((id: string) => byId(s, 'categories', id)?.categoryName).filter(Boolean); }
function itemImages(s: MenuSnapshot, item: LegacyRow) {
  const gallery = related(s, 'images', 'menuItemId', item.id).filter(row => row.isActive).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || Number(a.displayOrder) - Number(b.displayOrder)).map(row => row.imageUrl);
  return gallery.length ? gallery : [item.imageUrl || imageFallback];
}
function itemModifiers(s: MenuSnapshot, links: LegacyRow[] = []) {
  return records(s, 'modifier-options').filter(option => byId(s, 'modifier-groups', option.modifierGroupId)?.isActive).map(option => { const link = links.find(row => row.modifierGroupId === option.modifierGroupId); return { _optionId: option.id, _optionUpdatedAt: option.updatedAt, name: option.name, price: Number(option.price), selected: !!link && (!Array.isArray(link.conditions?.allowedOptionIds) || link.conditions.allowedOptionIds.includes(option.id)) }; });
}
export function legacyRows(s: MenuSnapshot, view: string): LegacyRow[] {
  const items = records(s, 'items');
  if (view === 'categories') return records(s, view).map(row => ({ ...legacy(row), ...base(row), name: row.categoryName, externalId: row.externalCategoryId || '', description: row.description || '', image: row.imageUrl || imageFallback, order: Number(row.displayOrder) + 1, active: row.isActive, visible: row.isVisible, itemCount: items.filter(item => item.categoryIds?.includes(row.id)).length, samples: items.filter(item => item.categoryIds?.includes(row.id)).slice(0, 3).map(item => ({ name: item.itemName, price: Number(item.basePrice), image: itemImages(s, item)[0] })) }));
  if (view === 'tax-rules') return records(s, view).map(row => ({ ...config(row), ...legacy(row), ...base(row), name: row.name, rate: String(row.ratePercent), externalId: row.externalTaxId || '', appliesTo: config(row).appliesTo || 'All Items', description: config(row).description || '', rounding: config(row).rounding || 'No Rounding', order: Number(config(row).displayOrder ?? 0) + 1, active: row.isActive, receipt: config(row).receipt !== false, delivery: config(row).delivery !== false, takeaway: config(row).takeaway !== false }));
  if (view === 'variants') return records(s, view).map(row => { const item = byId(s, 'items', row.menuItemId); const stock = related(s, 'inventory', 'variantId', row.id)[0]; return { ...config(row), ...legacy(row), ...base(row), _itemId: row.menuItemId, item: item?.itemName || '', name: row.name, externalId: row.externalVariantId || '', sku: row.sku || '', group: config(row).group || row.metadata?.group || 'Size', price: Number(row.price), compare: Number(row.comparePrice ?? 0), order: Number(row.displayOrder) + 1, inventory: Number(stock?.quantityAvailable ?? 0), isDefault: row.isDefault, available: row.isAvailable, image: config(row).image || row.metadata?.image || (item ? itemImages(s, item)[0] : imageFallback) }; });
  if (view === 'modifier-groups') return records(s, view).map(row => ({ ...legacy(row), ...base(row), name: row.name, externalId: row.externalGroupId || '', description: row.description || '', type: row.selectionType === 'single' ? 'Single' : 'Multiple', min: row.minSelect, max: row.maxSelect, required: row.minSelect > 0, active: row.isActive, order: Number(row.displayOrder) + 1, image: config(row).image || imageFallback, options: related(s, 'modifier-options', 'modifierGroupId', row.id).map(option => ({ ...base(option), name: option.name, price: Number(option.price), image: config(option).image || imageFallback, isDefault: option.isDefault, active: option.isAvailable, order: Number(option.displayOrder) + 1 })) }));
  if (view === 'offers') return records(s, view).map(row => ({ buyQty: 1, getQty: 1, minItems: 1, customer: 'All Customers', scope: 'All Items', days: [...days], startTime: '00:00', endTime: '23:59', website: true, app: true, image: imageFallback, ...config(row), ...legacy(row), ...base(row), name: row.offerName, type: offerTypes[row.offerType] || 'Percentage Discount', value: Number(row.discountValue ?? 0), minimum: Number(row.minimumOrder ?? 0), description: row.description || '', start: date(row.startAt), end: date(row.endAt), usage: 0, maxDiscount: Number(row.maxDiscount ?? 0), active: row.isActive, stacking: row.isStackable, code: row.offerCode || '', externalId: row.externalOfferId || '', priority: row.priority, perCustomer: row.perCustomerLimit ?? 0, items: (row.applicableItems ?? []).map((id: string) => byId(s, 'items', id)?.itemName).filter(Boolean), categories: (row.applicableCategories ?? []).map((id: string) => byId(s, 'categories', id)?.categoryName).filter(Boolean) }));
  if (view === 'inventory') return records(s, view).filter(row => !row.variantId).map(row => { const item = byId(s, 'items', row.menuItemId); return { unit: 'Plate', reorder: 0, cost: '0.00', email: '', alert: false, history: [], ...config(row), ...legacy(row), ...base(row), _itemUpdatedAt: item?.updatedAt, name: item?.itemName || '', sku: item?.sku || '', category: item ? itemCategoryNames(s, item)[0] || '' : '', image: item ? itemImages(s, item)[0] : imageFallback, stock: Number(row.quantityAvailable ?? 0), minimum: Number(row.lowStockThreshold ?? 0), tracked: row.trackInventory, negative: row.allowBackorder, active: config(row).active !== false }; });
  if (view === 'pricing') return items.map(item => { const price = primaryPrice(s, item.id); return { type: 'Fixed Price', website: true, app: true, discounts: true, discountEnabled: false, discountType: 'Percentage', discountValue: 0, discountStart: '', discountEnd: '', timeEnabled: false, timePrice: 0, days: [...days], start: '00:00', end: '23:59', ...config(price), ...legacy(price), ...base(item), _priceId: price?.id, _priceUpdatedAt: price?.updatedAt, name: item.itemName, category: itemCategoryNames(s, item)[0] || '', image: itemImages(s, item)[0], base: Number(item.basePrice), current: Number(price?.price ?? item.basePrice), compare: Number(price?.comparePrice ?? item.comparePrice ?? 0), minimum: item.minimumQuantity, active: price?.isActive ?? true }; });
  if (view === 'schedules') {
    const groups = new Map<string, LegacyRow[]>();
    for (const row of records(s, view)) { const key = config(row).legacyGroupId || String(row.id); groups.set(key, [...(groups.get(key) ?? []), row]); }
    return [...groups].map(([key, members]) => { const row = members[0]; return { name: 'Availability', description: '', image: imageFallback, externalId: '', priority: 0, delivery: true, takeaway: true, dineIn: true, website: true, app: true, override: false, scope: 'Specific Items', ...config(row), ...legacy(row), ...base(row), id: displayId(key), _groupId: key, _members: members.map(row => ({ id: row.id, updatedAt: row.updatedAt })), type: row.scheduleType === 'date_range' ? 'Date Based' : legacy(row).type || 'Time Based', days: dayNames(row.daysOfWeek), start: time(row.startTime, '00:00'), end: time(row.endTime, '23:59'), allDay: !row.startTime || time(row.startTime) === time(row.endTime), startDate: date(row.startDate), endDate: date(row.endDate), timezone: row.timezone, active: row.isActive, items: members.map(member => byId(s, 'items', member.menuItemId)?.itemName).filter(Boolean), categories: config(row).categoryIds?.map((id: string) => byId(s, 'categories', id)?.categoryName).filter(Boolean) ?? [] }; });
  }
  if (view === 'seo-meta') {
    const stored = records(s, view);
    const targets = [['Home', '/'], ['Menu', '/menu'], ['Offers', '/offers'], ['About Us', '/about'], ['Contact Us', '/contact'], ['Privacy Policy', '/privacy-policy'], ['Terms & Conditions', '/terms'], ['FAQ', '/faq']].map(([page, path]) => ({ page, targetType: 'page', targetId: path, slug: path, image: imageFallback }));
    targets.push(...items.map(row => ({ page: `Item – ${row.itemName}`, targetType: 'item', targetId: String(row.id), slug: `/item/${slugify(row.itemName)}`, image: itemImages(s, row)[0] })), ...records(s, 'categories').map(row => ({ page: `Category – ${row.categoryName}`, targetType: 'category', targetId: String(row.id), slug: `/menu/${slugify(row.categoryName)}`, image: row.imageUrl || imageFallback })));
    for (const row of stored) if (!targets.some(target => target.targetType === row.targetType && target.targetId === row.targetId)) targets.push({ page: row.pageName, targetType: row.targetType, targetId: row.targetId, slug: row.slug, image: row.imageUrl || imageFallback });
    return targets.map(target => { const row = stored.find(row => row.targetType === target.targetType && row.targetId === target.targetId); return { id: displayId(`seo:${target.targetType}:${target.targetId}`), _dbId: row?.id, _updatedAt: row?.updatedAt, _targetType: target.targetType, _targetId: target.targetId, page: target.page, slug: row?.slug || target.slug, title: row?.title || target.page, description: row?.description || '', keywords: row?.keywords || '', canonical: row?.canonicalUrl || '', image: row?.imageUrl || target.image, active: row?.isActive ?? true }; });
  }
  if (view === 'items' || view === 'combo-items') return items.filter(item => view !== 'combo-items' || item.itemType === 'combo').map(item => {
    const stock = related(s, 'inventory', 'menuItemId', item.id).find(row => !row.variantId);
    const itemSchedules = related(s, 'schedules', 'menuItemId', item.id).filter(row => row.scheduleType !== 'exception');
    const schedule = itemSchedules.find(row => !config(row).inlineItemSchedule) ?? itemSchedules[0];
    const seo = records(s, 'seo-meta').find(row => row.targetType === 'item' && row.targetId === item.id);
    const links = related(s, 'modifier-links', 'menuItemId', item.id).filter(row => !row.variantId);
    const comboGroups = related(s, 'combo-groups', 'comboItemId', item.id);
    const groups = comboGroups.sort((a, b) => a.displayOrder - b.displayOrder).map(group => ({ ...base(group), name: group.groupName, externalId: group.externalGroupId || '', selectionType: group.selectionType, min: group.minSelect, max: group.maxSelect, required: group.isRequired, order: group.displayOrder + 1, options: related(s, 'combo-options', 'comboGroupId', group.id).sort((a, b) => a.displayOrder - b.displayOrder).map(option => ({ ...base(option), itemId: option.componentItemId || '', name: option.optionName, quantity: Number(option.quantity), extraPrice: config(option).useItemPrice === true ? null : Number(option.extraPrice), isDefault: option.isDefault, available: option.isAvailable, order: option.displayOrder + 1, externalId: option.externalOptionId || '' })) }));
    const included = comboGroups.flatMap(group => related(s, 'combo-options', 'comboGroupId', group.id)).map(option => { const component = byId(s, 'items', option.componentItemId); return { _dbId: option.id, _updatedAt: option.updatedAt, name: component?.itemName || option.optionName, price: Number(component?.basePrice ?? 0), quantity: Number(option.quantity), image: component ? itemImages(s, component)[0] : imageFallback }; });
    const gallery = itemImages(s, item);
    return { ...legacy(item), ...base(item), ...(view === 'combo-items' ? { groups } : {}), _scheduleId: schedule?.id, name: item.itemName, externalId: item.externalItemId || '', sku: item.sku || '', description: item.description || '', categories: itemCategoryNames(s, item), category: itemCategoryNames(s, item)[0] || '', type: view === 'combo-items' ? legacy(item).type === 'Customizable' ? 'Customizable' : 'Fixed Combo' : item.itemType === 'combo' ? 'Combo Item' : 'Regular Item', food: item.foodType === 'non_veg' ? 'Non-Veg' : 'Veg', price: Number(item.basePrice), compare: Number(item.comparePrice ?? 0), tax: byId(s, 'tax-rules', item.taxRuleId)?.name || '', preparation: Number(item.preparationTime ?? 0), min: item.minimumQuantity, max: item.maximumQuantity ?? 99, featured: item.isFeatured, visible: item.isVisible, available: item.isAvailable, instructions: item.allowSpecialInstructions, enabled: config(item).enabled !== false, badge: config(item).badge || '', images: gallery, image: gallery[0], gallery, variants: related(s, 'variants', 'menuItemId', item.id).map(row => ({ ...base(row), name: row.name, price: Number(row.price), enabled: row.isAvailable, image: config(row).image || row.metadata?.image || itemImages(s, item)[0], group: config(row).group || row.metadata?.group || 'Size', isDefault: row.isDefault })), modifiers: itemModifiers(s, links), comboItems: included.map(option => option.name), included, count: included.length, trackStock: stock?.trackInventory ?? false, stock: Number(stock?.quantityAvailable ?? 0), lowStock: Number(stock?.lowStockThreshold ?? 0), days: schedule ? dayNames(schedule.daysOfWeek) : [...days], start: time(schedule?.startTime, '00:00'), end: time(schedule?.endTime, '23:59'), seoTitle: seo?.title || '', slug: seo?.slug?.split('/').pop() || '', metaDescription: seo?.description || '', seoDescription: seo?.description || '' };
  });
  return [];
}
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z\d]+/g, '-').replace(/^-|-$/g, '') || 'item';
export function blankLegacy(view: string, template: LegacyRow, s: MenuSnapshot): LegacyRow {
  const row: LegacyRow = structuredClone(template);
  for (const key of Object.keys(row)) {
    if (typeof row[key] === 'string') row[key] = '';
    else if (typeof row[key] === 'number') row[key] = 0;
    else if (Array.isArray(row[key])) row[key] = [];
  }
  Object.assign(row, { id: 0, image: imageFallback, images: [imageFallback], gallery: [imageFallback], days: [...days], start: '00:00', end: '23:59', startTime: '00:00', endTime: '23:59', min: 1, max: 99, minimum: 0, order: 1, inventory: 0, cost: '0.00', unit: 'Plate', active: true, enabled: true, visible: true, available: true, instructions: true, featured: false, trackStock: false, tracked: false, type: 'Regular Item', food: 'Veg', timezone: 'America/Los_Angeles', scope: 'All Items', allDay: true });
  if (view === 'items') row.modifiers = itemModifiers(s);
  if (view === 'tax-rules') Object.assign(row, {rate: '0.00', appliesTo: 'All Items', rounding: 'No Rounding', receipt: true, delivery: true, takeaway: true});
  if (view === 'variants') Object.assign(row, { item: records(s, 'items')[0]?.itemName || '', group: 'Size', isDefault: false });
  if (view === 'modifier-groups') Object.assign(row, { type: 'Single', min: 0, max: 1, required: false });
  if (view === 'offers') Object.assign(row, { type: 'Percentage Discount', customer: 'All Customers', buyQty: 1, getQty: 1, minItems: 1, website: true, app: true, start: '', end: '' });
  if (view === 'schedules') Object.assign(row, {type: 'Time Based', priority: 1, delivery: true, takeaway: true, dineIn: true, website: true, app: true, override: false, overnight: false});
  if (view === 'pricing') Object.assign(row, { type: 'Fixed Price', minimum: 1, discountType: 'Percentage', discounts: true, website: true, app: true, discountEnabled: false, timeEnabled: false });
  if (view === 'combo-items') Object.assign(row, { type: 'Fixed Combo', included: [], count: 0, trackStock: true });
  return row;
}

function resolveName(s: MenuSnapshot, resource: string, name: string, field: string) {
  const matches = records(s, resource).filter(row => row[field] === name);
  if (matches.length !== 1) throw new Error(`Choose a unique saved ${resource === 'items' ? 'item' : resource} for “${name}”.`);
  return String(matches[0].id);
}
export function copyVariantTemplate(row: LegacyRow, id: number): LegacyRow {
  return { id, name: row.name, price: Number(row.price), compare: Number(row.compare ?? 0),
    enabled: row.available ?? row.enabled ?? true, image: row.image || imageFallback,
    group: row.group || 'Size', isDefault: false, externalId: '', sku: '' };
}
function formConfiguration(row: LegacyRow, old?: LegacyRow) {
  const form = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'id' && key !== 'groups' && !key.startsWith('_')));
  const previous = { ...config(old) };
  delete previous.groups;
  return { ...previous, ...form, legacyForm: form };
}
function child(s: MenuSnapshot, resource: string, old: LegacyRow | undefined, values: Record<string, unknown>) {
  return { ...(old ? { id: old.id, updatedAt: old.updatedAt } : {}), ...values };
}
export function encodeLegacy(s: MenuSnapshot, view: string, row: LegacyRow): MenuOperation[] {
  const resource = view;
  const old = row._dbId ? byId(s, resource, row._dbId) : undefined;
  const configuration = formConfiguration(row, old);
  const data: Record<string, unknown> = { ...(row._updatedAt ? { updatedAt: row._updatedAt } : {}), configuration };
  const op = (r: string, values: Record<string, unknown>, current: LegacyRow | undefined, clientKey?: string): MenuOperation => ({ resource: r, ...(current ? { id: String(current.id) } : {}), data: { ...(current ? { updatedAt: current.updatedAt } : {}), ...values }, clientKey });
  if (view === 'categories') Object.assign(data, { categoryName: row.name, externalCategoryId: row.externalId, description: row.description, imageUrl: row.image, displayOrder: row.order - 1, isVisible: row.visible, isActive: row.active });
  if (view === 'tax-rules') Object.assign(data, { name: row.name, ratePercent: Number(row.rate), externalTaxId: row.externalId, isActive: row.active, configuration: { ...configuration, displayOrder: row.order - 1 } });
  if (view === 'offers') Object.assign(data, { offerName: row.name, offerType: Object.entries(offerTypes).find(([, value]) => value === row.type)?.[0] || 'percentage', discountValue: row.value, minimumOrder: row.minimum, description: row.description, startAt: row.start ? `${row.start}T00:00:00Z` : '', endAt: row.end ? `${row.end}T23:59:59.999Z` : '', maxDiscount: row.maxDiscount || null, isActive: row.active, isStackable: row.stacking, offerCode: row.code, couponRequired: !!row.code, externalOfferId: row.externalId, priority: row.priority, perCustomerLimit: row.perCustomer || null, applicableItems: row.items.map((name: string) => resolveName(s, 'items', name, 'itemName')), applicableCategories: row.categories.map((name: string) => resolveName(s, 'categories', name, 'categoryName')) });
  if (view === 'modifier-groups') Object.assign(data, { name: row.name, description: row.description, externalGroupId: row.externalId, selectionType: row.type === 'Single' ? 'single' : 'multiple', minSelect: row.required ? Math.max(1, row.min) : row.min, maxSelect: row.max, displayOrder: row.order - 1, isActive: row.active, children: { 'modifier-options': row.options.map((option: LegacyRow) => { const original = option._dbId ? byId(s, 'modifier-options', option._dbId) : undefined; return child(s, 'modifier-options', original, { name: option.name, price: option.price, isDefault: option.isDefault, isAvailable: option.active, displayOrder: option.order - 1, configuration: formConfiguration(option, original) }); }) } });
  if (view === 'variants') {
    const itemId = row._itemId ? byId(s, 'items', row._itemId)?.id : resolveName(s, 'items', row.item, 'itemName');
    if (!itemId) throw new Error('Choose a saved item for this variant.');
    Object.assign(data, { menuItemId: itemId, name: row.name, externalVariantId: row.externalId, sku: row.sku, price: row.price, comparePrice: row.compare, isDefault: row.isDefault, isAvailable: row.available, displayOrder: row.order - 1 });
    const stock = old ? related(s, 'inventory', 'variantId', old.id)[0] : undefined;
    return [op(view, data, old, `row:${row.id}`), op('inventory', { menuItemId: itemId, variantId: old?.id || `@new:row:${row.id}`, quantityAvailable: row.inventory, trackInventory: stock?.trackInventory ?? false, lowStockThreshold: stock?.lowStockThreshold ?? null, allowBackorder: stock?.allowBackorder ?? false, stockStatus: row.inventory <= 0 && stock?.trackInventory ? 'out_of_stock' : 'in_stock' }, stock)];
  }
  if (view === 'inventory') {
    const itemId = resolveName(s, 'items', row.name, 'itemName');
    Object.assign(data, { menuItemId: itemId, trackInventory: row.tracked, quantityAvailable: row.stock, lowStockThreshold: row.minimum, allowBackorder: row.negative, stockStatus: row.stock <= 0 && row.tracked ? row.negative ? 'backorder' : 'out_of_stock' : row.stock <= row.minimum ? 'low_stock' : 'in_stock' });
    const item = byId(s, 'items', itemId)!;
    return [op('items', { updatedAt: row._itemUpdatedAt || item.updatedAt, sku: row.sku }, item), op(view, data, old, `row:${row.id}`)];
  }
  if (view === 'pricing') {
    const item = byId(s, 'items', row._dbId)!;
    if (!item) throw new Error('Choose a saved menu item.');
    const price = row._priceId ? byId(s, 'pricing', row._priceId) : undefined;
    return [op('items', { updatedAt: row._updatedAt, basePrice: row.base, comparePrice: row.compare, minimumQuantity: row.minimum }, item), op('pricing', { configuration: { ...formConfiguration(row, price), legacyPrimary: true }, updatedAt: row._priceUpdatedAt, menuItemId: item.id, priceType: price?.priceType || 'online', currency: price?.currency || 'USD', price: row.current, comparePrice: row.compare, priority: price?.priority ?? Math.max(-1, ...related(s, 'pricing', 'menuItemId', item.id).map(price => Number(price.priority))) + 1, isActive: row.active }, price, `row:${row.id}`)];
  }
  if (view === 'seo-meta') Object.assign(data, { targetType: row._targetType || 'page', targetId: row._targetId || row.slug, pageName: row.page, slug: row.slug, title: row.title, description: row.description, keywords: row.keywords, canonicalUrl: row.canonical, imageUrl: row.image, isActive: row.active });
  if (view === 'schedules') {
    const all = records(s, 'items');
    const categoryIds = (row.categories ?? []).map((name: string) => resolveName(s, 'categories', name, 'categoryName'));
    const targetIds = row.scope === 'All Items' ? all.map(item => String(item.id)) : ['Selected Categories', 'Specific Categories'].includes(row.scope) ? all.filter(item => item.categoryIds?.some((id: string) => categoryIds.includes(id))).map(item => String(item.id)) : row.items.map((name: string) => resolveName(s, 'items', name, 'itemName'));
    if (!targetIds.length) throw new Error('Choose at least one saved menu item for this schedule.');
    const group = row._groupId || crypto.randomUUID();
    const existing = records(s, 'schedules').filter(record => row._members?.some((member: { id: string }) => member.id === String(record.id)));
    const versions = new Map<string, unknown>((row._members ?? []).map((member: { id: string; updatedAt: string }) => [member.id, member.updatedAt]));
    const result: MenuOperation[] = existing.filter(record => !targetIds.includes(String(record.menuItemId))).map(record => ({ resource: view, id: String(record.id), method: 'DELETE', data: { updatedAt: versions.get(String(record.id)) } }));
    for (const itemId of targetIds) {
      const record = existing.find(record => record.menuItemId === itemId) ?? related(s, 'schedules', 'menuItemId', itemId).find(record => config(record).inlineItemSchedule);
      result.push(op(view, { configuration: { ...formConfiguration(row, record), categoryIds, legacyGroupId: group, inlineItemSchedule: false }, ...(record ? { updatedAt: versions.get(String(record.id)) ?? record.updatedAt } : {}), menuItemId: itemId, timezone: row.timezone, daysOfWeek: dayNumbers(row.days), startTime: row.allDay ? '' : row.start, endTime: row.allDay ? '' : row.end, startDate: row.startDate, endDate: row.endDate, scheduleType: row.type === 'Date Based' ? 'date_range' : 'recurring', isActive: row.active }, record, `row:${row.id}`));
    }
    return result;
  }
  if (view === 'items' || view === 'combo-items') {
    const before: MenuOperation[] = [];
    const itemId = old?.id;
    const children: Record<string, unknown> = {};
    const combo = view === 'combo-items' || row.type === 'Combo Item';
    if (!combo && old?.itemType === 'combo') {
      for (const group of related(s, 'combo-groups', 'comboItemId', itemId)) before.push({ resource: 'combo-groups', id: String(group.id), method: 'DELETE', data: { updatedAt: group.updatedAt } });
    }
    const keptVariants = new Set((row.variants ?? []).map((variant: LegacyRow) => variant._dbId).filter(Boolean));
    if (Array.isArray(row.variants)) for (const variant of related(s, 'variants', 'menuItemId', itemId).filter(variant => !keptVariants.has(variant.id))) {
      for (const resource of ['inventory', 'pricing', 'modifier-links']) for (const dependent of related(s, resource, 'variantId', variant.id)) before.push({ resource, id: String(dependent.id), method: 'DELETE', data: { updatedAt: dependent.updatedAt } });
    }
    Object.assign(data, { itemName: row.name, externalItemId: row.externalId, sku: row.sku ?? old?.sku ?? '', description: row.description, itemType: combo ? 'combo' : 'regular', foodType: row.food === 'Non-Veg' ? 'non_veg' : 'veg', basePrice: row.price, comparePrice: row.compare, taxRuleId: row.tax ? resolveName(s, 'tax-rules', row.tax, 'name') : '', categoryIds: (view === 'combo-items' ? [row.category] : row.categories).map((name: string) => resolveName(s, 'categories', name, 'categoryName')), preparationTime: row.preparation ?? old?.preparationTime ?? 0, minimumQuantity: row.min ?? old?.minimumQuantity ?? 1, maximumQuantity: row.max ?? old?.maximumQuantity ?? 99, isFeatured: row.featured, isVisible: row.visible, isAvailable: row.available, allowSpecialInstructions: row.instructions, configuration: { ...configuration, enabled: row.enabled, badge: row.badge || '' } });
    if (Array.isArray(row.variants)) children.variants = row.variants.map((variant: LegacyRow) => {
      const original = variant._dbId ? byId(s, 'variants', variant._dbId) : undefined;
      return child(s, 'variants', original, { name: variant.name, price: variant.price, isAvailable: variant.enabled,
        ...(variant.compare !== undefined ? { comparePrice: variant.compare } : {}),
        ...(variant.isDefault !== undefined ? { isDefault: variant.isDefault } : {}),
        ...(variant.image !== undefined || variant.group !== undefined ? { configuration: { ...config(original),
          ...(variant.image !== undefined ? { image: variant.image } : {}),
          ...(variant.group !== undefined ? { group: variant.group } : {}) } } : {}),
      });
    });
    if (Array.isArray(row.modifiers)) {
      for (const modifier of row.modifiers) {
        if (typeof modifier.name !== 'string' || !modifier.name.trim() || !Number.isFinite(Number(modifier.price)) || Number(modifier.price) < 0) throw new Error('Enter a name and a valid non-negative price for each add-on.');
        if (!modifier._optionId) continue;
        const option = byId(s, 'modifier-options', modifier._optionId);
        if (!option) throw new Error('A modifier changed. Reload before saving.');
        if (modifier.name.trim() !== option.name || Number(modifier.price) !== Number(option.price)) {
          before.push({ resource: 'modifier-options', id: String(option.id), data: { name: modifier.name.trim(), price: modifier.price, updatedAt: modifier._optionUpdatedAt ?? option.updatedAt } });
        }
      }
      const oldLinks = related(s, 'modifier-links', 'menuItemId', itemId);
      const assignments: Record<string, unknown>[] = oldLinks.filter(link => link.variantId && keptVariants.has(link.variantId)).map(link => ({ ...link }));
      const selected = row.modifiers.filter((modifier: LegacyRow) => modifier.selected);
      const grouped = new Map<string, string[]>();
      for (const modifier of selected.filter((modifier: LegacyRow) => modifier._optionId)) {
        const option = byId(s, 'modifier-options', modifier._optionId);
        if (!option) throw new Error('A modifier changed. Reload before saving.');
        grouped.set(String(option.modifierGroupId), [...(grouped.get(String(option.modifierGroupId)) ?? []), String(option.id)]);
      }
      for (const [groupId, ids] of grouped) {
        const group = byId(s, 'modifier-groups', groupId)!;
        if (Number(group.minSelect) > ids.length) throw new Error(`${group.name} needs at least ${group.minSelect} selected options.`);
        const link = oldLinks.find(link => !link.variantId && link.modifierGroupId === groupId);
        assignments.push(child(s, 'modifier-links', link, { modifierGroupId: groupId, conditions: { ...(link?.conditions ?? {}), allowedOptionIds: ids } }));
      }
      const added = selected.filter((modifier: LegacyRow) => !modifier._optionId);
      if (added.length) {
        const groupKey = `addons:${row.id}`;
        before.push({ resource: 'modifier-groups', clientKey: groupKey, data: { name: `${row.name} add-ons`, selectionType: 'multiple', minSelect: 0, maxSelect: added.length, configuration: { inlineItemModifiers: true }, children: { 'modifier-options': added.map((modifier: LegacyRow) => ({ name: modifier.name, price: modifier.price, isAvailable: true })) } } });
        assignments.push({ modifierGroupId: `@new:${groupKey}` });
      }
      children['modifier-links'] = assignments;
    }
    const images: string[] = view === 'combo-items' ? [row.image, ...(row.gallery ?? []).filter((url: string) => url !== row.image)] : row.images;
    data.imageUrl = images.find(Boolean) || '';
    const oldImages = related(s, 'images', 'menuItemId', itemId);
    children.images = [...new Set(images)].filter(Boolean).map((url, i) => child(s, 'images', oldImages.find(image => image.imageUrl === url), { imageUrl: url, isPrimary: i === 0, isActive: true, displayOrder: i }));
    const stock = related(s, 'inventory', 'menuItemId', itemId).find(stock => !stock.variantId);
    children.inventory = [...related(s, 'inventory', 'menuItemId', itemId).filter(stock => stock.variantId && (!Array.isArray(row.variants) || keptVariants.has(stock.variantId))).map(stock => ({ ...stock })), child(s, 'inventory', stock, { variantId: null, trackInventory: row.trackStock ?? stock?.trackInventory ?? false, quantityAvailable: row.stock, lowStockThreshold: row.lowStock ?? stock?.lowStockThreshold ?? 0, allowBackorder: stock?.allowBackorder ?? false, stockStatus: row.stock <= 0 && (row.trackStock ?? stock?.trackInventory) ? 'out_of_stock' : 'in_stock' })];
    const inlineSchedule = (row._scheduleId ? byId(s, 'schedules', row._scheduleId) : undefined) ?? related(s, 'schedules', 'menuItemId', itemId).find(schedule => config(schedule).inlineItemSchedule);
    children.schedules = [...related(s, 'schedules', 'menuItemId', itemId).filter(schedule => schedule.id !== inlineSchedule?.id).map(schedule => ({ ...schedule })), child(s, 'schedules', inlineSchedule, { timezone: inlineSchedule?.timezone || 'America/Los_Angeles', daysOfWeek: dayNumbers(row.days), startTime: row.start, endTime: row.end, scheduleType: 'recurring', isActive: true, configuration: { ...config(inlineSchedule), inlineItemSchedule: inlineSchedule ? config(inlineSchedule).inlineItemSchedule === true : true } })];
    if (row.seoTitle || row.slug || row.metaDescription || row.seoDescription) {
      const seo = records(s, 'seo-meta').find(seo => seo.targetType === 'item' && seo.targetId === itemId);
      children['seo-meta'] = [child(s, 'seo-meta', seo, { targetType: 'item', pageName: `Item – ${row.name}`, title: row.seoTitle || row.name, slug: seo && row.slug === seo.slug?.split('/').pop() ? seo.slug : row.slug?.startsWith('/') ? row.slug : `/item/${row.slug || slugify(row.name)}`, description: view === 'combo-items' ? row.seoDescription || '' : row.metaDescription || '' })];
    }
    if (combo && view === 'combo-items' && Array.isArray(row.groups)) {
      children['combo-groups'] = row.groups.map((group: LegacyRow) => {
        const original = group._dbId ? byId(s, 'combo-groups', group._dbId) : undefined;
        const options = group.options as LegacyRow[];
        const count = options.filter(option => option.available).length;
        const fixed = group.selectionType === 'fixed';
        return child(s, 'combo-groups', original, { groupName: group.name, externalGroupId: group.externalId || '', selectionType: group.selectionType, minSelect: fixed ? count : group.min, maxSelect: fixed ? count : group.max, isRequired: fixed ? count > 0 : group.required, displayOrder: group.order - 1, configuration: { ...config(original), inlineCombo: false }, children: { 'combo-options': options.map(option => {
          const oldOption = option._dbId ? byId(s, 'combo-options', option._dbId) : undefined;
          return child(s, 'combo-options', oldOption, { componentItemId: option.itemId, optionName: option.name, externalOptionId: option.externalId || '', quantity: option.quantity, extraPrice: option.extraPrice, isDefault: fixed ? option.available : option.isDefault, isAvailable: option.available, displayOrder: option.order - 1 });
        }) } });
      });
    } else if (combo && view === 'items' && related(s, 'combo-groups', 'comboItemId', itemId).some(group => !config(group).inlineCombo)) {
      const existingNames = related(s, 'combo-groups', 'comboItemId', itemId).flatMap(group => related(s, 'combo-options', 'comboGroupId', group.id)).map(option => byId(s, 'items', option.componentItemId)?.itemName || option.optionName);
      if (JSON.stringify([...existingNames].sort()) !== JSON.stringify([...(row.comboItems ?? [])].sort())) throw new Error('Edit this combo’s groups and options in Combo Master.');
      // The basic item editor must preserve group limits, quantities and prices.
    } else if (combo) {
      const oldGroups = related(s, 'combo-groups', 'comboItemId', itemId);
      const own = oldGroups.find(group => config(group).inlineCombo) ?? oldGroups[0];
      const included: LegacyRow[] = view === 'combo-items' ? row.included ?? [] : row.comboItems.map((name: string) => ({ id: 0, name, quantity: 1 }));
      const oldOptions = related(s, 'combo-options', 'comboGroupId', own?.id);
      const fixed = view !== 'combo-items' || row.type === 'Fixed Combo';
      children['combo-groups'] = [...oldGroups.filter(group => group.id !== own?.id).map(group => ({ ...group })), child(s, 'combo-groups', own, { groupName: own?.groupName || 'Included Items', selectionType: fixed ? 'fixed' : 'selectable', minSelect: fixed ? included.length : Math.min(1, included.length), maxSelect: included.length, isRequired: included.length > 0, configuration: { ...config(own), inlineCombo: true }, children: { 'combo-options': included.map(option => { const componentId = resolveName(s, 'items', option.name, 'itemName'); const original = oldOptions.find(original => original.componentItemId === componentId); return child(s, 'combo-options', original, { componentItemId: componentId, optionName: option.name, quantity: option.quantity, extraPrice: original?.extraPrice ?? 0, isDefault: fixed || original?.isDefault === true, isAvailable: true }); }) } })];
    }
    data.children = children;
    return [...before, { resource, ...(old ? { id: String(old.id) } : {}), data, clientKey: `row:${row.id}` }];
  }
  return [{ resource, ...(old ? { id: String(old.id) } : {}), data, clientKey: `row:${row.id}` }];
}

export function archiveLegacy(view: string, row: LegacyRow, snapshot?: MenuSnapshot): MenuOperation[] {
  if (view === 'schedules') return (row._members ?? []).map((member: { id: string; updatedAt: string }) => ({ resource: view, id: member.id, method: 'DELETE', data: { updatedAt: member.updatedAt } }));
  if (!row._dbId) throw new Error('This record has not been saved.');
  const owned: MenuOperation[] = [];
  if (view === 'variants' && snapshot) for (const resource of ['inventory','pricing','modifier-links']) for (const dependent of related(snapshot, resource, 'variantId', row._dbId)) owned.push({ resource, id: String(dependent.id), method: 'DELETE', data: { updatedAt: dependent.updatedAt } });
  return [...owned, { resource: view, id: row._dbId, method: 'DELETE', data: { updatedAt: row._updatedAt } }];
}
