import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadMenuModule } from './menu-script-runtime.mjs';

const { lockMenu, saveMenuRecord, menuSnapshot } = loadMenuModule('lib/menu-db.ts');
const { blankMenuRecord, menuResources } = loadMenuModule('lib/menu-contract.ts');
const { legacyRows } = loadMenuModule('lib/menu-legacy-codec.ts');
const { publicMenu, validateCatalogCart } = loadMenuModule('lib/menu-public.ts');
const dollars = value => Math.round(value * 100) / 100;
const input = (resource, values) => ({ ...blankMenuRecord(resource, 'USD', 'America/Los_Angeles'), ...values });
const allDays = [1, 2, 3, 4, 5, 6, 7];

// Prices and recipes are editable menu content, not nutrition or legal claims.
const products = [
  ['CHEESEBURGER', 'Classic Cheeseburger', 'Burgers & Sandwiches', 10.99, 'non_veg', 'Grilled beef patty with American cheese, lettuce, tomato, pickles and house sauce on a toasted sesame bun.', ['milk', 'wheat', 'egg', 'sesame'], ['Single', 'Double'], 3, 'burger', 'burger', 15],
  ['BBQ-BACON-BURGER', 'BBQ Bacon Burger', 'Burgers & Sandwiches', 13.49, 'non_veg', 'Beef patty topped with smoky bacon, cheddar, crispy onions and barbecue sauce on a toasted bun.', ['milk', 'wheat', 'egg'], ['Single', 'Double'], 3.5, 'burger', 'burger', 18],
  ['CHICKEN-SANDWICH', 'Crispy Chicken Sandwich', 'Burgers & Sandwiches', 11.49, 'non_veg', 'Crispy breaded chicken breast with lettuce, pickles and creamy mayonnaise on a toasted bun.', ['wheat', 'egg', 'milk'], ['Regular', 'Large'], 2.5, 'chicken', 'sandwich', 18],
  ['BUFFALO-WINGS', 'Buffalo Wings', 'Wings & Pizza', 9.99, 'non_veg', 'Crispy chicken wings tossed in tangy Buffalo sauce, served with celery and ranch dip.', ['milk', 'egg'], ['6 Pieces', '12 Pieces'], 7, 'sauce', 'wings', 20],
  ['PEPPERONI-PIZZA', 'Pepperoni Pizza', 'Wings & Pizza', 15.99, 'non_veg', 'Hand-stretched crust with tomato sauce, mozzarella and beef-and-pork pepperoni, baked until golden.', ['wheat', 'milk'], ['12 inch', '16 inch'], 5, 'pizza', 'pizza', 25],
  ['BEEF-HOT-DOG', 'All-Beef Hot Dog', 'Burgers & Sandwiches', 7.49, 'non_veg', 'Grilled all-beef hot dog in a soft bun with yellow mustard, ketchup and diced onions.', ['wheat'], ['Classic', 'Footlong'], 3, 'hotdog', 'hotdog', 10],
  ['MAC-CHEESE', 'Mac & Cheese', 'Sides & Salads', 6.99, 'veg', 'Elbow pasta folded into creamy cheddar sauce and finished with toasted buttery breadcrumbs.', ['wheat', 'milk'], ['Regular', 'Large'], 2.5, 'sides', 'mac', 12],
  ['FRENCH-FRIES', 'French Fries', 'Sides & Salads', 3.99, 'veg', 'Golden shoestring potatoes, lightly salted and served crisp with ketchup on the side.', [], ['Regular', 'Large'], 1.5, 'sides', 'fries', 8],
  ['ONION-RINGS', 'Onion Rings', 'Sides & Salads', 5.49, 'veg', 'Thick-cut onion rings in a crunchy seasoned batter, served with smoky dipping sauce.', ['wheat', 'milk'], ['Regular', 'Large'], 2, 'sauce', 'rings', 10],
  ['CAESAR-SALAD', 'Caesar Salad', 'Sides & Salads', 8.99, 'non_veg', 'Crisp romaine with Parmesan, garlic croutons and classic Caesar dressing containing egg and anchovy.', ['wheat', 'milk', 'egg', 'fish'], ['Side', 'Entrée'], 3, 'salad', 'salad', 10],
  ['NY-CHEESECAKE', 'New York Cheesecake', 'Desserts & Shakes', 6.49, 'veg', 'Rich baked cream-cheese filling on a buttery graham-cracker crust, finished with strawberry sauce.', ['milk', 'wheat', 'egg'], ['Slice', 'Two Slices'], 5.5, 'dessert', 'cake', 5],
  ['CHOCOLATE-SHAKE', 'Chocolate Milkshake', 'Desserts & Shakes', 5.99, 'veg', 'Chocolate ice cream blended with whole milk and chocolate syrup, topped with whipped cream.', ['milk'], ['16 oz', '24 oz'], 2, 'shake', 'shake', 5],
  ['BURGER-MEAL', 'Cheeseburger Meal', 'Meal Combos', 18.49, 'non_veg', 'One classic cheeseburger, one regular French fries and one 16 oz chocolate milkshake.', ['milk', 'wheat', 'egg', 'sesame'], ['Meal'], 0, 'burger', 'combo', 18],
  ['CHICKEN-MEAL', 'Crispy Chicken Meal', 'Meal Combos', 19.49, 'non_veg', 'One crispy chicken sandwich, one regular French fries and one 16 oz chocolate milkshake.', ['milk', 'wheat', 'egg'], ['Meal'], 0, 'chicken', 'combo', 20],
  ['WINGS-COMBO', 'Buffalo Wings Combo', 'Meal Combos', 18.99, 'non_veg', 'Six Buffalo wings and a 16 oz chocolate milkshake, plus your choice of French fries or onion rings.', ['milk', 'egg', 'wheat'], ['Meal'], 0, 'sauce', 'combo', 22],
].map(([key, name, category, price, food, description, allergens, sizes, extra, modifiers, artwork, prep], order) => ({ key, sku: `US-${key}`, name, category, price, food, description, allergens, sizes, extra, modifiers, artwork, prep, order }));

