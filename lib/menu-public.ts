import type { Prisma } from '@prisma/client';
import type { Product, StockRequirement } from '../data/home';
import { MenuError } from './menu-validation';
import type { CartItem, Schedule } from './order';

type ScheduleRow = { timezone: string; daysOfWeek: unknown; startTime: Date | null; endTime: Date | null; startDate: Date | null; endDate: Date | null; scheduleType: string; configuration?: unknown };
export function zonedParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (key: string) => parts.find(part => part.type === key)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}
export function scheduledInstant(schedule: Schedule, timezone: string, now = new Date()) {
  if (schedule.timing === 'asap') return now;
  const wanted = `${schedule.date}T${schedule.time}:00Z`;
  let at = new Date(wanted);
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(at, timezone);
    const difference = new Date(wanted).getTime() - new Date(`${parts.date}T${parts.time}:00Z`).getTime();
    if (difference === 0) return at;
    at = new Date(at.getTime() + difference);
  }
  throw new MenuError('The selected time is invalid in the store timezone.');
}
export function scheduleMatches(schedule: ScheduleRow, at: Date) {
  let { date, time } = zonedParts(at, schedule.timezone);
  const start = schedule.startTime?.toISOString().slice(11, 16);
  const end = schedule.endTime?.toISOString().slice(11, 16);
  if (start && end) {
    if (start < end) { if (time < start || time >= end) return false; }
    else if (start > end) {
      if (time >= end && time < start) return false;
      if (time < end) date = new Date(new Date(`${date}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    }
    // Equal endpoints mean all day, matching the existing schema contract.
  }
  if (schedule.startDate && date < schedule.startDate.toISOString().slice(0, 10)) return false;
  if (schedule.endDate && date > schedule.endDate.toISOString().slice(0, 10)) return false;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return !Array.isArray(schedule.daysOfWeek) || schedule.daysOfWeek.includes(day);
}
export function availableBySchedule(schedules: ScheduleRow[], at: Date, mode = 'Delivery') {
  const relevant = schedules.filter(row => { const config = row.configuration as Record<string, unknown> | null; return config?.website !== false && config?.[mode === 'Pickup' ? 'takeaway' : mode === 'Delivery' ? 'delivery' : 'dineIn'] !== false; });
  if (relevant.some(row => row.scheduleType === 'exception' && scheduleMatches(row, at))) return false;
  const openings = relevant.filter(row => row.scheduleType !== 'exception');
  return schedules.every(row => row.scheduleType === 'exception') || openings.some(row => scheduleMatches(row, at));
}
const configEnabled = (configuration: unknown) => !configuration || typeof configuration !== 'object' || !('enabled' in configuration) || configuration.enabled !== false;
type Price = { variantId: string | null; currency: string; priceType: string; price: unknown; priority: number; startAt: Date | null; endAt: Date | null; id: string };
export function effectivePrice(prices: Price[], variantId: string | null, base: number, currency: string, mode: string, at: Date) {
  const applicable = prices.filter(row => row.currency === currency && ['base', 'variant', 'online', 'scheduled', mode.toLowerCase()].includes(row.priceType) && (!row.startAt || row.startAt <= at) && (!row.endAt || at < row.endAt));
  const candidates = applicable.filter(row => row.variantId === variantId);
  if (!candidates.length && variantId) candidates.push(...applicable.filter(row => row.variantId === null));
  candidates.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return candidates.length ? Number(candidates[0].price) : base;
}

export async function publicMenu(db: Prisma.TransactionClient, storeCode: string, currency: string, mode = 'Delivery', at = new Date()) {
  const live = { storeCode, archivedAt: null };
  const [offerRows, categories, items] = await Promise.all([
    db.menuOffer.findMany({ where: { ...live, isActive: true, AND: [{ OR: [{ startAt: null }, { startAt: { lte: at } }] }, { OR: [{ endAt: null }, { endAt: { gt: at } }] }] }, orderBy: [{ priority: 'desc' }, { id: 'asc' }] }),
    db.menuCategory.findMany({ where: { ...live, isActive: true, isVisible: true }, orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] }),
    db.menuItem.findMany({ where: { ...live, isVisible: true, isAvailable: true }, orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }], include: {
      categoryLinks: true,
      variants: { where: { archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { displayOrder: 'asc' }, { id: 'asc' }] },
      images: { where: { archivedAt: null, isActive: true }, orderBy: [{ isPrimary: 'desc' }, { displayOrder: 'asc' }] },
      prices: { where: { archivedAt: null, isActive: true } }, inventory: { where: { archivedAt: null } }, schedules: { where: { archivedAt: null, isActive: true } },
      modifierGroupLinks: { where: { archivedAt: null, group: { archivedAt: null, isActive: true } }, orderBy: { displayOrder: 'asc' }, include: { group: { include: { options: { where: { archivedAt: null, isAvailable: true }, orderBy: { displayOrder: 'asc' } } } } } },
      comboGroups: { where: { archivedAt: null }, orderBy: { displayOrder: 'asc' }, include: { options: { where: { archivedAt: null, isAvailable: true }, orderBy: { displayOrder: 'asc' } } } },
    } }),
  ]);
  const categoryIds = new Set(categories.map(row => row.id));
  const usable = new Map(items.filter(item => configEnabled(item.configuration) && (item.variants.length === 0 || item.variants.some(variant => variant.isAvailable)) && availableBySchedule(item.schedules, at, mode) && item.categoryLinks.some(link => categoryIds.has(link.categoryId))).map(item => [item.id, item]));
  function stock(item: typeof items[number], variantId: string | null, units = 1): StockRequirement[] {
    return item.inventory.filter(row => (row.configuration as Record<string, unknown> | null)?.active !== false).filter(row => row.variantId === null || row.variantId === variantId).filter(row => row.stockStatus === 'out_of_stock' || row.trackInventory).map(row => ({ key: row.id, available: row.stockStatus === 'out_of_stock' ? 0 : Number(row.quantityAvailable ?? 0), units, allowBackorder: row.stockStatus !== 'out_of_stock' && row.allowBackorder }));
  }
  function componentStock(item: typeof items[number], units = 1) {
    const variant = item.variants.find(row => row.isAvailable && row.isDefault) ?? item.variants.find(row => row.isAvailable);
    return stock(item, variant?.id ?? null, units);
  }
  function comboOptionPrice(option: { componentItemId: string | null; extraPrice: unknown; quantity: unknown; configuration: unknown }) {
    if ((option.configuration as Record<string, unknown> | null)?.useItemPrice !== true) return Number(option.extraPrice);
    const item = usable.get(option.componentItemId!)!;
    const variant = item.variants.find(row => row.isAvailable && row.isDefault) ?? item.variants.find(row => row.isAvailable);
    const price = effectivePrice(item.prices, variant?.id ?? null, Number(variant?.price ?? item.basePrice), currency, mode, at);
    return Math.round(price * Number(option.quantity) * 100) / 100;
  }
  const products: Product[] = [];
  for (const item of usable.values()) {
    const ids = item.categoryLinks.map(link => link.categoryId).filter(id => categoryIds.has(id));
    const gallery = item.images.map(image => image.imageUrl);
    if (!gallery.length) gallery.push(item.imageUrl || '/images/category-0.jpg');
    const product: Product = {
      id: item.id, name: item.itemName, description: item.description || '', price: effectivePrice(item.prices, null, Number(item.basePrice), currency, mode, at),
      image: gallery[0], gallery, categoryId: ids[0], categoryIds: ids, popular: item.isFeatured,
      minimumQuantity: item.minimumQuantity, maximumQuantity: item.maximumQuantity ?? 99,
      allowSpecialInstructions: item.allowSpecialInstructions, specialInstructionsMaxLength: item.specialInstructionsMaxLength,
      sizes: item.variants.length ? item.variants.filter(variant => variant.isAvailable).map(variant => ({ id: variant.id, name: variant.name, price: effectivePrice(item.prices, variant.id, Number(variant.price), currency, mode, at), stock: stock(item, variant.id) })) : [{ id: 'base', name: 'Regular', price: effectivePrice(item.prices, null, Number(item.basePrice), currency, mode, at), stock: stock(item, null) }],
      extras: [], optionGroups: [],
    };
    let invalid = false;
    for (const link of item.modifierGroupLinks) {
      if (link.variantId && !product.sizes.some(size => size.id === link.variantId)) continue;
      const group = link.group;
      const conditions = link.conditions as Record<string, unknown> | null;
      const allowed = Array.isArray(conditions?.allowedOptionIds) ? conditions.allowedOptionIds : null;
      const options = group.options.filter(option => (!allowed || allowed.includes(option.id)) && (!option.linkedItemId || usable.has(option.linkedItemId))).map(option => ({ id: `${link.id}:${option.id}`, name: option.name, price: Number(option.price), variantId: link.variantId, stock: option.linkedItemId ? componentStock(usable.get(option.linkedItemId)!) : [] }));
      const min = link.minSelectOverride ?? (link.isRequiredOverride === false ? 0 : link.isRequiredOverride === true ? Math.max(1, group.minSelect) : group.minSelect);
      const max = link.maxSelectOverride ?? group.maxSelect;
      if (min > options.length || max < min) { invalid = true; break; }
      product.extras.push(...options);
      product.optionGroups!.push({ id: link.id, name: group.name, min, max, variantId: link.variantId, options: options.map(option => option.id), defaults: group.options.filter(option => option.isDefault).map(option => `${link.id}:${option.id}`).filter(id => options.some(option => option.id === id)).slice(0, max) });
    }
    for (const group of item.comboGroups) {
      if (item.itemType !== 'combo') { invalid = true; break; }
      const options = group.options.filter(option => option.componentItemId && usable.has(option.componentItemId));
      if (group.selectionType === 'fixed') {
        if (options.length !== group.options.length || options.length < group.minSelect || options.length > group.maxSelect) { invalid = true; break; }
        product.description += ` Includes: ${options.map(option => `${Number(option.quantity)} × ${option.optionName}`).join(', ')}.`;
        for (const size of product.sizes) for (const option of options) {
          size.stock!.push(...componentStock(usable.get(option.componentItemId!)!, Number(option.quantity)));
          size.price = Math.round((size.price + comboOptionPrice(option)) * 100) / 100;
        }
      } else {
        const choices = options.map(option => ({ id: `combo:${option.id}`, name: `${Number(option.quantity)} × ${option.optionName}`, price: comboOptionPrice(option), stock: componentStock(usable.get(option.componentItemId!)!, Number(option.quantity)) }));
        if (choices.length < group.minSelect) { invalid = true; break; }
        product.extras.push(...choices);
        product.optionGroups!.push({ id: group.id, name: group.groupName, min: group.minSelect, max: group.maxSelect, variantId: null, options: choices.map(option => option.id), defaults: options.filter(option => option.isDefault).map(option => `combo:${option.id}`).slice(0, group.maxSelect) });
      }
    }
    product.sizes = product.sizes.filter(size => (size.stock ?? []).every(requirement => requirement.allowBackorder || Math.round(requirement.available * 1000) >= Math.round(requirement.units * item.minimumQuantity * 1000)));
    if (!invalid && product.sizes.length) { product.price = product.sizes[0].price; products.push(product); }
  }
  const offers = offerRows.filter(row => {
    const config = row.configuration as Record<string, unknown> | null;
    if (config?.website === false || Array.isArray(row.applicableChannels) && !row.applicableChannels.includes('website')) return false;
    const { date, time } = zonedParts(at, typeof config?.timezone === 'string' ? config.timezone : 'America/Los_Angeles');
    const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
    if (Array.isArray(config?.days) && !config.days.includes(day) && !config.days.includes(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1])) return false;
    const start = typeof config?.startTime === 'string' ? config.startTime : '';
    const end = typeof config?.endTime === 'string' ? config.endTime : '';
    return !start || !end || start === end || (start < end ? time >= start && time <= end : time >= start || time <= end);
  }).map(row => {
    const config = row.configuration as Record<string, unknown> | null;
    const itemIds = Array.isArray(row.applicableItems) ? row.applicableItems.filter((id): id is string => typeof id === 'string') : [];
    const categoryIds = Array.isArray(row.applicableCategories) ? row.applicableCategories.filter((id): id is string => typeof id === 'string') : [];
    const product = products.find(item => itemIds.includes(item.id) || categoryIds.some(id => item.categoryIds?.includes(id)));
    return { id: row.id, name: row.offerName, description: row.description || '', type: row.offerType, value: Number(row.discountValue || 0), code: row.offerCode || '', minimum: Number(row.minimumOrder || 0), maxDiscount: Number(row.maxDiscount || 0),
      image: typeof config?.image === 'string' ? config.image : '', productImage: product?.image || products[0]?.image || '/images/biryani.jpg',
      categoryId: categoryIds[0] || product?.categoryId || 'all', itemIds,
      scope: categoryIds.map(id => categories.find(category => category.id === id)?.categoryName).filter(Boolean).join(', ') || (itemIds.length ? product?.name || 'Selected items' : 'All orders'),
      buyQty: Number(config?.buyQty || 1), getQty: Number(config?.getQty || 1) };
  });
  return { offers, categories: [
    { id: 'all', name: 'All', image: '/images/all-menu.svg', menuCategoryId: 'all' },
    ...categories.map(row => ({ id: row.id, name: row.categoryName, image: row.imageUrl || '/images/category-0.jpg', menuCategoryId: row.id })),
  ], products };
}

export function validateCatalogCart(items: CartItem[]) {
  const stock = new Map<string, { available: number; required: number }>();
  for (const item of items) {
    const product = item.product;
    if (!Number.isInteger(item.quantity) || item.quantity < (product.minimumQuantity ?? 1) || item.quantity > (product.maximumQuantity ?? 99)) throw new MenuError(`Check the quantity for ${product.name}.`);
    const size = product.sizes.find(size => size.id === item.sizeId);
    if (!size) throw new MenuError(`${product.name}: selected variant is unavailable.`);
    if (!Array.isArray(item.extraIds) || new Set(item.extraIds).size !== item.extraIds.length || item.extraIds.some(id => !product.extras.some(extra => extra.id === id && (!extra.variantId || extra.variantId === item.sizeId)))) throw new MenuError(`${product.name}: selected options are unavailable.`);
    if (typeof item.instructions !== 'string' || item.instructions.length > (product.specialInstructionsMaxLength ?? 250) || (!product.allowSpecialInstructions && item.instructions)) throw new MenuError(`${product.name}: invalid special instructions.`);
    for (const group of product.optionGroups ?? []) {
      if (group.variantId && group.variantId !== item.sizeId) continue;
      const count = item.extraIds.filter(id => group.options.includes(id)).length;
      if (count < group.min || count > group.max) throw new MenuError(`${group.name}: choose ${group.min}–${group.max} options.`);
    }
    const needs = [...(size.stock ?? []), ...product.extras.filter(extra => item.extraIds.includes(extra.id)).flatMap(extra => extra.stock ?? [])];
    for (const requirement of needs) {
      const prior = stock.get(requirement.key);
      // Inventory is DECIMAL(12,3); compare whole thousandths to avoid 0.1 * 3 > 0.3.
      stock.set(requirement.key, { available: requirement.allowBackorder ? Infinity : Math.round(requirement.available * 1000), required: (prior?.required ?? 0) + Math.round(requirement.units * item.quantity * 1000) });
    }
  }
  for (const requirement of stock.values()) if (requirement.required > requirement.available) throw new MenuError('Your cart exceeds the available stock. Reduce quantities or remove unavailable items.');
}
