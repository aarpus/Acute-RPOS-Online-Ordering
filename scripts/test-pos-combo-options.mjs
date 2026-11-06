// Actual scoped routes + PostgreSQL + bearer authentication, using isolated fixture names.
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
const route = resource => load(`app/api/pos/stores/[store_code]/${resource}/sync/route.ts`).POST;
const db = createPrismaClient(), tag = randomUUID().slice(0, 8);
const storeA = `QA_CO_A_${tag}`, storeB = `QA_CO_B_${tag}`;
const token = `pos_${randomUUID()}_${tag}`, tokenB = `pos_${randomUUID()}_${tag}`;
const sample = JSON.parse(readFileSync('examples/pos-combo-options.json', 'utf8')).combo_options[0];
const context = store => ({ params: Promise.resolve({ store_code: store }) });
const request = (resource, body, store = storeA, auth = token) => new Request(`https://example.test/api/pos/stores/${store}/${resource}/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
let checks = 0;
async function send(id, options = [sample], settings = {}) {
  const store = settings.store ?? storeA;
  const response = await route('combo-options')(request('combo-options', { request_id: id, combo_options: options, ...settings.body }, store, settings.token ?? token), context(store));
  return { response, body: await response.json() };
}
async function expect(id, options, status, settings) {
  const value = await send(id, options, settings); assert.equal(value.response.status, status, JSON.stringify(value.body)); checks++; return value;
}
async function setup(resource, body) {
  const response = await route(resource)(request(resource, { request_id: 'setup-' + resource, ...body }), context(storeA));
  assert.equal(response.status, 200, await response.clone().text());
}
const getOption = () => db.menuComboOption.findUnique({ where: { storeCode_externalOptionId: { storeCode: storeA, externalOptionId: sample.external_option_id } } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: storeA, tokenHash: hashPosToken(token) }, { storeCode: storeB, tokenHash: hashPosToken(tokenB) }] });
  await expect('missing-group', [sample], 409);
  await setup('categories', { categories: [{ external_category_id: 'CAT', category_name: 'Menu' }] });
  await setup('combo-items', { combo_items: [{ external_item_id: 'COMBO-001', item_name: 'Meal', base_price: 10, external_category_ids: ['CAT'] }] });
  const groupExample = JSON.parse(readFileSync('examples/pos-combo-groups.json', 'utf8')).combo_groups[0];
  await setup('combo-groups', { combo_groups: [groupExample, { ...groupExample, external_group_id: 'OTHER' }, { ...groupExample, external_group_id: 'FIXED', selection_type: 'fixed' }] });
  await expect('missing-component', [sample], 409);
  await setup('items', { items: ['ITEM-COLA', 'ITEM-JUICE'].map(external_item_id => ({ external_item_id, item_name: external_item_id, base_price: 2, external_category_ids: ['CAT'] })) });
  const group = await db.menuComboGroup.findUnique({ where: { storeCode_externalGroupId: { storeCode: storeA, externalGroupId: sample.external_group_id } } });
  const component = await db.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode: storeA, externalItemId: 'ITEM-COLA' } } });
  const created = await expect('create', [sample], 200); assert.equal(created.body.inserted_count, 1);
  const original = await getOption(); assert.equal(original.componentItemId, component.id); assert.equal(original.externalComponentItemId, 'ITEM-COLA'); assert.equal(Number(original.quantity), 1);
  const updated = await expect('update', [{ ...sample, option_name: 'Cold cola', quantity: 1.125, extra_price: 1.25, configuration: { badge: 'Cold' } }], 200);
  assert.equal(updated.body.updated_count, 1); assert.equal((await getOption()).id, original.id); assert.equal(Number((await getOption()).quantity), 1.125);
  const replay = await expect('update', [sample], 200); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true'); assert.deepEqual(replay.body, updated.body); assert.equal((await getOption()).optionName, 'Cold cola');
  const partial = { external_group_id: sample.external_group_id, external_option_id: sample.external_option_id, option_name: 'Cola' };
  await expect('blanks', [{ ...partial, external_component_item_id: '', quantity: '', extra_price: '', is_default: '', is_available: '', display_order: '', configuration: '' }], 200);
  assert.equal(Number((await getOption()).quantity), 1.125); assert.equal((await getOption()).componentItemId, component.id);
  await expect('item-price', [{ ...partial, extra_price: null }], 200);
  assert.equal(Number((await getOption()).extraPrice), 0); assert.deepEqual((await getOption()).configuration, { badge: 'Cold', useItemPrice: true });
  await expect('numeric-price', [{ ...partial, extra_price: 0 }], 200); assert.equal((await getOption()).configuration.useItemPrice, false);
  await expect('clear-config', [{ ...partial, configuration: null }], 200); assert.equal((await getOption()).configuration, null);
  await expect('missing-component-id', [{ ...partial, external_option_id: 'NO-COMPONENT' }], 400);
  await expect('nested-combo', [{ ...sample, external_component_item_id: 'COMBO-001' }], 409);
  await expect('move-group', [{ ...sample, external_group_id: 'OTHER' }], 409);
  const second = { ...sample, external_option_id: 'JUICE', external_component_item_id: 'ITEM-JUICE' };
  await expect('too-many-defaults', [second], 409); assert.equal(await db.menuComboOption.count({ where: { storeCode: storeA, externalOptionId: 'JUICE' } }), 0);
  await expect('switch-default', [second, { ...partial, is_default: false }], 200);
  await expect('fixed-group', [{ ...sample, external_group_id: 'FIXED', external_option_id: 'FIXED-COLA' }], 200);
  await expect('defaults', [{ external_group_id: 'OTHER', external_option_id: 'DEFAULTS', external_component_item_id: 'ITEM-COLA', option_name: 'Defaults' }], 200);
  const defaults = await db.menuComboOption.findUnique({ where: { storeCode_externalOptionId: { storeCode: storeA, externalOptionId: 'DEFAULTS' } } });
  assert.equal(Number(defaults.quantity), 1); assert.equal(Number(defaults.extraPrice), 0); assert.equal(defaults.isDefault, false); assert.equal(defaults.isAvailable, true);
  const invalid = [{ external_group_id: '' }, { external_option_id: '' }, { option_name: '' }, { external_component_item_id: null }, { quantity: 0 }, { quantity: 0.0001 }, { quantity: 10000000 }, { quantity: null }, { extra_price: -1 }, { extra_price: 1.234 }, { extra_price: 10000000000 }, { is_default: 'true' }, { is_available: null }, { display_order: -1 }, { display_order: 2147483648 }, { configuration: [] }, { configuration: { useItemPrice: 'true' } }, { component_item_id: component.id }, { combo_group_id: group.id }];
  for (let i = 0; i < invalid.length; i++) await expect('invalid-' + i, [{ ...sample, ...invalid[i] }], 400);
  await expect('empty', [], 400); await expect('not-array', sample, 400); await expect('duplicates', [sample, sample], 400);
  await expect('no-request', [sample], 400, { body: { request_id: '' } });
  await expect('no-auth', [sample], 401, { token: '' }); await expect('wrong-store', [sample], 403, { store: storeB });
  await expect('foreign-parent', [sample], 409, { store: storeB, token: tokenB });
  await expect('body-mismatch', [sample], 403, { body: { store_code: storeB } });
  await expect('body-only', [sample], 400, { store: '', body: { store_code: storeA } });
  await db.menuItem.update({ where: { id: component.id }, data: { archivedAt: new Date() } }); await expect('archived-component', [sample], 409);
  await db.menuItem.update({ where: { id: component.id }, data: { archivedAt: null } });
  for (const data of [{ sourceType: 'manual' }, { sourceType: 'pos', syncEnabled: false }, { syncEnabled: true, archivedAt: new Date() }]) {
    await db.menuItem.update({ where: { id: group.comboItemId }, data }); await expect('parent-' + checks, [sample], 409);
  }
  await db.menuItem.update({ where: { id: group.comboItemId }, data: { archivedAt: null } });
  await db.menuComboGroup.update({ where: { id: group.id }, data: { sourceType: 'manual' } }); await expect('manual-group', [sample], 409);
  await db.menuComboGroup.update({ where: { id: group.id }, data: { sourceType: 'pos', archivedAt: new Date() } }); await expect('archived-group', [sample], 409);
  await db.menuComboGroup.update({ where: { id: group.id }, data: { archivedAt: null } });
  await db.menuComboOption.update({ where: { id: original.id }, data: { sourceType: 'manual' } }); await expect('manual-option', [partial], 409);
  const retry = { ...second, external_option_id: 'ROLLBACK', is_default: false };
  await expect('rollback', [retry, partial], 409); assert.equal(await db.menuComboOption.count({ where: { storeCode: storeA, externalOptionId: 'ROLLBACK' } }), 0);
  await db.menuComboOption.update({ where: { id: original.id }, data: { sourceType: 'pos', archivedAt: new Date() } }); await expect('archived-option', [partial], 409);
  await db.menuComboOption.update({ where: { id: original.id }, data: { archivedAt: null } });
  await expect('rollback', [retry, partial], 200);
  const large = await expect('large', Array.from({ length: 101 }, (_, i) => ({ ...second, external_option_id: 'BULK-' + i, is_default: false })), 200); assert.equal(large.body.inserted_count, 101);
  const concurrent = await Promise.all([send('concurrent', [{ ...retry, external_option_id: 'CONCURRENT' }]), send('concurrent', [{ ...retry, external_option_id: 'CONCURRENT' }])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body));
  assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } }); await expect('inactive', [partial], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } }); await expect('disabled', [partial], 401);
  console.log(`Passed ${checks} Combo Option API checks plus PostgreSQL assertions: dependency chain, create/update, prices, defaults, ownership, rollback, 101 options and concurrent replay.`);
} finally {
  for (const model of ['menuComboOption', 'menuComboGroup', 'menuItemCategory', 'menuItem', 'menuCategory', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } }); await db.$disconnect();
}