// Local vector artwork gives every item a durable image without third-party URLs.
const art = {
  burger: '<path d="M95 126a65 55 0 0 1 130 0" fill="#e7a447"/><path d="M88 138h144l-12 18H100z" fill="#63a844"/><rect x="90" y="154" width="140" height="22" rx="10" fill="#754531"/><path d="M95 173h130l-20 17-25-10-25 12-25-10-25 9z" fill="#ffcf52"/><rect x="95" y="187" width="130" height="25" rx="12" fill="#dfa052"/>',
  sandwich: '<path d="M95 126a65 55 0 0 1 130 0" fill="#e7a447"/><path d="M88 140h144l-15 17H103z" fill="#5b9c44"/><rect x="92" y="157" width="136" height="27" rx="12" fill="#c98832"/><rect x="95" y="190" width="130" height="23" rx="11" fill="#e7a447"/>',
  wings: '<path d="M85 155q30-55 65-20t-20 55q-35 28-45-35" fill="#bd542f"/><path d="M170 125q45-15 62 23t-36 52q-45-10-26-75" fill="#d56b37"/><path d="M90 215l25-15m95 10 25-20" stroke="#6b9f54" stroke-width="10"/>',
  pizza: '<circle cx="160" cy="156" r="82" fill="#d49a4e"/><circle cx="160" cy="156" r="70" fill="#d96845"/><circle cx="160" cy="156" r="62" fill="#f2c35b"/><g fill="#b54336"><circle cx="132" cy="126" r="16"/><circle cx="190" cy="133" r="16"/><circle cx="157" cy="187" r="16"/><circle cx="112" cy="174" r="12"/><circle cx="204" cy="181" r="12"/></g>',
  hotdog: '<rect x="68" y="116" width="186" height="85" rx="42" fill="#e7ae63" transform="rotate(-15 160 160)"/><rect x="80" y="139" width="162" height="35" rx="17" fill="#a94a31" transform="rotate(-15 160 160)"/><path d="M95 171q5-30 25-10t25-10 25-8 25-8 25-9" fill="none" stroke="#ffd34f" stroke-width="8"/>',
  mac: '<path d="M75 136h170l-24 77H99z" fill="#52879c"/><ellipse cx="160" cy="137" rx="85" ry="38" fill="#e9bd63"/><g stroke="#f5df8d" stroke-width="13" fill="none"><path d="M104 126q-6 20 16 20m12-35q25 2 16 22m17-17q-12 14 8 25m17-24q25 3 20 22m-74 1q12 18 27 5"/></g>',
  fries: '<g stroke="#edbd54" stroke-width="17"><path d="M110 164l-12-75m35 77-2-90m26 95 5-94m20 91 14-84m8 91 20-67"/></g><path d="M91 150h138l-20 83H111z" fill="#c95642"/><path d="M120 187h80" stroke="#f6e3bc" stroke-width="8"/>',
  rings: '<g fill="none" stroke="#d8a24e" stroke-width="18"><ellipse cx="124" cy="131" rx="33" ry="24"/><ellipse cx="191" cy="139" rx="35" ry="27"/><ellipse cx="125" cy="192" rx="34" ry="25"/><ellipse cx="193" cy="198" rx="32" ry="23"/><ellipse cx="158" cy="164" rx="35" ry="25"/></g>',
  salad: '<path d="M72 145h176q-15 90-88 90t-88-90" fill="#6e9d9a"/><ellipse cx="160" cy="145" rx="88" ry="43" fill="#639b49"/><g fill="#95ba64"><ellipse cx="119" cy="139" rx="23" ry="14"/><ellipse cx="168" cy="124" rx="24" ry="16"/><ellipse cx="203" cy="151" rx="21" ry="16"/><ellipse cx="148" cy="164" rx="27" ry="13"/></g><g fill="#e4bd78"><path d="M112 119h18v17h-18zM174 145h18v17h-18zM137 150h14v14h-14z"/></g>',
  cake: '<path d="M94 190l127-36-15 57-112 20z" fill="#bc8857"/><path d="M94 122l127 32-15 49-112 20z" fill="#f1ddb0"/><path d="M94 122l112-38 15 70z" fill="#fff0cf"/><path d="M111 119l85-29 15 59z" fill="#c95450"/>',
  shake: '<path d="M110 127h100l-15 108h-70z" fill="#885e4c"/><path d="M130 129l8 100m24-100v100m24-100-8 100" stroke="#b5886d" stroke-width="5"/><path d="M104 125q-4-22 20-24-5-23 23-23 10-26 29-6 27-4 25 21 24 10 14 32z" fill="#fff4dc"/><path d="M186 87l22-44" stroke="#b8554e" stroke-width="9"/>',
};
art.combo = `<g transform="translate(-25 5) scale(.8)">${art.burger}</g><g transform="translate(122 25) scale(.6)">${art.fries}</g><g transform="translate(142 28) scale(.65)">${art.shake}</g>`;
fs.mkdirSync('public/images/american-menu', { recursive: true });
for (const product of products) {
  product.image = `/images/american-menu/${product.key.toLowerCase()}.svg`;
  const file = `public${product.image}`;
  if (!fs.existsSync(file)) fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 280" role="img"><title>${product.name.replaceAll('&', '&amp;')}</title><rect width="320" height="280" rx="22" fill="#f7efe2"/><ellipse cx="160" cy="231" rx="111" ry="15" fill="#e4d8c6"/>${art[product.artwork]}</svg>`);
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  const stores = await db.store.findMany({ where: { ...(process.argv[2] ? { store_code: process.argv[2] } : {}), OR: [{ is_delete: false }, { is_delete: null }] } });
  assert.equal(stores.length, 1, 'Pass the target store code as the first argument.');
  const storeCode = stores[0].store_code;
  const admin = await db.admin.findFirst({ where: { storeCode: stores[0].company_code ?? storeCode } });
  assert.ok(admin, 'A store/company admin is required.');
  const result = await db.$transaction(async tx => {
    await lockMenu(tx, storeCode);
    let created = 0;
    const ensure = async (resource, where, values) => {
      const old = await tx[menuResources[resource].model].findFirst({ where: { storeCode, archivedAt: null, ...where } });
      if (old) return old;
      const row = await saveMenuRecord(tx, storeCode, admin.id, resource, input(resource, values));
      if (resource === 'items' || resource === 'combo-items') created++;
      return row;
    };
    const categoryRows = new Map();
    for (const [index, name] of [...new Set(products.map(product => product.category))].entries()) {
      const representative = products.find(product => product.category === name);
      const category = await ensure('categories', { categoryName: name }, { categoryName: name, description: `Explore our ${name.toLowerCase()}, prepared to order.`, imageUrl: representative.image, displayOrder: index + 2 });
      categoryRows.set(name, category);
      await ensure('seo-meta', { targetType: 'category', targetId: category.id }, { targetType: 'category', targetId: category.id, pageName: name, slug: `/menu/${name.toLowerCase().replaceAll(' & ', '-and-').replaceAll(' ', '-')}`, title: `${name} | American Favorites`, description: category.description, keywords: `${name.toLowerCase()}, American menu`, imageUrl: representative.image });
    }
    // An explicitly illustrative tax rule; the actual rate depends on the store.
    const tax = await ensure('tax-rules', { name: 'Menu Food Tax' }, { name: 'Menu Food Tax', ratePercent: 5, priceIncludesTax: false, configuration: { description: 'Illustrative food tax setting. Set the applicable store rate before taking real orders.', appliesTo: 'Food Items', rounding: 'No Rounding', receipt: true, delivery: true, takeaway: true } });
    const groupDefinitions = {
      burger: ['Burger Toppings', 'multiple', 0, 3, [['American Cheese', .99], ['Crispy Bacon', 1.99], ['Caramelized Onions', .75]]],
      chicken: ['Sandwich Extras', 'multiple', 0, 2, [['Pepper Jack Cheese', .99], ['Extra Pickles', .5], ['Spicy Mayo', .5]]],
      sauce: ['Dipping Sauces', 'single', 1, 1, [['Ranch', 0], ['Blue Cheese', .5], ['Barbecue Sauce', 0]]],
      pizza: ['Pizza Toppings', 'multiple', 0, 3, [['Extra Mozzarella', 1.99], ['Jalapeños', .99], ['Mushrooms', 1.49]]],
      hotdog: ['Hot Dog Toppings', 'multiple', 0, 3, [['Cheddar Sauce', .99], ['Pickle Relish', .5], ['Chili', 1.49]]],
      sides: ['Side Extras', 'multiple', 0, 2, [['Cheese Sauce', .99], ['Bacon Crumbles', 1.49], ['Garlic Seasoning', .5]]],
      salad: ['Salad Extras', 'multiple', 0, 2, [['Grilled Chicken', 3.49], ['Extra Parmesan', .99], ['Extra Croutons', .5]]],
      dessert: ['Dessert Toppings', 'multiple', 0, 2, [['Strawberry Sauce', .5], ['Chocolate Drizzle', .5], ['Whipped Cream', .75]]],
      shake: ['Milkshake Extras', 'multiple', 0, 2, [['Chocolate Chips', .75], ['Cookie Crumbles', .99], ['Caramel Drizzle', .5]]],
    };
    const groups = new Map();
    for (const [key, [name, selectionType, minSelect, maxSelect, options]] of Object.entries(groupDefinitions)) {
      const group = await ensure('modifier-groups', { name }, { name, description: `Customize your order with ${name.toLowerCase()}.`, selectionType, minSelect, maxSelect, configuration: { image: products.find(product => product.modifiers === key).image } });
      for (const [index, [name, price]] of options.entries()) await ensure('modifier-options', { modifierGroupId: group.id, name }, { modifierGroupId: group.id, name, price, isDefault: selectionType === 'single' && index === 0, displayOrder: index, configuration: { image: products.find(product => product.modifiers === key).image } });
      groups.set(key, group);
    }
    const items = new Map();
    for (const product of products) {
      const isCombo = product.category === 'Meal Combos';
      const item = await ensure(isCombo ? 'combo-items' : 'items', { sku: product.sku }, {
        itemName: product.name, sku: product.sku, description: product.description, categoryIds: [categoryRows.get(product.category).id],
        itemType: isCombo ? 'combo' : 'regular', foodType: product.food, imageUrl: product.image, taxRuleId: tax.id,
        basePrice: product.price, comparePrice: dollars(product.price + (isCombo ? 3 : 2)), preparationTime: product.prep,
        displayOrder: product.order + 3, maximumQuantity: isCombo ? 5 : 10, allergens: product.allergens,
        tags: ['American', product.category, ...(isCombo ? ['meal deal'] : [])],
        metadata: { cuisine: 'American', portion: product.sizes[0], currency: 'USD' },
        configuration: { enabled: true, badge: isCombo ? 'Meal Deal' : product.order < 2 ? 'Bestseller' : '' }, isFeatured: product.order < 2 || isCombo,
      });
      items.set(product.key, item);
      for (const [index, name] of product.sizes.entries()) {
        const price = dollars(product.price + index * product.extra);
        const variant = await ensure('variants', { menuItemId: item.id, name }, { menuItemId: item.id, name, sku: `${product.sku}-${index + 1}`, price, comparePrice: dollars(price + 2), isDefault: index === 0, displayOrder: index, metadata: { portion: name }, configuration: { group: 'Size', image: product.image } });
        await ensure('pricing', { menuItemId: item.id, variantId: variant.id, priceType: 'variant', currency: 'USD' }, { menuItemId: item.id, variantId: variant.id, priceType: 'variant', currency: 'USD', price, comparePrice: dollars(price + 2) });
        await ensure('inventory', { menuItemId: item.id, variantId: variant.id }, { menuItemId: item.id, variantId: variant.id, trackInventory: !isCombo, quantityAvailable: isCombo ? null : 30, lowStockThreshold: 5, configuration: { unit: product.artwork === 'shake' ? 'Cup' : 'Portion', cost: dollars(price * .32), reorder: 15, alert: true, active: true } });
      }
      await ensure('inventory', { menuItemId: item.id, variantId: null }, { menuItemId: item.id, trackInventory: !isCombo, quantityAvailable: isCombo ? null : 60, lowStockThreshold: 10, configuration: { unit: product.artwork === 'shake' ? 'Cup' : 'Portion', cost: dollars(product.price * .32), reorder: 20, alert: true, active: true } });
      await ensure('images', { menuItemId: item.id, imageUrl: product.image }, { menuItemId: item.id, imageUrl: product.image, altText: `${product.name} illustration`, isPrimary: true });
      if (!isCombo) await ensure('modifier-links', { menuItemId: item.id, modifierGroupId: groups.get(product.modifiers).id }, { menuItemId: item.id, modifierGroupId: groups.get(product.modifiers).id });
      await ensure('schedules', { menuItemId: item.id }, { menuItemId: item.id, daysOfWeek: allDays, configuration: { name: `${product.name} Availability`, description: 'Available daily during store ordering hours.', delivery: true, takeaway: true, dineIn: true, website: true, app: true } });
      await ensure('pricing', { menuItemId: item.id, variantId: null, priceType: 'online', currency: 'USD' }, { menuItemId: item.id, currency: 'USD', priceType: 'online', price: product.price, comparePrice: dollars(product.price + 2), configuration: { legacyPrimary: true, type: 'Fixed Price', website: true, app: true, discounts: true } });
      await ensure('seo-meta', { targetType: 'item', targetId: item.id }, { targetType: 'item', targetId: item.id, pageName: product.name, title: `${product.name} | American Favorites`, slug: `/item/${product.key.toLowerCase()}`, description: product.description, keywords: `${product.name.toLowerCase()}, ${product.category.toLowerCase()}, American food`, imageUrl: product.image });
    }
    for (const [comboKey, componentKeys] of [['BURGER-MEAL', ['CHEESEBURGER', 'FRENCH-FRIES', 'CHOCOLATE-SHAKE']], ['CHICKEN-MEAL', ['CHICKEN-SANDWICH', 'FRENCH-FRIES', 'CHOCOLATE-SHAKE']], ['WINGS-COMBO', ['BUFFALO-WINGS', 'CHOCOLATE-SHAKE']]]) {
      const combo = items.get(comboKey);
      const group = await ensure('combo-groups', { comboItemId: combo.id, groupName: 'Included Items' }, { comboItemId: combo.id, groupName: 'Included Items', selectionType: 'fixed', minSelect: componentKeys.length, maxSelect: componentKeys.length, isRequired: true });
      for (const key of componentKeys) await ensure('combo-options', { comboGroupId: group.id, componentItemId: items.get(key).id }, { comboGroupId: group.id, componentItemId: items.get(key).id, optionName: items.get(key).itemName, quantity: 1, isDefault: true });
    }
    const wingSide = await ensure('combo-groups', { comboItemId: items.get('WINGS-COMBO').id, groupName: 'Choose Your Side' }, { comboItemId: items.get('WINGS-COMBO').id, groupName: 'Choose Your Side', selectionType: 'selectable', minSelect: 1, maxSelect: 1, isRequired: true, displayOrder: 1 });
    for (const [index, key] of ['FRENCH-FRIES', 'ONION-RINGS'].entries()) await ensure('combo-options', { comboGroupId: wingSide.id, componentItemId: items.get(key).id }, { comboGroupId: wingSide.id, componentItemId: items.get(key).id, optionName: items.get(key).itemName, quantity: 1, extraPrice: index ? 1 : 0, isDefault: index === 0 });
    await ensure('offers', { offerCode: 'BURGER10' }, { offerName: '10% Off Burgers', offerCode: 'BURGER10', offerType: 'percentage', discountValue: 10, minimumOrder: 15, maxDiscount: 5, couponRequired: true, perCustomerLimit: 1, applicableItems: [items.get('CHEESEBURGER').id, items.get('BBQ-BACON-BURGER').id], description: 'Use BURGER10 for 10% off burgers on orders of $15 or more. Maximum discount $5.', configuration: { scope: 'Selected Items', customer: 'All Customers', image: products[0].image, website: true, app: true } });
    await ensure('offers', { offerCode: 'MEAL3' }, { offerName: '$3 Off Meal Combos', offerCode: 'MEAL3', offerType: 'fixed', discountValue: 3, minimumOrder: 20, couponRequired: true, applicableCategories: [categoryRows.get('Meal Combos').id], description: 'Save $3 on meal combos with MEAL3 when your order reaches $20.', configuration: { scope: 'Selected Categories', customer: 'All Customers', image: products[12].image, website: true, app: true } });
    return { created, ids: [...items.values()].map(item => item.id) };
  }, { timeout: 60000 });

  const snapshot = await db.$transaction(tx => menuSnapshot(tx, storeCode), { isolationLevel: 'RepeatableRead', timeout: 20000 });
  const seeded = snapshot.items.filter(item => result.ids.includes(item.id));
  assert.equal(seeded.length, 15);
  for (const item of seeded) {
    for (const resource of ['variants', 'inventory', 'schedules', 'pricing', 'images']) assert.ok(snapshot[resource].some(row => row.menuItemId === item.id), `${item.itemName}: missing ${resource}`);
    assert.ok(snapshot['seo-meta'].some(row => row.targetId === item.id));
    assert.ok(item.taxRuleId && item.categoryIds.length && item.description && item.sku && item.maximumQuantity);
    assert.ok(fs.existsSync(`public${item.imageUrl}`));
    assert.ok(snapshot[item.itemType === 'combo' ? 'combo-groups' : 'modifier-links'].some(row => (row.comboItemId ?? row.menuItemId) === item.id));
  }
  for (const mode of ['Delivery', 'Pickup', 'Dine In']) {
    const catalog = await publicMenu(db, storeCode, 'USD', mode);
    for (const item of seeded) assert.ok(catalog.products.some(product => product.id === item.id), `${item.itemName} missing in ${mode}`);
    const burger = catalog.products.find(product => product.id === seeded.find(item => item.sku === 'US-CHEESEBURGER').id);
    assert.equal(burger.sizes.length, 2);
    assert.equal(burger.extras.length, 3);
    assert.equal(burger.sizes[0].price, 10.99);
    assert.equal(burger.sizes[1].price, 13.99);
    const wingsCombo = catalog.products.find(product => product.id === seeded.find(item => item.sku === 'US-WINGS-COMBO').id);
    assert.ok(wingsCombo.optionGroups.some(group => group.name === 'Choose Your Side' && group.min === 1));
    const cart = catalog.products.filter(product => result.ids.includes(product.id)).map(product => ({
      id: product.id, product, sizeId: product.sizes[0].id, quantity: 1, instructions: '',
      extraIds: product.optionGroups.flatMap(group => group.min ? group.defaults.length ? group.defaults : group.options.slice(0, group.min) : []),
    }));
    validateCatalogCart(cart);
    const comboLine = cart.find(line => line.product.id === wingsCombo.id);
    assert.throws(() => validateCatalogCart([{ ...comboLine, extraIds: [] }]), /Choose Your Side/);
  }
  const screenCounts = Object.fromEntries(['items', 'categories', 'variants', 'modifier-groups', 'combo-items', 'offers', 'tax-rules', 'inventory', 'schedules', 'pricing', 'seo-meta'].map(view => [view, legacyRows(snapshot, view).length]));
  assert.ok(Object.values(screenCounts).every(count => count > 0));
  console.log(JSON.stringify({ storeCode, created: result.created, americanItems: seeded.map(item => ({ name: item.itemName, price: Number(item.basePrice), type: item.itemType })), screenCounts, verified: 'All 15 items and relationships; all 11 admin screens; Delivery, Pickup and Dine In catalogs.' }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { await db.$disconnect(); }
