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
const storeA = `QA_CG_A_${tag}`, storeB = `QA_CG_B_${tag}`, token = `pos_${randomUUID()}_${tag}`;
const sample = JSON.parse(readFileSync('examples/pos-combo-groups.json', 'utf8')).combo_groups[0];
const context = store => ({ params: Promise.resolve({ store_code: store }) });
let checks = 0;
async function send(id, groups = [sample], settings = {}) {
  const store = settings.store ?? storeA;
  const request = new Request(`https://example.test/api/pos/stores/${store}/combo-groups/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.token ?? token}` }, body: JSON.stringify({ request_id: id, combo_groups: groups, ...settings.body }) });
  const response = await route('combo-groups')(request, context(store));
  return { response, body: await response.json() };
}
async function expect(id, groups, status, settings) {
  const value = await send(id, groups, settings); assert.equal(value.response.status, status, JSON.stringify(value.body)); checks++; return value;
}
const getGroup = () => db.menuComboGroup.findUnique({ where: { storeCode_externalGroupId: { storeCode: storeA, externalGroupId: sample.external_group_id } } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.create({ data: { storeCode: storeA, tokenHash: hashPosToken(token) } });
  await expect('missing-parent', [sample], 409);
  for (const [id, type] of [['COMBO-001', 'combo'], ['OTHER', 'combo'], ['REGULAR', 'regular']]) await db.menuItem.create({ data: { storeCode: storeA, externalItemId: id, itemName: id, itemType: type, sourceType: 'pos', syncEnabled: true } });
  const parent = await db.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode: storeA, externalItemId: 'COMBO-001' } } });
  await expect('regular-parent', [{ ...sample, external_combo_item_id: 'REGULAR' }], 409);
  const created = await expect('create', [sample], 200); assert.equal(created.body.inserted_count, 1);
  const original = await getGroup(); assert.equal(original.isRequired, true); assert.equal(original.minSelect, 1);
  await db.menuComboOption.create({ data: { storeCode: storeA, comboGroupId: original.id, optionName: 'Drink', sourceType: 'pos' } });
  const updated = await expect('update', [{ ...sample, group_name: 'Drinks', max_select: 2, rules: { badge: 'Drink' }, configuration: { color: 'blue' } }], 200);
  assert.equal(updated.body.updated_count, 1); assert.equal((await getGroup()).id, original.id);
  assert.equal(await db.menuComboOption.count({ where: { comboGroupId: original.id } }), 1);
  const replay = await expect('update', [sample], 200); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true'); assert.equal((await getGroup()).maxSelect, 2);
  await expect('partial-bounds', [{ external_combo_item_id: 'COMBO-001', external_group_id: sample.external_group_id, group_name: 'Drinks', max_select: 0 }], 400);
  await expect('blanks', [{ ...sample, min_select: '', max_select: '', is_required: '', display_order: '', selection_type: '', rules: '', configuration: '' }], 200);
  assert.equal((await getGroup()).maxSelect, 2); assert.deepEqual((await getGroup()).rules, { badge: 'Drink' });
  await expect('clear-json', [{ ...sample, rules: null, configuration: null, selection_type: 'fixed' }], 200); assert.equal((await getGroup()).rules, null);
  await expect('move-parent', [{ ...sample, external_combo_item_id: 'OTHER' }], 409);
  const minimal = { external_combo_item_id: 'COMBO-001', external_group_id: 'DEFAULTS', group_name: 'Defaults' };
  await expect('defaults', [minimal], 200);
  const defaults = await db.menuComboGroup.findUnique({ where: { storeCode_externalGroupId: { storeCode: storeA, externalGroupId: 'DEFAULTS' } } });
  assert.equal(defaults.minSelect, 0); assert.equal(defaults.maxSelect, 1); assert.equal(defaults.isRequired, false); assert.equal(defaults.selectionType, 'selectable');
  const invalid = [{ external_combo_item_id: '' }, { external_group_id: '' }, { group_name: '' }, { selection_type: 'single' }, { min_select: -1 }, { max_select: 0.5 }, { display_order: 2147483648 }, { is_required: null }, { is_required: 'true' }, { rules: [] }, { configuration: 1 }, { min_select: 3, max_select: 2 }, { min_select: 0 }, { options: [] }, { combo_options: [] }, { children: [] }];
  for (let i = 0; i < invalid.length; i++) await expect('invalid-' + i, [{ ...sample, ...invalid[i] }], 400);
  await expect('empty', [], 400); await expect('not-array', sample, 400); await expect('duplicates', [sample, sample], 400);
  await expect('no-request', [sample], 400, { body: { request_id: '' } });
  await expect('no-auth', [sample], 401, { token: '' }); await expect('wrong-store', [sample], 403, { store: storeB });
  await expect('body-mismatch', [sample], 403, { body: { store_code: storeB } });
  await expect('body-only', [sample], 400, { store: '', body: { store_code: storeA } });
  for (const data of [{ sourceType: 'manual' }, { sourceType: 'pos', syncEnabled: false }, { syncEnabled: true, archivedAt: new Date() }]) {
    await db.menuItem.update({ where: { id: parent.id }, data }); await expect('parent-' + checks, [sample], 409);
  }
  await db.menuItem.update({ where: { id: parent.id }, data: { archivedAt: null } });
  await db.menuComboGroup.update({ where: { id: original.id }, data: { sourceType: 'manual' } });
  await expect('manual-group', [sample], 409);
  const retryGroup = { ...minimal, external_group_id: 'ROLLBACK' };
  await expect('rollback', [retryGroup, sample], 409); assert.equal(await db.menuComboGroup.count({ where: { storeCode: storeA, externalGroupId: 'ROLLBACK' } }), 0);
  await db.menuComboGroup.update({ where: { id: original.id }, data: { sourceType: 'pos', archivedAt: new Date() } });
  await expect('archived-group', [sample], 409);
  await db.menuComboGroup.update({ where: { id: original.id }, data: { archivedAt: null } });
  await expect('rollback', [retryGroup, sample], 200);
  const large = await expect('large', Array.from({ length: 101 }, (_, i) => ({ ...sample, external_group_id: 'BULK-' + i })), 200); assert.equal(large.body.inserted_count, 101);
  const concurrent = await Promise.all([send('concurrent', [{ ...minimal, external_group_id: 'CONCURRENT' }]), send('concurrent', [{ ...minimal, external_group_id: 'CONCURRENT' }])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body));
  assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } }); await expect('inactive', [sample], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } }); await expect('disabled', [sample], 401);
  console.log(`Passed ${checks} Combo Group API checks plus PostgreSQL assertions: create/update, child preservation, replay, validation, ownership, rollback, 101 groups and concurrency.`);
} finally {
  for (const model of ['menuComboOption', 'menuComboGroup', 'menuItem', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } }); await db.$disconnect();
}

