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
const route = resource => http ? async request => fetch(`http://localhost:5173${new URL(request.url).pathname}`, { method: request.method, headers: request.headers, body: await request.text(), signal: AbortSignal.timeout(20000) }) : load(`app/api/pos/stores/[store_code]/${resource}/sync/route.ts`).POST;
const db = createPrismaClient(), tag = randomUUID().slice(0, 8);
const storeA = `QA_OFFER_A_${tag}`, storeB = `QA_OFFER_B_${tag}`;
const token = `pos_${randomUUID()}_${tag}`, tokenB = `pos_${randomUUID()}_${tag}`;
const sample = JSON.parse(readFileSync('examples/pos-offers.json', 'utf8')).offers[0];
const context = store => ({ params: Promise.resolve({ store_code: store }) });
const request = (resource, body, store = storeA, auth = token) => new Request(`https://example.test/api/pos/stores/${store}/${resource}/sync`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
let checks = 0;
async function send(id, offers = [sample], settings = {}) {
  const store = settings.store ?? storeA;
  const response = await route('offers')(request('offers', { request_id: id, offers, ...settings.body }, store, settings.token ?? token), context(store));
  const raw = await response.text();
  assert.match(response.headers.get('content-type') ?? '', /application\/json/, `${id}: HTTP ${response.status}: ${raw.slice(0,500)}`);
  return { response, body: JSON.parse(raw) };
}
async function expect(id, offers, status, settings) {
  const value = await send(id, offers, settings); assert.equal(value.response.status, status, JSON.stringify(value.body)); checks++; return value;
}
async function setup(resource, body) {
  const response = await route(resource)(request(resource, { request_id: 'setup-' + resource, ...body }), context(storeA));
  assert.equal(response.status, 200, await response.clone().text());
}
const getOffer = id => db.menuOffer.findUnique({ where: { storeCode_externalOfferId: { storeCode: storeA, externalOfferId: id ?? sample.external_offer_id } } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: storeA, tokenHash: hashPosToken(token) }, { storeCode: storeB, tokenHash: hashPosToken(tokenB) }] });
  const created = await expect('create', [sample], 200); assert.equal(created.body.inserted_count, 1);
  const original = await getOffer(); assert.equal(original.description, sample.description); assert.equal(original.offerCode, 'SAVE10');
  await db.menuOfferUsage.create({ data: { storeCode: storeA, offerId: original.id, discountAmount: 1 } });
  const partial = { external_offer_id: sample.external_offer_id, offer_name: 'Updated offer' };
  const updated = await expect('update', [{ ...partial, discount_value: 15, priority: 2, usage_limit: 100, per_customer_limit: 2, is_stackable: true, conditions: { member: true }, rewards: { bonus: true } }], 200);
  assert.equal(updated.body.updated_count, 1); assert.equal((await getOffer()).id, original.id); assert.equal(await db.menuOfferUsage.count({ where: { offerId: original.id } }), 1);
  const replay = await expect('update', [sample], 200); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true'); assert.deepEqual(replay.body, updated.body); assert.equal(Number((await getOffer()).discountValue), 15);
  await expect('blanks', [{ ...partial, discount_value: '', offer_type: '', priority: '', is_active: '', usage_limit: '', start_at: '', applicable_channels: '', external_item_ids: '', conditions: '', rewards: '', configuration: '' }], 200);
  assert.equal(Number((await getOffer()).discountValue), 15); assert.equal((await getOffer()).usageLimit, 100);
  await expect('coupon-clear-invalid', [{ ...partial, offer_code: '' }], 400);
  await expect('clear-nullables', [{ ...partial, coupon_required: false, offer_code: '', description: '', max_discount: null, minimum_order: null, start_at: null, end_at: null, usage_limit: null, per_customer_limit: null, conditions: null, rewards: null, configuration: null }], 200);
  assert.equal((await getOffer()).offerCode, null); assert.equal((await getOffer()).description, null); assert.equal((await getOffer()).startAt, null); assert.equal((await getOffer()).conditions, null);
  const minimal = { external_offer_id: 'DEFAULTS', offer_name: 'Free delivery', offer_type: 'free_delivery' };
  await expect('defaults', [minimal], 200); const defaults = await getOffer('DEFAULTS');
  assert.equal(defaults.isActive, true); assert.equal(defaults.isStackable, false); assert.equal(defaults.couponRequired, false); assert.equal(defaults.priority, 0); assert.deepEqual(defaults.applicableChannels, ['website']);
  await expect('type-required', [{ ...minimal, external_offer_id: 'NO-TYPE', offer_type: '' }], 400);
  await expect('percentage-value', [{ ...minimal, external_offer_id: 'NO-VALUE', offer_type: 'percentage' }], 400);
  await expect('fixed-value', [{ ...minimal, external_offer_id: 'NO-FIXED', offer_type: 'fixed' }], 400);
  await expect('missing-item', [{ ...partial, external_item_ids: ['ITEM-1'] }], 409);
  await setup('categories', { categories: [{ external_category_id: 'CAT', category_name: 'Menu' }] });
  await setup('items', { items: [{ external_item_id: 'ITEM-1', item_name: 'Burger', base_price: 10, external_category_ids: ['CAT'] }] });
  await setup('combo-items', { combo_items: [{ external_item_id: 'COMBO-1', item_name: 'Combo', base_price: 20, external_category_ids: ['CAT'] }] });
  const item = await db.menuItem.findUnique({ where: { storeCode_externalItemId: { storeCode: storeA, externalItemId: 'ITEM-1' } } });
  const category = await db.menuCategory.findUnique({ where: { storeCode_externalCategoryId: { storeCode: storeA, externalCategoryId: 'CAT' } } });
  await expect('item-scope', [{ ...partial, external_item_ids: ['ITEM-1','COMBO-1'], configuration: { image: '/images/category-0.jpg', website: true, app: true, timezone: 'Asia/Kolkata', days: [1,2,3,4,5,6,7], startTime: '00:00', endTime: '23:59', minItems: 1, customer: 'All Customers' } }], 200);
  assert.equal((await getOffer()).applicableItems[0], item.id); assert.equal((await getOffer()).configuration.scope, 'Selected Items');
  let menu = await publicMenu(db, storeA, 'USD', 'Delivery', new Date('2026-11-10T12:00:00Z'));
  const published = menu.offers.find(offer => offer.id === original.id); assert.equal(published.value, 15); assert.ok(published.itemIds.includes(item.id)); assert.equal(published.image, '/images/category-0.jpg');
  await expect('category-scope', [{ ...partial, external_item_ids: [], external_category_ids: ['CAT'] }], 200); assert.deepEqual((await getOffer()).applicableCategories, [category.id]); assert.equal((await getOffer()).configuration.scope, 'Selected Categories');
  await expect('missing-category', [{ ...partial, external_category_ids: ['MISSING'] }], 409);
  await db.menuCategory.update({ where: { id: category.id }, data: { archivedAt: new Date() } }); await expect('archived-category', [{ ...partial, external_category_ids: ['CAT'] }], 409);
  await db.menuCategory.update({ where: { id: category.id }, data: { archivedAt: null } });
  await db.menuItem.update({ where: { id: item.id }, data: { archivedAt: new Date() } }); await expect('archived-item', [{ ...partial, external_item_ids: ['ITEM-1'] }], 409);
  await db.menuItem.update({ where: { id: item.id }, data: { archivedAt: null } });
  await expect('all-scope', [{ ...partial, external_item_ids: null, external_category_ids: null }], 200); assert.equal((await getOffer()).configuration.scope, 'All Items');
  await expect('channel-hidden', [{ ...partial, applicable_channels: ['app'] }], 200);
  menu = await publicMenu(db, storeA, 'USD'); assert.ok(!menu.offers.some(offer => offer.id === original.id));
  await expect('channel-reset', [{ ...partial, applicable_channels: null }], 200);
  await expect('bogo', [{ ...minimal, external_offer_id: 'BOGO', offer_type: 'bogo', configuration: { buyQty: 2, getQty: 1 } }], 200);
  await expect('coupon', [{ ...partial, offer_code: 'SAVE10', coupon_required: true }], 200);
  await expect('duplicate-code', [{ ...sample, external_offer_id: 'DUP-CODE', offer_code: 'save10' }], 409);
  await expect('batch-code', [{ ...minimal, external_offer_id: 'A', offer_code: 'SAME' }, { ...minimal, external_offer_id: 'B', offer_code: 'same' }], 409);
  assert.equal(await getOffer('A'), null);
  await expect('date-window', [{ ...partial, start_at: '2026-11-01T00:00:00Z', end_at: '2026-12-01T00:00:00Z' }], 200);
  await expect('millisecond-window', [{ ...minimal, external_offer_id: 'MILLISECONDS', start_at: '2026-11-01T00:00:00.001Z', end_at: '2026-11-01T00:00:00.002Z' }], 200);
  await expect('merged-window', [{ ...partial, end_at: '2026-10-01T00:00:00Z' }], 400);
  const invalid = [{ external_offer_id: '' }, { offer_name: '' }, { offer_type: 'bogus' }, { discount_value: 101 }, { discount_value: null }, { discount_value: -1 }, { minimum_order: 1.234 }, { max_discount: 10000000000 }, { priority: null }, { usage_limit: -1 }, { per_customer_limit: 2147483648 }, { coupon_required: null }, { is_stackable: 'yes' }, { is_active: null }, { start_at: '2026-02-30T00:00:00Z' }, { end_at: '2026-12-01' }, { external_item_ids: ['ITEM-1',' ITEM-1 '] }, { external_category_ids: [''] }, { applicable_channels: ['unknown'] }, { conditions: [] }, { rewards: 1 }, { configuration: [] }, { configuration: { image: 'javascript:alert(1)' } }, { configuration: { days: [8] } }, { configuration: { timezone: 'Unknown/Zone' } }, { configuration: { startTime: '12:00' } }, { configuration: { startTime: '25:00', endTime: '00:00' } }, { configuration: { buyQty: 0 } }, { configuration: { customer: 'nobody' } }, { configuration: { website: 'yes' } }, { applicable_items: [item.id] }];
  for (let i = 0; i < invalid.length; i++) await expect('invalid-' + i, [{ ...sample, ...invalid[i] }], 400);
  await expect('empty', [], 400); await expect('not-array', sample, 400); await expect('duplicates', [sample,sample], 400);
  await expect('no-request', [sample], 400, { body: { request_id: '' } });
  await expect('no-auth', [sample], 401, { token: '' }); await expect('wrong-store', [sample], 403, { store: storeB });
  await expect('body-mismatch', [sample], 403, { body: { store_code: storeB } });
  if (!http) await expect('body-only', [sample], 400, { store: '', body: { store_code: storeA } });
  await expect('foreign-item', [{ ...sample, external_item_ids: ['ITEM-1'] }], 409, { store: storeB, token: tokenB });
  await expect('other-store-same-id-code', [sample], 200, { store: storeB, token: tokenB });
  await db.menuOffer.update({ where: { id: original.id }, data: { sourceType: 'manual' } }); await expect('manual-offer', [partial], 409);
  const retry = { ...minimal, external_offer_id: 'ROLLBACK' };
  await expect('rollback', [retry, partial], 409); assert.equal(await getOffer('ROLLBACK'), null);
  await db.menuOffer.update({ where: { id: original.id }, data: { sourceType: 'pos', archivedAt: new Date() } }); await expect('archived-offer', [partial], 409);
  await db.menuOffer.update({ where: { id: original.id }, data: { archivedAt: null } }); await expect('rollback', [retry, partial], 200);
  const large = await expect('large', Array.from({ length: 101 }, (_, i) => ({ ...minimal, external_offer_id: 'BULK-' + i })), 200); assert.equal(large.body.inserted_count, 101);
  const concurrent = await Promise.all([send('concurrent', [{ ...minimal, external_offer_id: 'CONCURRENT' }]), send('concurrent', [{ ...minimal, external_offer_id: 'CONCURRENT' }])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body));
  assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  await expect('deactivate', [{ ...partial, is_active: false }], 200); menu = await publicMenu(db, storeA, 'USD'); assert.ok(!menu.offers.some(offer => offer.id === original.id));
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } }); await expect('inactive-store', [partial], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } }); await expect('disabled', [partial], 401);
  console.log(`Passed ${checks} Offer API checks plus PostgreSQL/public-menu assertions: create/update, coupons, targets, dates, channels, usage preservation, rollback, 101 offers and concurrent replay.`);
} finally {
  for (const model of ['menuOfferUsage', 'menuOffer', 'menuItemCategory', 'menuItem', 'menuCategory', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } }); await db.$disconnect();
}

