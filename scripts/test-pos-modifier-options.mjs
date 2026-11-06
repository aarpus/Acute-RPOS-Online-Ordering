// Real PostgreSQL + scoped route handlers; only uniquely named fixtures are removed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url), cache = new Map();
function load(file) {
  file = resolve(file); if (cache.has(file)) return cache.get(file).exports;
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
const { POST } = load('app/api/pos/stores/[store_code]/modifier-options/sync/route.ts');
const { POST: groupPost } = load('app/api/pos/stores/[store_code]/modifier-groups/sync/route.ts');
const { POST: categoryPost } = load('app/api/pos/stores/[store_code]/categories/sync/route.ts');
const { POST: itemPost } = load('app/api/pos/stores/[store_code]/items/sync/route.ts');
const db = createPrismaClient(), tag = randomUUID().slice(0, 8);
const storeA = `QA_OPT_A_${tag}`, storeB = `QA_OPT_B_${tag}`;
const tokenA = `pos_${randomUUID()}_${tag}`, tokenB = `pos_${randomUUID()}_${tag}`;
const option = JSON.parse(readFileSync('examples/pos-modifier-options.json', 'utf8')).modifier_options[0];
const context = store => ({ params: Promise.resolve({ store_code: store }) });
const request = (body, store = storeA, token = tokenA) => new Request(`https://example.test/api/pos/stores/${store}/modifier-options/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
let checks = 0;
async function send(id, options = [option], settings = {}) {
  const store = settings.store ?? storeA;
  const response = await POST(request({ request_id: id, modifier_options: options, ...settings.body }, store, settings.token ?? tokenA), context(store));
  return { response, body: await response.json() };
}
async function expect(id, options, status, settings) {
  const value = await send(id, options, settings); assert.equal(value.response.status, status, JSON.stringify(value.body)); checks++; return value;
}
const get = externalOptionId => db.menuModifierOption.findUnique({ where: { storeCode_externalOptionId: { storeCode: storeA, externalOptionId } } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: storeA, tokenHash: hashPosToken(tokenA) }, { storeCode: storeB, tokenHash: hashPosToken(tokenB) }] });
  await expect('before-group', [option], 409);
  const setupGroups = await groupPost(request({ request_id: 'setup', modifier_groups: [
    { external_group_id: 'GRP-ADDONS', name: 'Add-ons', selection_type: 'multiple', min_select: 0, max_select: 3, allow_option_quantity: true },
    { external_group_id: 'SINGLE', name: 'Choose One', selection_type: 'single', min_select: 1, max_select: 1 },
  ] }), context(storeA));
  assert.equal(setupGroups.status, 200, await setupGroups.clone().text());
  const created = await expect('create', [option], 200);
  assert.equal(created.body.inserted_count, 1); assert.equal(created.body.updated_count, 0);
  const original = await get('OPT-EXTRA-CHEESE');
  assert.equal(original.sourceType, 'pos'); assert.equal(original.linkedItemId, null); assert.equal(Number(original.price), 1.5);
  assert.equal(await db.menuItem.count({ where: { storeCode: storeA } }), 0, 'Standalone option does not require any item');
  assert.equal((await categoryPost(request({ request_id: 'setup', categories: [{ external_category_id: 'CAT', category_name: 'Menu' }] }), context(storeA))).status, 200);
  const setupItems = await itemPost(request({ request_id: 'setup', items: ['CHEESE', 'BURGER'].map(id => ({ external_item_id: id, item_name: id, base_price: 5, external_category_ids: ['CAT'] })) }), context(storeA));
  assert.equal(setupItems.status, 200, await setupItems.clone().text());
  const cheese = await db.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode: storeA, externalItemId: 'CHEESE' } } });
  const burger = await db.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode: storeA, externalItemId: 'BURGER' } } });
  const link = await db.menuItemModifierGroup.create({ data: { storeCode: storeA, menuItemId: burger.id, modifierGroupId: original.modifierGroupId, conditions: { allowedOptionIds: [original.id] } } });
  const stock = await db.menuItemInventory.create({ data: { storeCode: storeA, menuItemId: cheese.id, trackInventory: true, quantityAvailable: 10 } });
  const update = await expect('update', [{ external_group_id: 'GRP-ADDONS', external_option_id: 'OPT-EXTRA-CHEESE', name: 'Extra Cheese Updated', price: 2, linked_external_item_id: 'CHEESE', metadata: { pos: true } }], 200);
  assert.equal(update.body.updated_count, 1); let current = await get('OPT-EXTRA-CHEESE');
  assert.equal(current.id, original.id); assert.equal(current.linkedItemId, cheese.id); assert.equal(current.maxQuantity, 2);
  assert.deepEqual(current.configuration, option.configuration); assert.equal(Number(current.price), 2);
  assert.deepEqual((await db.menuItemModifierGroup.findUnique({ where: { id: link.id } })).conditions, { allowedOptionIds: [original.id] });
  assert.equal(Number((await db.menuItemInventory.findUnique({ where: { id: stock.id } })).quantityAvailable), 10);
  const replay = await expect('update', [option], 200); assert.deepEqual(replay.body, update.body); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true'); assert.equal(Number((await get('OPT-EXTRA-CHEESE')).price), 2);
  await expect('blanks', [{ external_group_id: 'GRP-ADDONS', external_option_id: 'OPT-EXTRA-CHEESE', name: 'Extra Cheese Updated', price: '', is_default: '', is_available: '', min_quantity: '', max_quantity: '', display_order: '', linked_external_item_id: '', configuration: '', metadata: '' }], 200);
  assert.equal((await get('OPT-EXTRA-CHEESE')).linkedItemId, cheese.id);
  await expect('clear-link', [{ external_group_id: 'GRP-ADDONS', external_option_id: 'OPT-EXTRA-CHEESE', name: 'Extra Cheese Updated', linked_external_item_id: null, metadata: null, configuration: null }], 200);
  current = await get('OPT-EXTRA-CHEESE'); assert.equal(current.linkedItemId, null); assert.equal(current.metadata, null); assert.equal(current.configuration, null);
  await expect('partial-bounds', [{ external_group_id: 'GRP-ADDONS', external_option_id: 'OPT-EXTRA-CHEESE', name: 'Extra Cheese Updated', min_quantity: 3 }], 400);
  await expect('free-defaults', [{ external_group_id: 'GRP-ADDONS', external_option_id: 'FREE', name: 'Free Sauce', price: 0 }], 200);
  const free = await get('FREE'); assert.equal(free.minQuantity, 0); assert.equal(free.maxQuantity, 1); assert.equal(free.isDefault, false); assert.equal(free.isAvailable, true);
  const singleA = { ...option, external_group_id: 'SINGLE', external_option_id: 'SINGLE-A', name: 'Choice A', is_default: true };
  const singleB = { ...singleA, external_option_id: 'SINGLE-B', name: 'Choice B' };
  await expect('single-default', [singleA], 200);
  await expect('too-many-defaults', [singleB], 409); assert.equal(await get('SINGLE-B'), null);
  await expect('switch-default', [{ ...singleA, is_default: false }, singleB], 200);
  assert.equal((await get('SINGLE-A')).isDefault, false); assert.equal((await get('SINGLE-B')).isDefault, true);
  await expect('move-group', [{ ...option, external_group_id: 'SINGLE' }], 409);
  const invalid = [{ external_group_id: '' }, { external_option_id: '' }, { name: '' }, { price: -1 }, { price: '5' }, { price: null }, { price: 1.001 }, { price: 10000000000 }, { is_default: 'true' }, { is_available: 1 }, { min_quantity: -1 }, { max_quantity: 0.5 }, { display_order: 2147483648 }, { max_quantity: null }, { metadata: [] }, { configuration: [] }, { configuration: { image: 'javascript:alert(1)' } }, { linked_external_item_id: 123 }, { linked_item_id: cheese.id }];
  for (let i = 0; i < invalid.length; i++) await expect('bad-' + i, [{ ...option, ...invalid[i] }], 400);
  await expect('empty', [], 400); await expect('not-array', option, 400); await expect('duplicate', [option, { ...option, external_option_id: ' OPT-EXTRA-CHEESE ' }], 400);
  await expect('missing-price', [{ external_group_id: 'GRP-ADDONS', external_option_id: 'NO-PRICE', name: 'No Price', price: '' }], 400);
  await expect('no-request', [option], 400, { body: { request_id: '' } });
  await expect('missing-auth', [option], 401, { token: '' }); await expect('invalid-auth', [option], 401, { token: 'x'.repeat(40) });
  await expect('cross-store', [option], 403, { store: storeB }); await expect('body-mismatch', [option], 403, { body: { store_code: storeB } });
  await expect('body-only', [option], 400, { store: '', body: { store_code: storeA } });
  await expect('foreign-group', [option], 409, { store: storeB, token: tokenB });
  assert.equal((await groupPost(request({ request_id: 'setup', modifier_groups: [{ external_group_id: 'GRP-ADDONS', name: 'Other store', selection_type: 'multiple', max_select: 3 }] }, storeB, tokenB), context(storeB))).status, 200);
  await expect('other-store', [option], 200, { store: storeB, token: tokenB });
  assert.equal((await get('OPT-EXTRA-CHEESE')).name, 'Extra Cheese Updated');
  await db.menuItem.create({ data: { storeCode: storeB, externalItemId: 'ONLY-B', itemName: 'Other item' } });
  await expect('foreign-linked-item', [{ ...option, linked_external_item_id: 'ONLY-B' }], 409);
  await expect('missing-linked-item', [{ ...option, linked_external_item_id: 'NOT-FOUND' }], 409);
  await db.menuItem.update({ where: { id: cheese.id }, data: { archivedAt: new Date() } });
  await expect('archived-linked-item', [{ ...option, linked_external_item_id: 'CHEESE' }], 409);
  await db.menuItem.update({ where: { id: cheese.id }, data: { archivedAt: null } });
  await db.menuModifierOption.create({ data: { storeCode: storeA, modifierGroupId: original.modifierGroupId, externalOptionId: 'MANUAL', name: 'Manual' } });
  await expect('rollback', [{ ...option, external_option_id: 'ROLLBACK' }, { ...option, external_option_id: 'MANUAL' }], 409);
  assert.equal(await get('ROLLBACK'), null);
  assert.equal((await db.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: { storeCode: storeA, syncType: 'MENU_MODIFIER_OPTION', requestId: 'rollback' } } })).syncStatus, 'FAILED');
  await expect('rollback', [{ ...option, external_option_id: 'RETRY' }], 200);
  await db.menuModifierOption.update({ where: { id: original.id }, data: { archivedAt: new Date() } }); await expect('archived-option', [option], 409);
  await db.menuModifierOption.update({ where: { id: original.id }, data: { archivedAt: null } });
  await db.menuModifierGroup.update({ where: { id: original.modifierGroupId }, data: { archivedAt: new Date() } }); await expect('archived-group', [option], 409);
  await db.menuModifierGroup.update({ where: { id: original.modifierGroupId }, data: { archivedAt: null, sourceType: 'manual' } }); await expect('manual-group', [option], 409);
  await db.menuModifierGroup.update({ where: { id: original.modifierGroupId }, data: { sourceType: 'pos' } });
  const large = await expect('large', Array.from({ length: 101 }, (_, i) => ({ ...option, external_option_id: 'L' + i, name: 'Option ' + i })), 200); assert.equal(large.body.inserted_count, 101);
  const concurrent = await Promise.all([send('concurrent', [{ ...option, external_option_id: 'CONCURRENT' }]), send('concurrent', [{ ...option, external_option_id: 'CONCURRENT' }])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body)); assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  assert.equal(await db.menuModifierOption.count({ where: { storeCode: storeA, externalOptionId: 'CONCURRENT' } }), 1);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } }); await expect('inactive', [option], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } }); await expect('disabled-token', [option], 401);
  console.log(`Passed ${checks} Modifier Option route checks plus PostgreSQL assertions: group dependency, optional item linking, defaults, quantity bounds, blanks, preserved assignments/stock, 101 options, authorization, replay/concurrency and rollback.`);
} finally {
  for (const model of ['menuItemModifierGroup', 'menuItemInventory', 'menuModifierOption', 'menuModifierGroup', 'menuItemCategory', 'menuItem', 'menuCategory', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } }); await db.$disconnect();
}
