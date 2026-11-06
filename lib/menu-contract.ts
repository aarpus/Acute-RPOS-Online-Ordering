// Shared field allowlist: forms and server validation use the same contract.
export type MenuRecord = { id: string; updatedAt: string; [key: string]: unknown };
export type FieldSpec = {
  key: string; label: string; kind: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'reference' | 'references' | 'json' | 'date' | 'datetime' | 'time' | 'image';
  required?: boolean; default?: unknown; choices?: string[]; resource?: string; min?: number; max?: number; integer?: boolean; precision?: number; length?: number;
};
export type ResourceSpec = { model: string; label: string; name: string; fields: FieldSpec[]; toggle?: string };
const text = (key: string, label: string, required = false, length = 150): FieldSpec => ({ key, label, kind: 'text', required, length });
const num = (key: string, label: string, value: number | null = 0, integer = false): FieldSpec => ({ key, label, kind: 'number', default: value, required: value !== null, min: 0, integer, precision: integer ? 0 : 2 });
const flag = (key: string, label: string, value = true): FieldSpec => ({ key, label, kind: 'boolean', default: value, required: true });
const select = (key: string, label: string, choices: string[]): FieldSpec => ({ key, label, kind: 'select', choices, default: choices[0], required: true });
const ref = (key: string, label: string, resource: string, required = false): FieldSpec => ({ key, label, kind: 'reference', resource, required });
const refs = (key: string, label: string, resource: string): FieldSpec => ({ key, label, kind: 'references', resource, default: [] });
const json = (key: string, label: string, value: unknown = {}): FieldSpec => ({ key, label, kind: 'json', default: value });
const image: FieldSpec = { key: 'imageUrl', label: 'Image', kind: 'image' };
const description: FieldSpec = { key: 'description', label: 'Description', kind: 'textarea', length: 10000 };
const order = num('displayOrder', 'Display order', 0, true);
const active = flag('isActive', 'Active');
const configuration = json('configuration', 'Additional settings');
const external = (key: string) => text(key, 'External POS ID (optional)', false, 100);
const windowFields: FieldSpec[] = [{ key: 'startAt', label: 'Starts at', kind: 'datetime' }, { key: 'endAt', label: 'Ends at', kind: 'datetime' }];
const itemFields: FieldSpec[] = [text('itemName', 'Item name', true, 200), external('externalItemId'), text('sku', 'SKU', false, 100), description, image,
  select('itemType', 'Item type', ['regular', 'combo']), select('foodType', 'Food type', ['veg', 'non_veg', 'vegan', 'egg']),
  num('basePrice', 'Base price'), num('comparePrice', 'Compare price', null), ref('taxRuleId', 'Tax rule', 'tax-rules'),
  refs('categoryIds', 'Categories', 'categories'), flag('isFeatured', 'Featured', false), flag('isVisible', 'Visible on website'), flag('isAvailable', 'Available for order'), order,
  num('preparationTime', 'Preparation minutes', null, true), flag('allowSpecialInstructions', 'Allow special instructions'),
  num('specialInstructionsMaxLength', 'Instructions character limit', 250, true), { ...num('minimumQuantity', 'Minimum quantity', 1, true), min: 1 }, num('maximumQuantity', 'Maximum quantity', null, true),
  json('nutritionInfo', 'Nutrition'), json('allergens', 'Allergens', []), json('tags', 'Tags', []), json('metadata', 'Item metadata'), configuration];

