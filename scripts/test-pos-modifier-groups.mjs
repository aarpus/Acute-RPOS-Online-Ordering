// Real scoped route + token authorization + PostgreSQL, with unique fixtures.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  let source = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'transform' });
  const names = [...source.matchAll(/export (?:async )?(?:function|class|const|let) (\w+)/g)].map(match => match[1]);
  source = source.replace(/^import \{([\s\S]*?)\} from ['"](.*?)['"];$/gm, (_, fields, name) => `const {${fields.replace(/ as /g, ': ')}} = require('${name}');`)
    .replace(/^export \{(.*?)\} from ['"](.*?)['"];$/gm, (_, fields, name) => `Object.assign(exports, require('${name}'));`).replace(/^export /gm, '');
  source += `\nObject.assign(exports, {${names.join(',')}});`;
  new Function('require', 'exports', source)(name => name === 'cloudflare:workers' ? { env: process.env } : name.startsWith('.') ? load(resolve(dirname(file), name + '.ts')) : require(name), module.exports);
  return module.exports;
}
const { createPrismaClient } = load('lib/prisma.ts');
const { hashPosToken } = load('lib/pos-credentials.ts');
const { POST } = load('app/api/pos/stores/[store_code]/modifier-groups/sync/route.ts');
const db = createPrismaClient();
const tag = randomUUID().slice(0, 8);
const storeA = `QA_MOD_A_${tag}`, storeB = `QA_MOD_B_${tag}`;
const tokenA = `pos_${randomUUID()}_${tag}`, tokenB = `pos_${randomUUID()}_${tag}`;
const group = { external_group_id: 'GRP-ADDONS', name: 'Extra Add-ons', selection_type: 'multiple', min_select: 0, max_select: 3, allow_option_quantity: true, display_order: 1, is_active: true };
let checks = 0;
async function send(id, groups = [group], options = {}) {
  const store = options.store ?? storeA;
  const request = new Request(`https://example.test/api/pos/stores/${store}/modifier-groups/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token ?? tokenA}` }, body: JSON.stringify({ request_id: id, modifier_groups: groups, ...options.body }) });
  const response = await POST(request, { params: Promise.resolve({ store_code: store }) });
  return { response, body: await response.json() };
}
async function expect(id, groups, status, options) {
  const value = await send(id, groups, options);
  assert.equal(value.response.status, status, JSON.stringify(value.body)); checks++;
  return value;
}
const get = externalGroupId => db.menuModifierGroup.findUnique({ where: { storeCode_externalGroupId: { storeCode: storeA, externalGroupId } } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: storeA, tokenHash: hashPosToken(tokenA) }, { storeCode: storeB, tokenHash: hashPosToken(tokenB) }] });
  // A group may require choices before its options are uploaded later.
  const created = await expect('create', [{ ...group, min_select: 1, rules: { example: true }, configuration: { description: 'Settings' } }], 200);
  assert.equal(created.body.inserted_count, 1); assert.equal(created.body.updated_count, 0);
  const original = await get('GRP-ADDONS'); assert.equal(original.sourceType, 'pos');
  assert.equal(await db.menuModifierOption.count({ where: { storeCode: storeA } }), 0);
  await db.menuItem.create({ data: { storeCode: storeA, itemName: 'Linked verification item' } }).then(item => db.menuItemModifierGroup.create({ data: { storeCode: storeA, menuItemId: item.id, modifierGroupId: original.id } }));
  const updated = await expect('update', [{ external_group_id: 'GRP-ADDONS', name: 'Updated Add-ons', max_select: 4, is_active: false }], 200);
  assert.equal(updated.body.updated_count, 1);
  const current = await get('GRP-ADDONS'); assert.equal(current.id, original.id);
  assert.equal(current.selectionType, 'multiple'); assert.equal(current.minSelect, 1); assert.equal(current.maxSelect, 4);
  assert.equal(current.allowOptionQuantity, true); assert.equal(current.isActive, false);
  assert.deepEqual(current.rules, { example: true }); assert.deepEqual(current.configuration, { description: 'Settings' });
  assert.equal((await db.menuItemModifierGroup.findFirst({ where: { storeCode: storeA } })).modifierGroupId, original.id);
  const replay = await expect('update', [group], 200);
  assert.deepEqual(replay.body, updated.body); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true');
  assert.equal((await get('GRP-ADDONS')).name, 'Updated Add-ons');
  await expect('clear-json', [{ external_group_id: 'GRP-ADDONS', name: 'Updated Add-ons', rules: null, configuration: null }], 200);
  assert.equal((await get('GRP-ADDONS')).rules, null); assert.equal((await get('GRP-ADDONS')).configuration, null);
  await expect('defaults', [{ external_group_id: 'DEFAULT', name: 'Default Group' }], 200);
  const defaults = await get('DEFAULT'); assert.equal(defaults.selectionType, 'single'); assert.equal(defaults.minSelect, 0); assert.equal(defaults.maxSelect, 1); assert.equal(defaults.allowOptionQuantity, false); assert.equal(defaults.isActive, true);
  await expect('missing-auth', [group], 401, { token: '' });
  await expect('wrong-auth', [group], 401, { token: 'x'.repeat(40) });
  await expect('cross-store', [group], 403, { store: storeB });
  await expect('body-mismatch', [group], 403, { body: { store_code: storeB } });
  await expect('missing-path', [group], 400, { store: '', body: { store_code: storeA } });
  await expect('other-store', [group], 200, { store: storeB, token: tokenB });
  assert.equal((await get('GRP-ADDONS')).name, 'Updated Add-ons');
  await expect('empty', [], 400);
  await expect('not-array', group, 400);
  await expect('missing-id', [{ name: 'No ID' }], 400);
  await expect('missing-name', [{ external_group_id: 'NO-NAME' }], 400);
  await expect('missing-request-id', [group], 400, { body: { request_id: '' } });
  await expect('duplicate', [group, { ...group, external_group_id: ' GRP-ADDONS ' }], 400);
  for (const [key, value] of [['selection_type', 'invalid'], ['min_select', -1], ['max_select', 1.5], ['display_order', '1'], ['max_select', 2147483648], ['is_active', 'true'], ['allow_option_quantity', 1], ['rules', []], ['configuration', 'invalid']]) await expect('bad-' + key + String(value), [{ ...group, [key]: value }], 400);
  await expect('single-max', [{ ...group, selection_type: 'single', max_select: 2 }], 400);
  await expect('invalid-bounds', [{ ...group, min_select: 4, max_select: 3 }], 400);
  // Validate omitted fields against current values, not just creation defaults.
  await expect('partial-single', [{ external_group_id: 'GRP-ADDONS', name: 'Invalid partial update', selection_type: 'single' }], 400);
  assert.equal((await get('GRP-ADDONS')).name, 'Updated Add-ons');
  await db.menuModifierGroup.create({ data: { storeCode: storeA, externalGroupId: 'MANUAL', name: 'Manual Group' } });
  await expect('rollback', [{ ...group, name: 'Must roll back' }, { ...group, external_group_id: 'MANUAL' }], 409);
  assert.equal((await get('GRP-ADDONS')).name, 'Updated Add-ons');
  assert.equal((await db.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: { storeCode: storeA, syncType: 'MENU_MODIFIER_GROUP', requestId: 'rollback' } } })).syncStatus, 'FAILED');
  await expect('rollback', [group], 200);
  await db.menuModifierGroup.update({ where: { id: original.id }, data: { archivedAt: new Date() } });
  await expect('archived', [group], 409);
  await db.menuModifierGroup.update({ where: { id: original.id }, data: { archivedAt: null } });
  const large = await expect('large', Array.from({ length: 101 }, (_, i) => ({ ...group, external_group_id: 'L' + i })), 200);
  assert.equal(large.body.inserted_count, 101); assert.equal(large.body.received_count, 101);
  const concurrent = await Promise.all([send('concurrent', [{ ...group, external_group_id: 'CONCURRENT' }]), send('concurrent', [{ ...group, external_group_id: 'CONCURRENT' }])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body));
  assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  assert.equal(await db.menuModifierGroup.count({ where: { storeCode: storeA, externalGroupId: 'CONCURRENT' } }), 1);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } });
  await expect('inactive-store', [group], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } });
  await expect('disabled-token', [group], 401);
  console.log(`Passed ${checks} modifier group route checks plus PostgreSQL assertions: defaults, partial updates, selection rules, linked records, 101-record batch, auth, store isolation, replay/concurrency and rollback.`);
} finally {
  for (const model of ['menuItemModifierGroup', 'menuModifierGroup', 'menuItem', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } });
  await db.$disconnect();
}
