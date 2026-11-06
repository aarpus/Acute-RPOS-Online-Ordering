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
const core = load('lib/menu-db.ts');
const route = resource => load(`app/api/pos/stores/[store_code]/${resource}/sync/route.ts`).POST;
const POST = route('modifier-links');
const db = createPrismaClient(), tag = randomUUID().slice(0, 8);
const storeA = `QA_LINK_A_${tag}`, storeB = `QA_LINK_B_${tag}`;
const tokenA = `pos_${randomUUID()}_${tag}`, tokenB = `pos_${randomUUID()}_${tag}`;
const sample = JSON.parse(readFileSync('examples/pos-modifier-links.json', 'utf8')).modifier_links[0];
const context = store => ({ params: Promise.resolve({ store_code: store }) });
const request = (body, store = storeA, token = tokenA) => new Request(`https://example.test/api/pos/stores/${store}/modifier-links/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
let checks = 0;
async function send(id, links = [sample], settings = {}) {
  const store = settings.store ?? storeA;
  const response = await POST(request({ request_id: id, modifier_links: links, ...settings.body }, store, settings.token ?? tokenA), context(store));
  return { response, body: await response.json() };
}
async function expect(id, links, status, settings) {
  const value = await send(id, links, settings); assert.equal(value.response.status, status, JSON.stringify(value.body)); checks++; return value;
}
async function setup(resource, body) {
  const response = await route(resource)(request({ request_id: 'setup', ...body }), context(storeA));
  assert.equal(response.status, 200, await response.clone().text());
}
const item = id => db.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode: storeA, externalItemId: id } } });
const group = id => db.menuModifierGroup.findUnique({ where: { storeCode_externalGroupId: { storeCode: storeA, externalGroupId: id } } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: storeA, tokenHash: hashPosToken(tokenA) }, { storeCode: storeB, tokenHash: hashPosToken(tokenB) }] });
  await expect('missing-item', [sample], 409);
  await setup('categories', { categories: [{ external_category_id: 'CAT', category_name: 'Menu' }] });
  await setup('items', { items: ['ITEM-BURGER', 'OTHER'].map(id => ({ external_item_id: id, item_name: id, base_price: 5, external_category_ids: ['CAT'] })) });
  await setup('combo-items', { combo_items: [{ external_item_id: 'COMBO', item_name: 'Combo', base_price: 10, external_category_ids: ['CAT'] }] });
  await expect('missing-group', [sample], 409);
  await setup('modifier-groups', { modifier_groups: [
    { external_group_id: 'GRP-ADDONS', name: 'Add-ons', selection_type: 'multiple', max_select: 3 },
    { external_group_id: 'SINGLE', name: 'Single', selection_type: 'single', min_select: 1, max_select: 1 },
    { external_group_id: 'EMPTY', name: 'Not uploaded yet', selection_type: 'multiple', min_select: 1, max_select: 2 },
  ] });
  await expect('missing-option', [sample], 409);
  await setup('modifier-options', { modifier_options: [
    { external_group_id: 'GRP-ADDONS', external_option_id: 'OPT-EXTRA-CHEESE', name: 'Cheese', price: 1 },
    { external_group_id: 'GRP-ADDONS', external_option_id: 'OPT-PATTY', name: 'Patty', price: 2 },
    { external_group_id: 'SINGLE', external_option_id: 'OPT-SINGLE', name: 'Single choice', price: 0 },
  ] });
  await setup('variants', { variants: [
    { external_item_id: 'ITEM-BURGER', external_variant_id: 'VAR-LARGE', name: 'Large', price: 6 },
    { external_item_id: 'OTHER', external_variant_id: 'VAR-OTHER', name: 'Other variant', price: 6 },
  ] });
  const burger = await item('ITEM-BURGER'), other = await item('OTHER'), addons = await group('GRP-ADDONS');
  const getBase = () => db.menuItemModifierGroup.findFirst({ where: { storeCode: storeA, menuItemId: burger.id, modifierGroupId: addons.id, variantId: null, archivedAt: null } });
  const created = await expect('create', [sample], 200); assert.equal(created.body.inserted_count, 1);
  const original = await getBase(); assert.equal(original.configuration._posManaged, true); assert.equal(original.variantId, null);
  const cheese = await db.menuModifierOption.findUnique({ where: { storeCode_externalOptionId: { storeCode: storeA, externalOptionId: 'OPT-EXTRA-CHEESE' } } });
  assert.deepEqual(original.conditions, { allowedOptionIds: [cheese.id] });
  const update = await expect('update', [{ ...sample, display_order: 2, configuration: { badge: 'Add-ons', _posManaged: false } }], 200);
  assert.equal(update.body.updated_count, 1); assert.equal((await getBase()).id, original.id); assert.equal((await getBase()).configuration._posManaged, true);
  const replay = await expect('update', [sample], 200); assert.deepEqual(replay.body, update.body); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true'); assert.equal((await getBase()).displayOrder, 2);
  await expect('variant-link', [{ ...sample, external_variant_id: 'VAR-LARGE' }], 200);
  assert.equal(await db.menuItemModifierGroup.count({ where: { storeCode: storeA, menuItemId: burger.id, modifierGroupId: addons.id, archivedAt: null } }), 2);
  await expect('wrong-variant', [{ ...sample, external_variant_id: 'VAR-OTHER' }], 409);
  await expect('missing-variant', [{ ...sample, external_variant_id: 'NO-VARIANT' }], 409);
  await expect('no-options-required', [{ external_item_id: 'ITEM-BURGER', external_group_id: 'EMPTY' }], 409);
  await expect('all-options', [{ ...sample, allowed_external_option_ids: null }], 200); assert.equal((await getBase()).conditions, null);
  await expect('empty-subset', [{ ...sample, allowed_external_option_ids: [] }], 200); assert.deepEqual((await getBase()).conditions, { allowedOptionIds: [] });
  await expect('required-empty-subset', [{ ...sample, is_required_override: true, min_select_override: 1, allowed_external_option_ids: [] }], 409);
  await expect('required', [{ ...sample, is_required_override: true, min_select_override: 1 }], 200);
  await expect('blanks', [{ external_item_id: 'ITEM-BURGER', external_group_id: 'GRP-ADDONS', external_variant_id: '', is_required_override: '', min_select_override: '', max_select_override: '', display_order: '', allowed_external_option_ids: '', conditions: '', configuration: '' }], 200);
  assert.equal((await getBase()).minSelectOverride, 1); assert.deepEqual((await getBase()).conditions, { allowedOptionIds: [cheese.id] });
  await expect('required-contradiction', [{ external_item_id: 'ITEM-BURGER', external_group_id: 'GRP-ADDONS', is_required_override: false }], 400);
  await expect('clear-overrides', [{ external_item_id: 'ITEM-BURGER', external_group_id: 'GRP-ADDONS', is_required_override: null, min_select_override: null, max_select_override: null, conditions: null, configuration: null }], 200);
  let current = await getBase(); assert.equal(current.conditions, null); assert.deepEqual(current.configuration, { _posManaged: true }); assert.equal(current.minSelectOverride, null);
  await expect('single-bounds', [{ ...sample, external_group_id: 'SINGLE', allowed_external_option_ids: null }], 400);
  await expect('single-valid', [{ ...sample, external_group_id: 'SINGLE', max_select_override: 1, allowed_external_option_ids: null }], 200);
  await expect('foreign-option', [{ ...sample, allowed_external_option_ids: ['OPT-SINGLE'] }], 409);
  await db.menuModifierOption.update({ where: { id: cheese.id }, data: { isAvailable: false } });
  await expect('unavailable-required', [{ ...sample, is_required_override: true, min_select_override: 1 }], 409);
  await db.menuModifierOption.update({ where: { id: cheese.id }, data: { isAvailable: true, archivedAt: new Date() } });
  await expect('archived-option', [sample], 409); await db.menuModifierOption.update({ where: { id: cheese.id }, data: { archivedAt: null } });
  await db.menuModifierOption.updateMany({ where: { storeCode: storeA, modifierGroupId: addons.id }, data: { isDefault: true } });
  await expect('too-many-defaults', [{ ...sample, max_select_override: 1, allowed_external_option_ids: null }], 409);
  await db.menuModifierOption.updateMany({ where: { storeCode: storeA, modifierGroupId: addons.id }, data: { isDefault: false } });
  const invalid = [{ external_item_id: '' }, { external_group_id: '' }, { external_variant_id: 1 }, { is_required_override: 'yes' }, { min_select_override: -1 }, { max_select_override: 0.5 }, { display_order: null }, { display_order: 2147483648 }, { conditions: [] }, { configuration: [] }, { conditions: { allowedOptionIds: [cheese.id] } }, { allowed_external_option_ids: 'option' }, { allowed_external_option_ids: ['', 'OPT-EXTRA-CHEESE'] }, { allowed_external_option_ids: ['OPT-EXTRA-CHEESE', ' OPT-EXTRA-CHEESE '] }, { is_required_override: true, min_select_override: 0 }];
  for (let i = 0; i < invalid.length; i++) await expect('invalid-' + i, [{ ...sample, ...invalid[i] }], 400);
  await expect('duplicates', [sample, { ...sample, external_variant_id: null }], 400);
  await expect('empty', [], 400); await expect('not-array', sample, 400); await expect('no-request', [sample], 400, { body: { request_id: '' } });
  await expect('missing-auth', [sample], 401, { token: '' }); await expect('invalid-auth', [sample], 401, { token: 'x'.repeat(40) });
  await expect('wrong-store', [sample], 403, { store: storeB }); await expect('body-mismatch', [sample], 403, { body: { store_code: storeB } });
  await expect('body-only', [sample], 400, { store: '', body: { store_code: storeA } }); await expect('foreign-dependencies', [sample], 409, { store: storeB, token: tokenB });
  const otherStoreItem = await db.menuItem.create({ data: { storeCode: storeB, externalItemId: 'ITEM-BURGER', itemName: 'Other', sourceType: 'pos', syncEnabled: true } });
  await db.menuModifierGroup.create({ data: { storeCode: storeB, externalGroupId: 'GRP-ADDONS', name: 'Other', sourceType: 'pos', selectionType: 'multiple', maxSelect: 3 } });
  await expect('other-store', [{ ...sample, allowed_external_option_ids: null }], 200, { store: storeB, token: tokenB }); assert.equal((await getBase()).id, original.id);
  assert.equal(await db.menuItemModifierGroup.count({ where: { storeCode: storeB, menuItemId: otherStoreItem.id } }), 1);
  await db.menuItemModifierGroup.create({ data: { storeCode: storeA, menuItemId: other.id, modifierGroupId: addons.id } });
  const comboLink = { ...sample, external_item_id: 'COMBO', allowed_external_option_ids: null };
  await expect('rollback', [comboLink, { ...sample, external_item_id: 'OTHER' }], 409);
  assert.equal(await db.menuItemModifierGroup.count({ where: { storeCode: storeA, menuItemId: (await item('COMBO')).id } }), 0);
  assert.equal((await db.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: { storeCode: storeA, syncType: 'MENU_MODIFIER_LINK', requestId: 'rollback' } } })).syncStatus, 'FAILED');
  await expect('rollback', [comboLink], 200);
  // Marker protects POS assignments through the real manual CRUD/archive service.
  current = await getBase();
  await assert.rejects(db.$transaction(tx => core.saveMenuRecord(tx, storeA, randomUUID(), 'modifier-links', { updatedAt: current.updatedAt.toISOString(), displayOrder: 9 }, current.id)), /POS-owned/);
  await assert.rejects(db.$transaction(tx => core.archiveMenuRecord(tx, storeA, 'modifier-links', current.id, current.updatedAt.toISOString())), /POS-owned/);
  await db.menuItem.update({ where: { id: burger.id }, data: { syncEnabled: false } }); await expect('item-disabled', [sample], 409);
  await db.menuItem.update({ where: { id: burger.id }, data: { syncEnabled: true, sourceType: 'manual' } }); await expect('manual-item', [sample], 409);
  await db.menuItem.update({ where: { id: burger.id }, data: { sourceType: 'pos', archivedAt: new Date() } }); await expect('archived-item', [sample], 409);
  await db.menuItem.update({ where: { id: burger.id }, data: { archivedAt: null } });
  await db.menuModifierGroup.update({ where: { id: addons.id }, data: { sourceType: 'manual' } }); await expect('manual-group', [sample], 409);
  await db.menuModifierGroup.update({ where: { id: addons.id }, data: { sourceType: 'pos', archivedAt: new Date() } }); await expect('archived-group', [sample], 409);
  await db.menuModifierGroup.update({ where: { id: addons.id }, data: { archivedAt: null } });
  await db.menuItemModifierGroup.update({ where: { id: original.id }, data: { archivedAt: new Date() } });
  const recreated = await expect('archived-slot', [sample], 200); assert.equal(recreated.body.inserted_count, 1); assert.notEqual((await getBase()).id, original.id);
  const many = Array.from({ length: 101 }, (_, i) => ({ external_item_id: 'BULK-' + i, item_name: 'Bulk ' + i, base_price: 1, external_category_ids: ['CAT'] }));
  assert.equal((await route('items')(request({ request_id: 'bulk-parents', items: many }), context(storeA))).status, 200);
  const large = await expect('large', many.map(parent => ({ ...sample, external_item_id: parent.external_item_id, allowed_external_option_ids: null })), 200); assert.equal(large.body.inserted_count, 101);
  const concurrentRecord = { ...sample, external_item_id: 'OTHER', external_group_id: 'SINGLE', max_select_override: 1, allowed_external_option_ids: null };
  const concurrent = await Promise.all([send('concurrent', [concurrentRecord]), send('concurrent', [concurrentRecord])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body)); assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } }); await expect('inactive', [sample], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } }); await expect('disabled-token', [sample], 401);
  console.log(`Passed ${checks} Modifier Link route checks plus PostgreSQL assertions: full API dependency chain, item/variant scopes, option filters, limits/defaults, ownership, manual protection, history, 101 links, authorization, rollback and concurrent replays.`);
} finally {
  for (const model of ['menuItemModifierGroup', 'menuItemVariant', 'menuModifierOption', 'menuModifierGroup', 'menuItemCategory', 'menuItem', 'menuCategory', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } }); await db.$disconnect();
}
