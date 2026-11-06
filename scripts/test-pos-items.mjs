// Real scoped route handlers, PostgreSQL and authentication. Unique fixtures only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url), cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  let source = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'transform' });
  const names = [...source.matchAll(/export (?:async )?(?:function|class|const|let) (\w+)/g)].map(match => match[1]);
  source = source.replace(/^import \{([\s\S]*?)\} from ['"](.*?)['"];$/gm, (_, fields, name) => `const {${fields.replace(/ as /g, ': ')}} = require('${name}');`).replace(/^export \{(.*?)\} from ['"](.*?)['"];$/gm, (_, fields, name) => `Object.assign(exports, require('${name}'));`).replace(/^export /gm, '');
  source += `\nObject.assign(exports, {${names.join(',')}});`;
  new Function('require', 'exports', source)(name => name === 'cloudflare:workers' ? { env: process.env } : name.startsWith('.') ? load(resolve(dirname(file), name + '.ts')) : require(name), module.exports);
  return module.exports;
}
const { createPrismaClient } = load('lib/prisma.ts');
const { hashPosToken } = load('lib/pos-credentials.ts');
const combo = process.argv.includes('--combo');
const resource = combo ? 'combo-items' : 'items';
const payloadKey = combo ? 'combo_items' : 'items';
const itemType = combo ? 'combo' : 'regular';
const otherType = combo ? 'regular' : 'combo';
const syncType = combo ? 'MENU_COMBO_ITEM' : 'MENU_ITEM';
const { POST } = load(`app/api/pos/stores/[store_code]/${resource}/sync/route.ts`);
const { POST: otherTypePost } = load(`app/api/pos/stores/[store_code]/${combo ? 'items' : 'combo-items'}/sync/route.ts`);
const { POST: categories } = load('app/api/pos/stores/[store_code]/categories/sync/route.ts');
const { POST: taxes } = load('app/api/pos/stores/[store_code]/tax-rules/sync/route.ts');
const db = createPrismaClient(), tag = randomUUID().slice(0, 8);
const storeA = `QA_ITEM_A_${tag}`, storeB = `QA_ITEM_B_${tag}`;
const tokenA = `pos_${randomUUID()}_${tag}`, tokenB = `pos_${randomUUID()}_${tag}`;
const item = { external_item_id: 'BURGER', item_name: 'Veg Burger', base_price: 9.99, external_category_ids: ['CAT-BURGERS'], external_tax_id: 'TAX-SALES' };
let checks = 0;
const context = store => ({ params: Promise.resolve({ store_code: store }) });
function request(body, store = storeA, token = tokenA) {
  return new Request(`https://example.test/api/pos/stores/${store}/${resource}/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
}
async function send(id, items = [item], options = {}) {
  const store = options.store ?? storeA;
  const response = await POST(request({ request_id: id, [payloadKey]: items, ...options.body }, store, options.token ?? tokenA), context(store));
  return { response, body: await response.json() };
}
async function expect(id, items, status, options) {
  const value = await send(id, items, options);
  assert.equal(value.response.status, status, JSON.stringify(value.body)); checks++;
  return value;
}
const get = externalItemId => db.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode: storeA, externalItemId } } });
const links = id => db.menuItemCategory.findMany({ where: { storeCode: storeA, menuItemId: id }, orderBy: { displayOrder: 'asc' } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: storeA, tokenHash: hashPosToken(tokenA) }, { storeCode: storeB, tokenHash: hashPosToken(tokenB) }] });
  await expect('before-category', [item], 409);
  const seeded = await categories(request({ request_id: 'setup', categories: ['CAT-BURGERS', 'CAT-SPECIALS'].map((id, index) => ({ external_category_id: id, category_name: id, display_order: index })) }), context(storeA));
  assert.equal(seeded.status, 200, await seeded.clone().text());
  await expect('before-tax', [item], 409);
  const seededTax = await taxes(request({ request_id: 'setup', tax_rules: [{ external_tax_id: 'TAX-SALES', name: 'Sales Tax', rate_percent: 5 }] }), context(storeA));
  assert.equal(seededTax.status, 200, await seededTax.clone().text());
  const created = await expect('create', [{ ...item, sku: 'SKU-1', description: 'Fresh burger', image_url: '/images/burger.jpg', food_type: 'veg', compare_price: 12, maximum_quantity: 10, nutrition_info: { calories: 300 }, allergens: ['gluten'], tags: ['popular'], metadata: { custom: true }, configuration: { badge: 'New' } }], 200);
  assert.equal(created.body.inserted_count, 1); assert.equal(created.body.updated_count, 0);
  const original = await get('BURGER');
  assert.equal(original.sourceType, 'pos'); assert.equal(original.syncEnabled, true); assert.equal(original.itemType, itemType); assert.ok(original.lastSyncedAt instanceof Date);
  assert.equal(created.body.message, combo ? 'Combo items synchronized successfully' : 'Items synchronized successfully');
  const otherPayloadKey = combo ? 'items' : 'combo_items';
  const otherCreated = await otherTypePost(request({ request_id: 'create', [otherPayloadKey]: [{ ...item, external_item_id: 'OTHER-TYPE' }] }), context(storeA));
  assert.equal(otherCreated.status, 200, await otherCreated.clone().text());
  assert.equal((await get('OTHER-TYPE')).itemType, otherType, 'Regular/combo request replay scopes are independent');
  const typeConflict = await otherTypePost(request({ request_id: 'type-conflict', [otherPayloadKey]: [item] }), context(storeA));
  assert.equal(typeConflict.status, 409, 'Neither endpoint may convert the other item type');
  assert.equal(Number(original.basePrice), 9.99); assert.equal(original.foodType, 'veg'); assert.ok(original.taxRuleId);
  const originalLinks = await links(original.id); assert.equal(originalLinks.length, 1);
  await db.menuItemVariant.create({ data: { storeCode: storeA, menuItemId: original.id, name: 'Large', price: 15 } });
  if (combo) {
    const component = await db.menuItem.create({ data: { storeCode: storeA, externalItemId: 'COMPONENT', itemName: 'Included component' } });
    const group = await db.menuComboGroup.create({ data: { storeCode: storeA, comboItemId: original.id, groupName: 'Included items', externalGroupId: 'COMBO-GROUP' } });
    await db.menuComboOption.create({ data: { storeCode: storeA, comboGroupId: group.id, componentItemId: component.id, optionName: 'Included component' } });
  }
  const update = await expect('update', [{ external_item_id: 'BURGER', item_name: 'Updated Burger', base_price: 10.99 }], 200);
  assert.equal(update.body.updated_count, 1); assert.equal(update.body.inserted_count, 0);
  let current = await get('BURGER'); assert.equal(current.id, original.id); assert.equal(current.taxRuleId, original.taxRuleId); assert.equal(current.sku, 'SKU-1'); assert.equal(current.maximumQuantity, 10); assert.deepEqual(current.tags, ['popular']);
  assert.deepEqual((await links(original.id)).map(link => link.categoryId), originalLinks.map(link => link.categoryId));
  assert.equal(await db.menuItemVariant.count({ where: { storeCode: storeA, menuItemId: original.id } }), 1);
  if (combo) {
    const groups = await db.menuComboGroup.findMany({ where: { storeCode: storeA, comboItemId: original.id }, include: { options: true } });
    assert.equal(groups.length, 1); assert.equal(groups[0].options.length, 1);
    for (const field of ['combo_groups', 'combo_options', 'groups', 'children']) await expect('nested-' + field, [{ ...item, [field]: [] }], 400);
  }
  const replay = await expect('update', [item], 200); assert.deepEqual(replay.body, update.body); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true');
  assert.equal((await get('BURGER')).itemName, 'Updated Burger');
  await expect('change-categories', [{ external_item_id: 'BURGER', item_name: 'Updated Burger', external_category_ids: ['CAT-SPECIALS', 'CAT-BURGERS'], external_tax_id: null, description: null, image_url: null, compare_price: null, food_type: null, metadata: null, tags: null }], 200);
  const updatedLinks = await links(original.id); assert.equal(updatedLinks.length, 2);
  const specials = await db.menuCategory.findUnique({ where: { storeCode_externalCategoryId: { storeCode: storeA, externalCategoryId: 'CAT-SPECIALS' } } });
  assert.equal(updatedLinks[0].categoryId, specials.id);
  current = await get('BURGER'); assert.equal(current.taxRuleId, null); assert.equal(current.description, null); assert.equal(current.metadata, null); assert.equal(current.tags, null); assert.equal(current.imageUrl, null);
  const filledDocument = JSON.parse(readFileSync('examples/pos-items.json', 'utf8'));
  const blankExample = {
    ...Object.fromEntries(Object.keys(filledDocument.items[0]).map(key => [key, ''])),
    external_item_id: 'BLANK-CREATE', item_name: 'Blank optional fields',
    item_type: itemType, base_price: 9.99, is_visible: false, is_available: false,
  };
  await expect('blank-create', [{ ...blankExample, external_item_id: 'BLANK-CREATE', external_category_ids: ['CAT-BURGERS'] }], 200);
  const blankCreated = await get('BLANK-CREATE');
  assert.equal(blankCreated.itemType, itemType); assert.equal(blankCreated.minimumQuantity, 1);
  assert.equal(blankCreated.comparePrice, null); assert.equal(blankCreated.taxRuleId, null);
  assert.equal(blankCreated.isVisible, false); assert.equal(blankCreated.isAvailable, false);
  const blankUpdate = Object.fromEntries(Object.keys(blankExample).map(key => [key, '']));
  await expect('blank-update', [{ ...blankUpdate, external_item_id: 'BURGER', item_name: 'Updated Burger' }], 200);
  current = await get('BURGER');
  assert.equal(Number(current.basePrice), 10.99); assert.equal(current.maximumQuantity, 10);
  assert.equal(current.itemType, itemType); assert.equal(current.sku, null);
  assert.deepEqual((await links(original.id)).map(link => link.categoryId), updatedLinks.map(link => link.categoryId));
  await expect('required-blank-price', [{ ...blankExample, external_item_id: 'BAD-BLANK-PRICE', base_price: '', external_category_ids: ['CAT-BURGERS'] }], 400);
  await expect('required-blank-category', [{ ...blankExample, external_item_id: 'BAD-BLANK-CAT', external_category_ids: '' }], 400);
  await expect('partial-bounds', [{ external_item_id: 'BURGER', item_name: 'Updated Burger', minimum_quantity: 11 }], 400);
  await expect('clear-max', [{ external_item_id: 'BURGER', item_name: 'Updated Burger', minimum_quantity: 11, maximum_quantity: null }], 200);
  assert.equal((await get('BURGER')).maximumQuantity, null);
  await expect('missing-auth', [item], 401, { token: '' });
  await expect('invalid-auth', [item], 401, { token: 'x'.repeat(40) });
  await expect('wrong-store', [item], 403, { store: storeB });
  await expect('body-mismatch', [item], 403, { body: { store_code: storeB } });
  await expect('body-only', [item], 400, { store: '', body: { store_code: storeA } });
  // Identical external IDs in other stores must not satisfy missing dependencies.
  await db.menuCategory.create({ data: { storeCode: storeB, externalCategoryId: 'ONLY-B', categoryName: 'Other Store' } });
  await db.menuTaxRule.create({ data: { storeCode: storeB, externalTaxId: 'ONLY-B', name: 'Other Store Tax' } });
  await expect('foreign-category', [{ ...item, external_category_ids: ['ONLY-B'] }], 409);
  await expect('foreign-tax', [{ ...item, external_tax_id: 'ONLY-B' }], 409);
  const badInputs = [
    { external_item_id: '' }, { item_name: '' }, { base_price: -1 }, { base_price: '5' }, { base_price: 1.001 }, { base_price: null }, { base_price: 10000000000 },
    { compare_price: -1 }, { external_category_ids: [] }, { external_category_ids: ['CAT-BURGERS', ' CAT-BURGERS '] }, { external_category_ids: 'CAT-BURGERS' },
    { minimum_quantity: 0 }, { maximum_quantity: 0 }, { preparation_time: -1 }, { display_order: 0.5 }, { special_instructions_max_length: 2147483648 },
    { is_available: 'true' }, { is_visible: null }, { allow_special_instructions: 1 }, { food_type: 'invalid' }, { food_type: ['veg'] },
    { item_type: otherType }, { image_url: 'javascript:alert(1)' }, { metadata: [] }, { configuration: 'bad' }, { nutrition_info: 1 }, { tags: {} }, { allergens: [1] },
  ];
  for (let i = 0; i < badInputs.length; i++) await expect('invalid-' + i, [{ ...item, ...badInputs[i] }], 400);
  await expect('empty', [], 400); await expect('not-array', item, 400);
  await expect('duplicates', [item, item], 400);
  await expect('missing-request', [item], 400, { body: { request_id: '' } });
  await expect('new-missing-price', [{ external_item_id: 'MISSING-PRICE', item_name: 'Missing Price', external_category_ids: ['CAT-BURGERS'] }], 400);
  await expect('new-missing-category', [{ external_item_id: 'MISSING-CAT', item_name: 'Missing Category', base_price: 1 }], 400);
  await db.menuItem.createMany({ data: [
    { storeCode: storeA, externalItemId: 'MANUAL', itemName: 'Manual Item' },
    { storeCode: storeA, externalItemId: 'COMBO', itemName: 'Wrong type', sourceType: 'pos', syncEnabled: true, itemType: otherType },
  ] });
  await expect('manual-rollback', [{ ...item, external_item_id: 'ROLLBACK' }, { ...item, external_item_id: 'MANUAL' }], 409);
  assert.equal(await get('ROLLBACK'), null);
  assert.equal((await db.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: { storeCode: storeA, syncType, requestId: 'manual-rollback' } } })).syncStatus, 'FAILED');
  await expect('manual-rollback', [{ ...item, external_item_id: 'RETRY' }], 200);
  await expect('combo-conflict', [{ ...item, external_item_id: 'COMBO' }], 409);
  await db.menuItem.update({ where: { id: original.id }, data: { archivedAt: new Date() } });
  await expect('archived', [item], 409);
  await db.menuItem.update({ where: { id: original.id }, data: { archivedAt: null, syncEnabled: false } });
  await expect('sync-disabled', [item], 409);
  await db.menuItem.update({ where: { id: original.id }, data: { syncEnabled: true } });
  await db.menuCategory.update({ where: { id: specials.id }, data: { archivedAt: new Date() } });
  await expect('archived-category', [{ ...item, external_category_ids: ['CAT-SPECIALS'] }], 409);
  await expect('free-item', [{ external_item_id: 'FREE', item_name: 'Free Sample', base_price: 0, external_category_ids: ['CAT-BURGERS'], source_type: 'manual', sync_enabled: false }], 200);
  const free = await get('FREE'); assert.equal(free.sourceType, 'pos'); assert.equal(free.syncEnabled, true); assert.equal(free.minimumQuantity, 1); assert.equal(Number(free.basePrice), 0);
  const large = await expect('large', Array.from({ length: 101 }, (_, i) => ({ ...item, external_item_id: 'L' + i })), 200);
  assert.equal(large.body.inserted_count, 101); assert.equal(large.body.received_count, 101);
  const concurrent = await Promise.all([send('concurrent', [{ ...item, external_item_id: 'CONCURRENT' }]), send('concurrent', [{ ...item, external_item_id: 'CONCURRENT' }])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body));
  assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  assert.equal(await db.menuItem.count({ where: { storeCode: storeA, externalItemId: 'CONCURRENT' } }), 1);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } }); await expect('inactive-store', [item], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } }); await expect('disabled-token', [item], 401);
  console.log(`Passed ${checks} ${resource} route checks plus PostgreSQL assertions: category/tax API dependencies, mapping, updates, children, type/replay isolation, validation, protection, 101-item batch, store isolation, concurrency and rollback.`);
} finally {
  for (const model of ['menuComboOption', 'menuComboGroup', 'menuItemVariant', 'menuItemCategory', 'menuItem', 'menuCategory', 'menuTaxRule', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } });
  await db.$disconnect();
}