export const menuResources: Record<string, ResourceSpec> = {
  items: { model: 'menuItem', label: 'Items', name: 'itemName', toggle: 'isAvailable', fields: itemFields },
  'combo-items': { model: 'menuItem', label: 'Combo Master', name: 'itemName', toggle: 'isAvailable', fields: itemFields },
  categories: { model: 'menuCategory', label: 'Categories', name: 'categoryName', toggle: 'isActive', fields: [text('categoryName', 'Category name', true), external('externalCategoryId'), description, image, order, flag('isVisible', 'Visible on website'), active, configuration] },
  variants: { model: 'menuItemVariant', label: 'Variants', name: 'name', toggle: 'isAvailable', fields: [ref('menuItemId', 'Item', 'items', true), text('name', 'Variant name', true), external('externalVariantId'), text('sku', 'SKU', false, 100), num('price', 'Price'), num('comparePrice', 'Compare price', null), flag('isDefault', 'Default variant', false), flag('isAvailable', 'Available'), order, json('metadata', 'Variant metadata (group, image)'), configuration] },
  'modifier-groups': { model: 'menuModifierGroup', label: 'Modifier Groups', name: 'name', toggle: 'isActive', fields: [text('name', 'Group name', true), external('externalGroupId'), description, select('selectionType', 'Selection type', ['single', 'multiple']), num('minSelect', 'Minimum selections', 0, true), num('maxSelect', 'Maximum selections', 1, true), flag('allowOptionQuantity', 'Allow option quantity', false), order, active, json('rules', 'Selection rules'), configuration] },
  'modifier-options': { model: 'menuModifierOption', label: 'Modifier Options', name: 'name', toggle: 'isAvailable', fields: [ref('modifierGroupId', 'Modifier group', 'modifier-groups', true), text('name', 'Option name', true), external('externalOptionId'), num('price', 'Additional price'), flag('isDefault', 'Selected by default', false), flag('isAvailable', 'Available'), num('minQuantity', 'Minimum quantity', 0, true), num('maxQuantity', 'Maximum quantity', 1, true), order, ref('linkedItemId', 'Linked item', 'items'), json('metadata', 'Option metadata'), configuration] },
  'modifier-links': { model: 'menuItemModifierGroup', label: 'Item Modifier Groups', name: 'modifierGroupId', fields: [ref('menuItemId', 'Item', 'items', true), ref('modifierGroupId', 'Modifier group', 'modifier-groups', true), ref('variantId', 'Variant (optional)', 'variants'), { ...flag('isRequiredOverride', 'Required override', false), default: null, required: false }, num('minSelectOverride', 'Minimum override', null, true), num('maxSelectOverride', 'Maximum override', null, true), order, json('conditions', 'Conditions'), configuration] },
  'combo-groups': { model: 'menuComboGroup', label: 'Combo Groups', name: 'groupName', fields: [ref('comboItemId', 'Combo item', 'combo-items', true), text('groupName', 'Group name', true), external('externalGroupId'), select('selectionType', 'Selection type', ['fixed', 'selectable']), num('minSelect', 'Minimum selections', 0, true), num('maxSelect', 'Maximum selections', 1, true), flag('isRequired', 'Required', false), order, json('rules', 'Group rules'), configuration] },
  'combo-options': { model: 'menuComboOption', label: 'Combo Options', name: 'optionName', toggle: 'isAvailable', fields: [ref('comboGroupId', 'Combo group', 'combo-groups', true), ref('componentItemId', 'Included item', 'items', true), text('optionName', 'Option name', true), external('externalOptionId'), text('externalComponentItemId', 'External component ID', false, 100), { ...num('quantity', 'Included quantity', 1), min: 0.001, precision: 3 }, { ...num('extraPrice', 'Extra price'), required: false }, flag('isDefault', 'Included by default', true), flag('isAvailable', 'Available'), order, configuration] },
  offers: { model: 'menuOffer', label: 'Offers', name: 'offerName', toggle: 'isActive', fields: [text('offerName', 'Offer name', true, 200), external('externalOfferId'), text('offerCode', 'Coupon code', false, 100), description, select('offerType', 'Offer type', ['percentage', 'fixed', 'bogo', 'buy_x_get_y', 'combo_discount', 'category_discount', 'product_discount', 'variant_discount', 'coupon', 'first_order', 'minimum_cart', 'free_delivery', 'happy_hour', 'scheduled', 'customer_specific']), num('discountValue', 'Discount value', null), num('maxDiscount', 'Maximum discount', null), num('minimumOrder', 'Minimum order', null), flag('couponRequired', 'Coupon required', false), ...windowFields, num('priority', 'Priority', 0, true), flag('isStackable', 'Allow stacking', false), num('usageLimit', 'Usage limit', null, true), num('perCustomerLimit', 'Per customer limit', null, true), json('applicableChannels', 'Channels', ['website']), refs('applicableItems', 'Applicable items', 'items'), refs('applicableCategories', 'Applicable categories', 'categories'), json('conditions', 'Conditions (customer, schedule, minimum items)'), json('rewards', 'Rewards (buy/get quantities)'), active, configuration] },
  'tax-rules': { model: 'menuTaxRule', label: 'Tax Rules', name: 'name', toggle: 'isActive', fields: [text('name', 'Tax name', true), external('externalTaxId'), { ...num('ratePercent', 'Tax percentage'), max: 100, precision: 4 }, flag('priceIncludesTax', 'Price includes tax', false), active, configuration] },
  inventory: { model: 'menuItemInventory', label: 'Inventory', name: 'menuItemId', fields: [ref('menuItemId', 'Item', 'items', true), ref('variantId', 'Variant (optional)', 'variants'), flag('trackInventory', 'Track stock', false), { ...num('quantityAvailable', 'Quantity available', null), min: -999999999, precision: 3 }, { ...num('lowStockThreshold', 'Low stock threshold', null), precision: 3 }, flag('allowBackorder', 'Allow backorder', false), select('stockStatus', 'Stock status', ['in_stock', 'low_stock', 'out_of_stock', 'backorder']), configuration] },
  schedules: { model: 'menuItemSchedule', label: 'Schedules', name: 'menuItemId', toggle: 'isActive', fields: [ref('menuItemId', 'Item', 'items', true), text('timezone', 'IANA timezone', true, 100), json('daysOfWeek', 'Days (1=Monday, 7=Sunday)', [1, 2, 3, 4, 5, 6, 7]), { key: 'startTime', label: 'Start time', kind: 'time' }, { key: 'endTime', label: 'End time', kind: 'time' }, { key: 'startDate', label: 'Start date', kind: 'date' }, { key: 'endDate', label: 'End date', kind: 'date' }, active, select('scheduleType', 'Schedule type', ['recurring', 'date_range', 'exception']), configuration] },
  pricing: { model: 'menuItemPrice', label: 'Pricing', name: 'menuItemId', toggle: 'isActive', fields: [ref('menuItemId', 'Item', 'items', true), ref('variantId', 'Variant (optional)', 'variants'), select('priceType', 'Price type', ['online', 'base', 'variant', 'pickup', 'delivery', 'dine_in', 'scheduled']), text('currency', 'Currency', true, 3), num('price', 'Price'), num('comparePrice', 'Compare price', null), ...windowFields, num('priority', 'Priority', 0, true), active, configuration] },
  images: { model: 'menuItemImage', label: 'Item Images', name: 'imageUrl', toggle: 'isActive', fields: [ref('menuItemId', 'Item', 'items', true), { ...image, required: true }, text('altText', 'Alt text', false, 250), external('externalImageId'), order, flag('isPrimary', 'Primary image', false), active, configuration] },
  'seo-meta': { model: 'menuSeo', label: 'SEO & Meta', name: 'pageName', toggle: 'isActive', fields: [select('targetType', 'Target type', ['page', 'item', 'category']), text('targetId', 'Target ID (page path or item/category UUID)', true, 200), text('pageName', 'Page name', true, 200), text('slug', 'URL path', true, 250), text('title', 'SEO title', true, 250), description, text('keywords', 'Keywords', false, 2000), text('canonicalUrl', 'Canonical URL', false, 2000), image, active, configuration] },
};

