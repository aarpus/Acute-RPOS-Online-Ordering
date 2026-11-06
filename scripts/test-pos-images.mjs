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
const { publicMenu } = load('lib/menu-public.ts');
const http = process.argv.includes('--http');
const route = resource => http ? async request => fetch(`http://localhost:5173${new URL(request.url).pathname}`, { method: request.method, headers: request.headers, body: await request.text() }) : load(`app/api/pos/stores/[store_code]/${resource}/sync/route.ts`).POST;
const db = createPrismaClient(), tag = randomUUID().slice(0, 8);
const storeA = `QA_IMG_A_${tag}`, storeB = `QA_IMG_B_${tag}`;
const token = `pos_${randomUUID()}_${tag}`, tokenB = `pos_${randomUUID()}_${tag}`;
const sample = JSON.parse(readFileSync('examples/pos-images.json', 'utf8')).images[0];
const context = store => ({ params: Promise.resolve({ store_code: store }) });
const request = (resource, body, store = storeA, auth = token) => new Request(`https://example.test/api/pos/stores/${store}/${resource}/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
let checks = 0;
async function send(id, images = [sample], settings = {}) {
  const store = settings.store ?? storeA;
  const response = await route('images')(request('images', { request_id: id, images, ...settings.body }, store, settings.token ?? token), context(store));
  return { response, body: await response.json() };
}
async function expect(id, images, status, settings) {
  const value = await send(id, images, settings); assert.equal(value.response.status, status, JSON.stringify(value.body)); checks++; return value;
}
async function setup(resource, body) {
  const response = await route(resource)(request(resource, { request_id: 'setup-' + resource, ...body }), context(storeA));
  assert.equal(response.status, 200, await response.clone().text());
}
const getImage = id => db.menuItemImage.findUnique({ where: { storeCode_externalImageId: { storeCode: storeA, externalImageId: id ?? sample.external_image_id } } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: storeA, tokenHash: hashPosToken(token) }, { storeCode: storeB, tokenHash: hashPosToken(tokenB) }] });
  await expect('missing-parent', [sample], 409);
  await setup('categories', { categories: [{ external_category_id: 'CAT', category_name: 'Menu' }] });
  await setup('items', { items: ['ITEM-BURGER', 'OTHER'].map(external_item_id => ({ external_item_id, item_name: external_item_id, base_price: 2, external_category_ids: ['CAT'] })) });
  await setup('combo-items', { combo_items: [{ external_item_id: 'COMBO-001', item_name: 'Meal', base_price: 10, external_category_ids: ['CAT'] }] });
  const parent = await db.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode: storeA, externalItemId: sample.external_item_id } } });
  const created = await expect('create', [sample], 200); assert.equal(created.body.inserted_count, 1);
  const original = await getImage(); assert.equal(original.menuItemId, parent.id); assert.equal(original.isPrimary, true);
  const updated = await expect('update', [{ ...sample, image_url: 'https://example.test/burger.jpg', alt_text: 'Burger photo', configuration: { credit: 'POS' } }], 200);
  assert.equal(updated.body.updated_count, 1); assert.equal((await getImage()).id, original.id);
  const replay = await expect('update', [sample], 200); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true'); assert.deepEqual(replay.body, updated.body); assert.equal((await getImage()).imageUrl, 'https://example.test/burger.jpg');
  const partial = { external_item_id: sample.external_item_id, external_image_id: sample.external_image_id };
  await expect('blanks', [{ ...partial, image_url: '', is_primary: '', is_active: '', display_order: '', configuration: '' }], 200);
  assert.equal((await getImage()).imageUrl, 'https://example.test/burger.jpg'); assert.deepEqual((await getImage()).configuration, { credit: 'POS' });
  await expect('clear-alt', [{ ...partial, alt_text: '' }], 200); assert.equal((await getImage()).altText, '');
  await expect('clear-json', [{ ...partial, configuration: null, alt_text: null }], 200); assert.equal((await getImage()).configuration, null); assert.equal((await getImage()).altText, null);
  const second = { ...sample, external_image_id: 'SECOND', image_url: '/images/category-1.jpg' };
  await expect('new-primary', [second], 200); assert.equal((await getImage()).isPrimary, false); assert.equal((await getImage('SECOND')).isPrimary, true);
  // Updating the demoted peer in the same batch must not restore its old primary flag.
  await expect('primary-batch', [{ ...partial, is_primary: true }, { external_item_id: sample.external_item_id, external_image_id: 'SECOND', alt_text: 'Second' }], 200);
  assert.equal((await getImage()).isPrimary, true); assert.equal((await getImage('SECOND')).isPrimary, false);
  let menu = await publicMenu(db, storeA, 'USD');
  let product = menu.products.find(product => product.id === parent.id);
  assert.equal(product.image, 'https://example.test/burger.jpg'); assert.deepEqual(product.gallery, ['https://example.test/burger.jpg', '/images/category-1.jpg']);
  await expect('two-primary', [sample, second], 400);
  await expect('inactive-primary', [{ ...sample, is_active: false }], 400);
  await expect('deactivate', [{ ...partial, is_active: false }], 200); assert.equal((await getImage()).isPrimary, false); assert.equal((await getImage()).isActive, false);
  menu = await publicMenu(db, storeA, 'USD'); product = menu.products.find(product => product.id === parent.id);
  assert.equal(product.image, '/images/category-1.jpg'); assert.deepEqual(product.gallery, ['/images/category-1.jpg']);
  await expect('inactive-current', [{ ...partial, is_primary: true }], 400);
  await expect('reactivate', [{ ...partial, is_active: true, is_primary: true }], 200);
  await expect('move-parent', [{ ...sample, external_item_id: 'OTHER' }], 409);
  await expect('combo-parent', [{ ...sample, external_item_id: 'COMBO-001', external_image_id: 'COMBO-IMAGE' }], 200);
  await expect('create-url-required', [{ external_item_id: 'OTHER', external_image_id: 'NO-URL', image_url: '' }], 400);
  await expect('defaults', [{ external_item_id: 'OTHER', external_image_id: 'DEFAULTS', image_url: '/images/category-0.jpg' }], 200);
  const defaults = await getImage('DEFAULTS'); assert.equal(defaults.isActive, true); assert.equal(defaults.isPrimary, false); assert.equal(defaults.displayOrder, 0);
  const invalid = [{ external_item_id: '' }, { external_image_id: '' }, { image_url: null }, { image_url: 'javascript:alert(1)' }, { image_url: 'data:image/png;base64,AA' }, { image_url: '//example.test/a.jpg' }, { image_url: 'https://user:pass@example.test/a.jpg' }, { image_url: '/images/../a\n.jpg' }, { alt_text: 'a'.repeat(251) }, { is_primary: 1 }, { is_active: null }, { display_order: -1 }, { display_order: 1.5 }, { display_order: 2147483648 }, { configuration: [] }, { configuration: { a: 'a'.repeat(30000) } }, { menu_item_id: parent.id }];
  for (let i = 0; i < invalid.length; i++) await expect('invalid-' + i, [{ ...sample, ...invalid[i] }], 400);
  await expect('empty', [], 400); await expect('not-array', sample, 400); await expect('duplicates', [sample, sample], 400);
  await expect('no-request', [sample], 400, { body: { request_id: '' } });
  await expect('no-auth', [sample], 401, { token: '' }); await expect('wrong-store', [sample], 403, { store: storeB });
  await expect('foreign-parent', [sample], 409, { store: storeB, token: tokenB });
  await expect('body-mismatch', [sample], 403, { body: { store_code: storeB } });
  if (!http) await expect('body-only', [sample], 400, { store: '', body: { store_code: storeA } });
  const foreignParent = await db.menuItem.create({ data: { storeCode: storeB, externalItemId: sample.external_item_id, itemName: 'Foreign', sourceType: 'pos', syncEnabled: true } });
  await expect('same-id-other-store', [sample], 200, { store: storeB, token: tokenB });
  const foreignImage = await db.menuItemImage.findUnique({ where: { storeCode_externalImageId: { storeCode: storeB, externalImageId: sample.external_image_id } } }); assert.equal(foreignImage.menuItemId, foreignParent.id); assert.notEqual(foreignImage.id, original.id);
  for (const data of [{ sourceType: 'manual' }, { sourceType: 'pos', syncEnabled: false }, { syncEnabled: true, archivedAt: new Date() }]) {
    await db.menuItem.update({ where: { id: parent.id }, data }); await expect('parent-' + checks, [sample], 409);
  }
  await db.menuItem.update({ where: { id: parent.id }, data: { archivedAt: null } });
  await db.menuItemImage.update({ where: { id: original.id }, data: { sourceType: 'manual' } }); await expect('manual-image', [partial], 409);
  await expect('manual-primary', [second], 409);
  const retry = { ...second, external_image_id: 'ROLLBACK', is_primary: false };
  await expect('rollback', [retry, partial], 409); assert.equal(await db.menuItemImage.count({ where: { storeCode: storeA, externalImageId: 'ROLLBACK' } }), 0);
  await db.menuItemImage.update({ where: { id: original.id }, data: { sourceType: 'pos', archivedAt: new Date() } });
  await expect('archived-image', [partial], 409); await expect('archived-primary', [second], 409);
  await db.menuItemImage.update({ where: { id: original.id }, data: { archivedAt: null } });
  await expect('rollback', [retry, partial], 200);
  const large = await expect('large', Array.from({ length: 101 }, (_, i) => ({ ...retry, external_image_id: 'BULK-' + i })), 200); assert.equal(large.body.inserted_count, 101);
  const concurrent = await Promise.all([send('concurrent', [{ ...retry, external_image_id: 'CONCURRENT' }]), send('concurrent', [{ ...retry, external_image_id: 'CONCURRENT' }])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body));
  assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } }); await expect('inactive-store', [partial], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } }); await expect('disabled', [partial], 401);
  console.log(`Passed ${checks} Image API checks plus PostgreSQL assertions: create/update, gallery ordering, primary switching, URL validation, ownership, rollback, 101 images and concurrent replay.`);
} finally {
  for (const model of ['menuItemImage', 'menuItemCategory', 'menuItem', 'menuCategory', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } }); await db.$disconnect();
}

