import fs from 'node:fs';
import path from 'node:path';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Use the same validation, defaults, and transactional writes as the admin form.
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  let outputText = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' });
  const names = [...outputText.matchAll(/export (?:async )?(?:function|class|const|let) (\w+)/g)].map(match => match[1]);
  outputText = outputText.replace(/^import \{(.*?)\} from ['"](.*?)['"];$/gm,
    (_, names, name) => `const {${names.replace(/ as /g, ': ')}} = require('${name}');`).replace(/^export /gm, '');
  outputText += `\nObject.assign(exports, {${names.join(',')}});`;
  new Function('require', 'module', 'exports', outputText)(
    name => name.startsWith('.') ? load(path.resolve(path.dirname(file), `${name}.ts`)) : require(name),
    module, module.exports,
  );
  return module.exports;
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const stores = await db.store.findMany({ where: { OR: [{ is_delete: false }, { is_delete: null }], ...(process.argv[2] ? { store_code: process.argv[2] } : {}) } });
  if (stores.length !== 1 || !stores[0].store_code) throw new Error('Pass one store code: node --env-file=.env scripts/seed-menu-demo.mjs <store-code>');
  const store = stores[0];
  const admin = await db.admin.findFirst({ where: { storeCode: store.company_code ?? store.store_code } });
  if (!admin) throw new Error('No admin found for this store/company.');
  const { lockMenu, saveMenuRecord, menuSnapshot } = load('lib/menu-db.ts');
  const { blankMenuRecord, menuResources } = load('lib/menu-contract.ts');
  const input = (resource, fields) => ({ ...blankMenuRecord(resource), ...fields });
  // Upgrade the original sample rows in place, preserving IDs and relationships.
  await db.$transaction(async tx => {
    await lockMenu(tx, store.store_code);
    const rename = async (resource, where, fields) => {
      const row = await tx[menuResources[resource].model].findFirst({ where: { storeCode: store.store_code, archivedAt: null, ...where } });
      if (row) await saveMenuRecord(tx, store.store_code, admin.id, resource, { ...fields, updatedAt: row.updatedAt.toISOString() }, row.id);
    };
    await rename('categories', { categoryName: 'Demo Specials' }, { categoryName: 'Main Course', description: 'Freshly prepared wraps and satisfying meal combos.', imageUrl: '/images/wrap.jpg' });
    await rename('categories', { categoryName: 'Demo Beverages' }, { categoryName: 'Beverages', description: 'Refreshing yogurt drinks served chilled.', imageUrl: '/images/lassi.jpg' });
    const products = [
      ['DEMO-PANEER-001', 'PANEER-WRAP-001', 'Paneer Wrap', 'Soft flatbread filled with grilled paneer, crisp vegetables and creamy mint sauce. Served warm.', ['vegetarian', 'wrap'], 'Popular'],
      ['DEMO-LASSI-001', 'MANGO-LASSI-001', 'Mango Lassi', 'A refreshing blend of ripe mango, creamy yogurt and a touch of cardamom. Served chilled.', ['mango', 'drink'], ''],
      ['DEMO-COMBO-001', 'WRAP-LASSI-COMBO-001', 'Paneer Wrap & Mango Lassi Combo', 'One regular paneer wrap and one chilled mango lassi. A complete vegetarian meal.', ['vegetarian', 'meal combo'], 'Combo'],
    ];
    for (const [oldSku, sku, itemName, description, tags, badge] of products) {
      await rename('items', { sku: oldSku }, { sku, itemName, description, tags, allergens: itemName === 'Mango Lassi' ? ['milk'] : ['milk', 'wheat'], maximumQuantity: 10, configuration: { enabled: true, badge } });
      const product = await tx.menuItem.findFirst({ where: { storeCode: store.store_code, sku, archivedAt: null } });
      if (!product) continue;
      await rename('seo-meta', { targetType: 'item', targetId: product.id }, { pageName: itemName, title: `${itemName} | Menu`, description, slug: `/item/${itemName.toLowerCase().replaceAll(' & ', '-and-').replaceAll(' ', '-')}`, keywords: `${itemName.toLowerCase()}, vegetarian, freshly prepared` });
      for (const [suffix, name] of [['REG', 'Regular'], ['LRG', 'Large']]) await rename('variants', { sku: `${oldSku}-${suffix}` }, { sku: `${sku}-${suffix}`, configuration: { group: 'Size', image: product.imageUrl }, metadata: { serving: name === 'Large' ? 'Generous portion' : 'Single serving' } });
      await rename('combo-options', { componentItemId: product.id, optionName: { startsWith: 'Demo ' } }, { optionName: itemName });
      await rename('images', { menuItemId: product.id, altText: 'Demo paneer wrap' }, { altText: 'Paneer wrap with vegetables and mint sauce' });
    }
    await rename('tax-rules', { name: 'Demo Tax 5%' }, { name: 'Food Tax 5%', configuration: { description: 'Food sales tax applied to menu items.', appliesTo: 'Food Items', rounding: 'No Rounding', receipt: true, delivery: true, takeaway: true } });
    await rename('modifier-groups', { name: 'Demo Wrap Extras' }, { name: 'Wrap Extras', description: 'Customize your wrap with cheese or a side of mint sauce.', configuration: { image: '/images/wrap.jpg' } });
    await rename('offers', { offerCode: 'DEMO10' }, { offerName: '10% Off Paneer Wrap', offerCode: 'WRAP10', description: 'Save 10% on Paneer Wrap with code WRAP10. Minimum order $10; maximum discount $5.' });
    await rename('schedules', { configuration: { path: ['name'], equals: 'Demo Daily Availability' } }, { configuration: { name: 'Daily Availability', description: 'Available every day for delivery, takeaway and dine-in.', delivery: true, takeaway: true, dineIn: true, website: true, app: true } });
    await rename('seo-meta', { slug: '/menu/demo-specials' }, { pageName: 'Main Course', slug: '/menu/main-course', title: 'Main Course | Menu', description: 'Explore freshly prepared paneer wraps and satisfying meal combos.', keywords: 'paneer wrap, vegetarian meals, combo' });
  }, { timeout: 20000 });
  const itemId = await db.$transaction(async tx => {
    await lockMenu(tx, store.store_code);
    const existing = await tx.menuItem.findFirst({ where: { storeCode: store.store_code, sku: 'PANEER-WRAP-001', archivedAt: null } });
    if (existing) return existing.id;
    const category = await tx.menuCategory.findFirst({ where: { storeCode: store.store_code, categoryName: 'Main Course', archivedAt: null } })
      ?? await saveMenuRecord(tx, store.store_code, admin.id, 'categories', input('categories', {
        categoryName: 'Main Course', description: 'Freshly prepared wraps and satisfying meal combos.',
      }));
    const item = await saveMenuRecord(tx, store.store_code, admin.id, 'items', input('items', {
      itemName: 'Paneer Wrap', sku: 'PANEER-WRAP-001',
      description: 'Soft flatbread filled with grilled paneer, crisp vegetables and creamy mint sauce. Served warm.',
      imageUrl: '/images/wrap.jpg', foodType: 'veg', basePrice: 9.99, comparePrice: 12.99,
      categoryIds: [category.id], preparationTime: 15, tags: ['vegetarian', 'wrap'], allergens: ['milk', 'wheat'],
      configuration: { enabled: true, badge: 'Popular' },
      children: {
        variants: [input('variants', { name: 'Regular', sku: 'PANEER-WRAP-001-REG', price: 9.99, comparePrice: 12.99, isDefault: true })],
        inventory: [input('inventory', { trackInventory: true, quantityAvailable: 25, lowStockThreshold: 5, configuration: { unit: 'Piece', active: true } })],
        images: [input('images', { imageUrl: '/images/wrap.jpg', altText: 'Paneer wrap with vegetables and mint sauce', isPrimary: true })],
      },
    }));
    return item.id;
  }, { timeout: 20000 });
  await db.$transaction(async tx => {
    await lockMenu(tx, store.store_code);
    const ensure = async (resource, where, fields) =>
      await tx[menuResources[resource].model].findFirst({ where: { storeCode: store.store_code, archivedAt: null, ...where } })
      ?? await saveMenuRecord(tx, store.store_code, admin.id, resource, input(resource, fields));
    const wrap = await tx.menuItem.findUniqueOrThrow({ where: { id: itemId } });
    const category = await tx.menuCategory.findFirstOrThrow({ where: { storeCode: store.store_code, categoryName: 'Main Course', archivedAt: null } });
    const beverages = await ensure('categories', { categoryName: 'Beverages' }, {
      categoryName: 'Beverages', description: 'Refreshing yogurt drinks served chilled.', imageUrl: '/images/lassi.jpg', displayOrder: 1,
    });
    const tax = await ensure('tax-rules', { name: 'Food Tax 5%' }, {
      name: 'Food Tax 5%', ratePercent: 5, priceIncludesTax: false,
      configuration: { description: 'Food sales tax applied to menu items.', appliesTo: 'All Items', rounding: 'No Rounding', receipt: true, delivery: true, takeaway: true },
    });
    if (!wrap.taxRuleId) await saveMenuRecord(tx, store.store_code, admin.id, 'items', { taxRuleId: tax.id, updatedAt: wrap.updatedAt.toISOString() }, wrap.id);
    const large = await ensure('variants', { menuItemId: itemId, name: 'Large' }, {
      menuItemId: itemId, name: 'Large', sku: 'PANEER-WRAP-001-LRG', price: 12.99, comparePrice: 15.99,
      displayOrder: 1, configuration: { group: 'Size', image: '/images/wrap.jpg' },
    });
    await ensure('inventory', { menuItemId: itemId, variantId: large.id }, {
      menuItemId: itemId, variantId: large.id, trackInventory: true, quantityAvailable: 10, lowStockThreshold: 3,
    });
    const drink = await ensure('items', { sku: 'MANGO-LASSI-001' }, {
      itemName: 'Mango Lassi', sku: 'MANGO-LASSI-001', foodType: 'veg',
      description: 'A refreshing blend of ripe mango, creamy yogurt and a touch of cardamom. Served chilled.', imageUrl: '/images/lassi.jpg',
      basePrice: 3.99, comparePrice: 4.99, categoryIds: [beverages.id], taxRuleId: tax.id,
      preparationTime: 5, allergens: ['milk'], tags: ['mango', 'drink'],
      children: { inventory: [input('inventory', { trackInventory: true, quantityAvailable: 30, lowStockThreshold: 5, configuration: { unit: 'Cup', active: true } })] },
    });
    const group = await ensure('modifier-groups', { name: 'Wrap Extras' }, {
      name: 'Wrap Extras', description: 'Choose up to two optional extras.', selectionType: 'multiple', minSelect: 0, maxSelect: 2,
    });
    for (const [name, price] of [['Extra Cheese', 1.5], ['Mint Sauce', 0.5]]) {
      await ensure('modifier-options', { modifierGroupId: group.id, name }, { modifierGroupId: group.id, name, price });
    }
    await ensure('modifier-links', { menuItemId: itemId, modifierGroupId: group.id }, {
      menuItemId: itemId, modifierGroupId: group.id, minSelectOverride: 0, maxSelectOverride: 2,
    });
    const combo = await ensure('combo-items', { sku: 'WRAP-LASSI-COMBO-001' }, {
      itemName: 'Paneer Wrap & Mango Lassi Combo', sku: 'WRAP-LASSI-COMBO-001', foodType: 'veg',
      description: 'One regular paneer wrap and one mango lassi.', imageUrl: '/images/wrap.jpg',
      basePrice: 12.49, comparePrice: 13.98, categoryIds: [category.id], taxRuleId: tax.id,
      preparationTime: 15, configuration: { enabled: true, badge: 'Combo' },
      children: { inventory: [input('inventory', { trackInventory: false, stockStatus: 'in_stock' })] },
    });
    const comboGroup = await ensure('combo-groups', { comboItemId: combo.id, groupName: 'Included in your meal' }, {
      comboItemId: combo.id, groupName: 'Included in your meal', selectionType: 'fixed', minSelect: 2, maxSelect: 2, isRequired: true,
    });
    for (const component of [wrap, drink]) await ensure('combo-options', { comboGroupId: comboGroup.id, componentItemId: component.id }, {
      comboGroupId: comboGroup.id, componentItemId: component.id, optionName: component.itemName, quantity: 1, isDefault: true,
    });
    await ensure('offers', { offerCode: 'WRAP10' }, {
      offerName: '10% Off Paneer Wrap', offerCode: 'WRAP10', offerType: 'percentage', discountValue: 10,
      minimumOrder: 10, maxDiscount: 5, couponRequired: true, perCustomerLimit: 1,
      applicableItems: [itemId], description: 'Save 10% on Paneer Wrap with code WRAP10. Minimum order $10; maximum discount $5.',
      configuration: { scope: 'Selected Items', customer: 'All Customers', website: true, app: true, image: '/images/wrap.jpg' },
    });
    await ensure('schedules', { menuItemId: itemId, configuration: { path: ['name'], equals: 'Daily Availability' } }, {
      menuItemId: itemId, timezone: 'America/Los_Angeles', daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      configuration: { name: 'Daily Availability', description: 'Available every day for delivery, takeaway and dine-in.', delivery: true, takeaway: true, dineIn: true, website: true, app: true },
    });
    for (const product of [wrap, drink, combo]) {
      const stock = await tx.menuItemInventory.findFirst({ where: { storeCode: store.store_code, menuItemId: product.id, variantId: null, archivedAt: null } });
      if (stock && stock.configuration?.cost == null) await saveMenuRecord(tx, store.store_code, admin.id, 'inventory', {
        updatedAt: stock.updatedAt.toISOString(),
        configuration: { ...stock.configuration, unit: product.id === drink.id ? 'Cup' : 'Piece', cost: product.id === drink.id ? 1.25 : product.id === combo.id ? 4.75 : 3.5, reorder: 10, alert: true, active: true },
      }, stock.id);
      await ensure('pricing', { menuItemId: product.id, variantId: null, priceType: 'online', currency: 'USD' }, {
        menuItemId: product.id, priceType: 'online', currency: 'USD', price: Number(product.basePrice), comparePrice: Number(product.comparePrice),
        configuration: { legacyPrimary: true, type: 'Fixed Price', website: true, app: true, discounts: true },
      });
      await ensure('seo-meta', { targetType: 'item', targetId: product.id }, {
        targetType: 'item', targetId: product.id, pageName: product.itemName, title: `${product.itemName} | Menu`,
        slug: `/item/${product.sku.toLowerCase()}`, description: product.description, keywords: 'paneer wrap, mango lassi, vegetarian food, meal combo', imageUrl: product.imageUrl,
      });
    }
    await ensure('seo-meta', { targetType: 'category', targetId: category.id }, {
      targetType: 'category', targetId: category.id, pageName: 'Main Course', slug: '/menu/main-course', title: 'Main Course | Menu', description: 'Explore freshly prepared paneer wraps and satisfying meal combos.',
    });
    await ensure('seo-meta', { targetType: 'page', targetId: '/menu' }, {
      targetType: 'page', targetId: '/menu', pageName: 'Menu', slug: '/menu', title: 'Explore Our Menu', description: 'Browse wraps, drinks and meal combos.',
    });
    await ensure('seo-meta', { targetType: 'category', targetId: beverages.id }, {
      targetType: 'category', targetId: beverages.id, pageName: 'Beverages', slug: '/menu/beverages', title: 'Refreshing Beverages | Menu',
      description: 'Enjoy chilled mango lassi made with ripe mango, yogurt and cardamom.', keywords: 'mango lassi, yogurt drink, beverages', imageUrl: '/images/lassi.jpg',
    });
    for (const [targetId, pageName, title, description] of [
      ['/', 'Home', 'Fresh Wraps, Lassi & Meal Combos', 'Explore freshly prepared vegetarian wraps, refreshing mango lassi and satisfying meal combos.'],
      ['/offers', 'Offers', 'Food Offers & Savings', 'Use WRAP10 to save 10% on Paneer Wrap. Minimum order $10; maximum discount $5.'],
      ['/about', 'About Us', 'About Our Kitchen', 'Discover our menu of freshly prepared vegetarian wraps, chilled yogurt drinks and complete meal combos.'],
      ['/contact', 'Contact Us', 'Contact Our Team', 'Get in touch with questions about menu items, ingredients, allergens or your order.'],
      ['/privacy-policy', 'Privacy Policy', 'Privacy Policy', 'Find information about how personal information is handled when browsing and ordering.'],
      ['/terms', 'Terms & Conditions', 'Ordering Terms & Conditions', 'Review the terms covering menu availability, pricing, offers and online orders.'],
      ['/faq', 'FAQ', 'Frequently Asked Questions', 'Find answers about wrap sizes, optional extras, food allergens, availability and meal combos.'],
    ]) await ensure('seo-meta', { targetType: 'page', targetId }, { targetType: 'page', targetId, pageName, slug: targetId, title, description, keywords: 'vegetarian wraps, mango lassi, online ordering', imageUrl: '/images/wrap.jpg' });
  }, { timeout: 20000 });
  const snapshot = await db.$transaction(tx => menuSnapshot(tx, store.store_code));
  const { legacyRows } = load('lib/menu-legacy-codec.ts');
  const screens = ['items', 'categories', 'variants', 'modifier-groups', 'combo-items', 'offers', 'tax-rules', 'inventory', 'schedules', 'pricing', 'seo-meta'];
  const screenCounts = Object.fromEntries(screens.map(view => [view, legacyRows(snapshot, view).length]));
  if (Object.values(screenCounts).some(count => count === 0)) throw new Error('A menu screen has no menu records.');
  const { publicMenu } = load('lib/menu-public.ts');
  const catalog = await publicMenu(db, store.store_code, 'USD');
  for (const sku of ['PANEER-WRAP-001', 'MANGO-LASSI-001', 'WRAP-LASSI-COMBO-001']) {
    const record = snapshot.items.find(item => item.sku === sku);
    if (!catalog.products.some(product => product.id === record?.id)) throw new Error(`Menu product is missing from the public menu: ${sku}`);
  }
  console.log('Verified menu screens:', JSON.stringify(screenCounts));
  // Read the committed rows back, including their relationships.
  const item = await db.menuItem.findUniqueOrThrow({ where: { id: itemId } });
  const variants = await db.menuItemVariant.findMany({ where: { menuItemId: itemId, archivedAt: null }, select: { name: true, price: true, isDefault: true } });
  const inventory = await db.menuItemInventory.findMany({ where: { menuItemId: itemId, archivedAt: null }, select: { quantityAvailable: true, lowStockThreshold: true } });
  const categories = await db.menuItemCategory.findMany({ where: { menuItemId: itemId }, select: { categoryId: true } });
  if (!variants.length || !inventory.length || !categories.length) throw new Error('Menu item relationships are incomplete.');
  console.log(JSON.stringify({ id: item.id, storeCode: item.storeCode, itemName: item.itemName, sku: item.sku, basePrice: item.basePrice, comparePrice: item.comparePrice, preparationTime: item.preparationTime, variants, inventory, categories }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