export function blankMenuRecord(resource: string, currency = 'USD', timezone = 'America/Los_Angeles'): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of menuResources[resource].fields) record[field.key] = field.default ?? (field.kind === 'boolean' ? null : '');
  if (resource === 'combo-items') record.itemType = 'combo';
  if (resource === 'pricing') record.currency = currency;
  if (resource === 'schedules') record.timezone = timezone;
  return record;
}

export type MenuConfiguration = {
  badge?: string; enabled?: boolean; image?: string; description?: string; group?: string;
  showOnWebsite?: boolean; showInApp?: boolean; allowDiscounts?: boolean;
  notifyLowStock?: boolean; hideWhenOutOfStock?: boolean; autoDisable?: boolean;
  syncStock?: boolean; rounding?: string; showOnReceipt?: boolean;
  delivery?: boolean; takeaway?: boolean; [key: string]: unknown;
};

// Presentation/settings fields from the original screens which have no scalar
// column live in the owning row's configuration JSON, rather than a demo list.
export const menuConfigurationFields: Record<string, FieldSpec[]> = {
  items: [flag('enabled', 'Enabled'), text('badge', 'Badge text')],
  'combo-items': [flag('enabled', 'Enabled'), text('badge', 'Badge text')],
  variants: [select('group', 'Size group', ['Size', 'Portion', 'Serving']), { ...image, key: 'image', label: 'Variant image' }],
  'modifier-groups': [{ ...image, key: 'image', label: 'Group image' }],
  'modifier-options': [{ ...image, key: 'image', label: 'Option image' }],
  offers: [{ ...image, key: 'image', label: 'Offer image' }, flag('website', 'Show on website'), flag('app', 'Show in app'), num('buyQty', 'Buy quantity', 1, true), num('getQty', 'Get quantity', 1, true), num('minItems', 'Minimum cart items', 1, true), select('customer', 'Customer eligibility', ['All Customers', 'New Customers', 'Existing Customers']), select('scope', 'Applies to', ['All Items', 'Selected Items', 'Selected Categories']), json('days', 'Offer days', [1, 2, 3, 4, 5, 6, 7]), { key: 'startTime', label: 'Offer start time', kind: 'time' }, { key: 'endTime', label: 'Offer end time', kind: 'time' }],
  'tax-rules': [description, select('appliesTo', 'Applies to', ['All Items', 'Food Items', 'Beverage Items', 'Alcohol Items', 'Takeaway Orders']), select('rounding', 'Rounding', ['No Rounding', 'Round Up', 'Round Down']), order, flag('receipt', 'Show on receipt'), flag('delivery', 'Delivery'), flag('takeaway', 'Takeaway')],
  inventory: [select('unit', 'Stock unit', ['Plate', 'Can', 'Bottle', 'Piece', 'Cup', 'Portion', 'Kg']), num('reorder', 'Reorder level'), num('cost', 'Unit cost', null), text('email', 'Low-stock notification email', false, 255), flag('alert', 'Low-stock alert setting', false), flag('active', 'Stock record enabled')],
  schedules: [text('name', 'Schedule name'), description, { ...image, key: 'image', label: 'Schedule image' }, external('externalId'), num('priority', 'Priority', 0, true), flag('delivery', 'Delivery'), flag('takeaway', 'Takeaway'), flag('dineIn', 'Dine-in'), flag('website', 'Website'), flag('app', 'App'), flag('override', 'Override setting', false)],
  pricing: [select('type', 'Pricing display type', ['Fixed Price', 'Dynamic Pricing']), flag('website', 'Show on website'), flag('app', 'Show in app'), flag('discounts', 'Allow discounts setting'), flag('discountEnabled', 'Discount setting enabled', false), select('discountType', 'Discount setting type', ['Percentage', 'Fixed Amount']), num('discountValue', 'Discount setting value'), { key: 'discountStart', label: 'Discount start', kind: 'date' }, { key: 'discountEnd', label: 'Discount end', kind: 'date' }, flag('timeEnabled', 'Time price setting enabled', false), num('timePrice', 'Time price setting'), json('days', 'Pricing days', [1, 2, 3, 4, 5, 6, 7]), { key: 'start', label: 'Daily start time', kind: 'time' }, { key: 'end', label: 'Daily end time', kind: 'time' }],
};
