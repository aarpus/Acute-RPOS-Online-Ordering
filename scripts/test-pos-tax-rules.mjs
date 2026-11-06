// Exercise real route handlers, token authentication and PostgreSQL transactions.
// Only uniquely named fixtures are created, then removed in finally.
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
const { POST: scoped } = load('app/api/pos/stores/[store_code]/tax-rules/sync/route.ts');
const db = createPrismaClient();
const httpBase = process.argv.find(argument => argument.startsWith('--http='))?.slice('--http='.length);
const tag = randomUUID().slice(0, 8);
const storeA = `QA_TAX_A_${tag}`, storeB = `QA_TAX_B_${tag}`;
const tokenA = `pos_${randomUUID()}_${tag}`, tokenB = `pos_${randomUUID()}_${tag}`;
const rule = { external_tax_id: 'TAX-SALES', name: 'Sales Tax', rate_percent: 8.25, price_includes_tax: false, is_active: true };
let checks = 0;
async function send(id, rules = [rule], options = {}) {
  const store = options.store ?? storeA;
  const body = { request_id: id, tax_rules: rules, ...(options.body || {}) };
  const path = `/api/pos/stores/${store}/tax-rules/sync`;
  const request = new Request(new URL(path, httpBase || 'https://example.test'), { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token ?? tokenA}` }, body: JSON.stringify(body) });
  const response = httpBase ? await fetch(request) : await scoped(request, { params: Promise.resolve({ store_code: store }) });
  return { response, body: await response.json() };
}
async function expect(id, rules, expected, options) {
  const value = await send(id, rules, options);
  assert.equal(value.response.status, expected, JSON.stringify(value.body)); checks++;
  return value;
}
const get = externalTaxId => db.menuTaxRule.findUnique({ where: { storeCode_externalTaxId: { storeCode: storeA, externalTaxId } } });
try {
  await db.store.createMany({ data: [storeA, storeB].map(store_code => ({ store_code, storename: store_code, company_code: `QA_${tag}`, created_by: 0, is_active: true, is_delete: false })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: storeA, tokenHash: hashPosToken(tokenA) }, { storeCode: storeB, tokenHash: hashPosToken(tokenB) }] });
  const created = await expect('create', [rule, { ...rule, external_tax_id: 'TAX-FOOD', name: 'Food Tax', rate_percent: 5 }], 200);
  assert.equal(created.body.inserted_count, 2); assert.equal(created.body.updated_count, 0);
  assert.equal(created.response.headers.get('X-POS-Replayed'), 'false');
  const original = await get('TAX-SALES');
  assert.equal(original.sourceType, 'pos'); assert.equal(Number(original.ratePercent), 8.25);
  assert.equal('taxComponents' in original, false); assert.equal('calculationRules' in original, false);
  await db.menuItem.create({ data: { storeCode: storeA, itemName: 'Tax linked verification item', taxRuleId: original.id } });
  const update = await expect('update', [{ ...rule, rate_percent: 9.1234, is_active: false, price_includes_tax: true, configuration: { receipt: true } }], 200);
  assert.equal(update.body.updated_count, 1); assert.equal(update.body.inserted_count, 0);
  assert.equal((await get('TAX-SALES')).id, original.id);
  assert.equal((await db.menuItem.findFirst({ where: { storeCode: storeA } })).taxRuleId, original.id);
  const replay = await expect('update', [{ ...rule, rate_percent: 50 }], 200);
  assert.deepEqual(replay.body, update.body); assert.equal(replay.response.headers.get('X-POS-Replayed'), 'true');
  assert.equal(Number((await get('TAX-SALES')).ratePercent), 9.1234);
  await expect('optional', [{ external_tax_id: 'TAX-SALES', name: 'Sales Updated', rate_percent: 7 }], 200);
  const preserved = await get('TAX-SALES');
  assert.equal(preserved.isActive, false); assert.equal(preserved.priceIncludesTax, true); assert.deepEqual(preserved.configuration, { receipt: true });
  assert.equal((await get('TAX-FOOD')).name, 'Food Tax', 'Omitted rows stay unchanged');
  await expect('defaults', [{ external_tax_id: 'ZERO', name: 'Zero Tax', rate_percent: 0 }], 200);
  assert.equal((await get('ZERO')).isActive, true); assert.equal((await get('ZERO')).priceIncludesTax, false);
  await expect('config-clear', [{ ...rule, configuration: null }], 200); assert.equal((await get('TAX-SALES')).configuration, null);
  await expect('missing-path-store', [rule], 400, { store: '', body: { store_code: storeA } });
  await expect('missing-auth', [rule], 401, { token: '' });
  await expect('wrong-token', [rule], 401, { token: 'x'.repeat(40) });
  await expect('cross-store', [rule], 403, { store: storeB });
  await expect('path-mismatch', [rule], 403, { body: { store_code: storeB } });
  await expect('other-store', [{ ...rule, name: 'Other store tax' }], 200, { store: storeB, token: tokenB });
  assert.equal((await get('TAX-SALES')).name, 'Sales Tax');
  await expect('missing-id', [{ name: 'Invalid', rate_percent: 5 }], 400);
  await expect('missing-name', [{ external_tax_id: 'BAD', rate_percent: 5 }], 400);
  await expect('duplicate', [rule, { ...rule, external_tax_id: ' TAX-SALES ' }], 400);
  await expect('empty', [], 400);
  const largeBatch = await expect('large-batch', Array.from({ length: 101 }, (_, i) => ({ ...rule, external_tax_id: 'L' + i })), 200);
  assert.equal(largeBatch.body.received_count, 101); assert.equal(largeBatch.body.inserted_count, 101);
  assert.equal(await db.menuTaxRule.count({ where: { storeCode: storeA, externalTaxId: { startsWith: 'L' } } }), 101);
  const invalidShape = await expect('invalid-array', rule, 400);
  assert.equal(invalidShape.body.error, 'tax_rules must be a JSON array.');
  for (const rate of [-1, 101, 0.12345, '5', null]) await expect('invalid-rate-' + String(rate), [{ ...rule, rate_percent: rate }], 400);
  await expect('bad-active', [{ ...rule, is_active: 'false' }], 400);
  await expect('bad-inclusive', [{ ...rule, price_includes_tax: 1 }], 400);
  await expect('bad-config', [{ ...rule, configuration: [] }], 400);
  await expect('missing-request-id', [rule], 400, { body: { request_id: '' } });
  await db.menuTaxRule.create({ data: { storeCode: storeA, externalTaxId: 'MANUAL', name: 'Manual', ratePercent: 2 } });
  await expect('manual-rollback', [{ ...rule, name: 'Must roll back' }, { ...rule, external_tax_id: 'MANUAL' }], 409);
  assert.equal((await get('TAX-SALES')).name, 'Sales Tax'); assert.equal((await get('MANUAL')).name, 'Manual');
  assert.equal((await db.posSyncLog.findUnique({ where: { storeCode_syncType_requestId: { storeCode: storeA, syncType: 'MENU_TAX_RULE', requestId: 'manual-rollback' } } })).syncStatus, 'FAILED');
  await expect('manual-rollback', [rule], 200); // Failed requests can be retried.
  await db.menuTaxRule.update({ where: { id: original.id }, data: { archivedAt: new Date() } });
  await expect('archived', [rule], 409);
  await db.menuTaxRule.update({ where: { id: original.id }, data: { archivedAt: null } });
  const concurrent = await Promise.all([send('concurrent', [{ ...rule, external_tax_id: 'CONCURRENT' }]), send('concurrent', [{ ...rule, external_tax_id: 'CONCURRENT' }])]);
  for (const value of concurrent) assert.equal(value.response.status, 200, JSON.stringify(value.body));
  assert.equal(concurrent.filter(value => value.response.headers.get('X-POS-Replayed') === 'true').length, 1);
  assert.equal(await db.menuTaxRule.count({ where: { storeCode: storeA, externalTaxId: 'CONCURRENT' } }), 1);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: false } });
  await expect('inactive', [rule], 403);
  await db.store.updateMany({ where: { store_code: storeA }, data: { is_active: true } });
  await db.posApiCredential.update({ where: { storeCode: storeA }, data: { isActive: false } });
  await expect('disabled', [rule], 401);
  console.log(`Passed ${checks} ${httpBase ? 'HTTP' : 'route'} checks plus database assertions: tax insert/update, replay/concurrency, authorization, validation, defaults, configuration, item links, isolation and rollback.`);
} finally {
  for (const model of ['menuItem', 'menuTaxRule', 'posSyncLog', 'posApiCredential']) await db[model].deleteMany({ where: { storeCode: { in: [storeA, storeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [storeA, storeB] } } });
  await db.$disconnect();
}
