import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire, stripTypeScriptTypes } from 'node:module';

const require = createRequire(import.meta.url);
function load(file, imports = {}) {
  const module = { exports: {} };
  let source = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'transform' });
  const names = [...source.matchAll(/export (?:async )?(?:function|class|const|let) (\w+)/g)].map(match => match[1]);
  source = source.replace(/^import \{([\s\S]*?)\} from ['"](.*?)['"];$/gm, (_, fields, name) => `const {${fields.replace(/ as /g, ': ')}} = require('${name}');`).replace(/^export /gm, '');
  source += `\nObject.assign(exports, {${names.join(',')}});`;
  new Function('require', 'module', 'exports', source)(name => imports[name] ?? require(name), module, module.exports);
  return module.exports;
}
const validation = load('lib/branding-validation.ts');
let rows = [], logs = [], writes = 0;
const db = {
  store: { async findMany() { return [{ store_code: 'STORE_A' }]; } },
  menuCategory: {
    async findMany({ where }) { return rows.filter(row => row.storeCode === where.storeCode && where.externalCategoryId.in.includes(row.externalCategoryId)); },
    async create({ data }) { writes++; const row = { id: `id-${writes}`, isActive: true, archivedAt: null, ...data }; rows.push(row); return row; },
    async update({ where, data }) { writes++; Object.assign(rows.find(row => row.id === where.id), data); },
  },
  posSyncLog: {
    async findUnique({ where }) { const key = where.storeCode_syncType_requestId; return logs.find(row => Object.keys(key).every(field => row[field] === key[field])); },
    async upsert({ where, create, update }) { const row = await this.findUnique({ where }); if (row) Object.assign(row, update); else logs.push(create); },
  },
  async $transaction(action) {
    const snapshot = structuredClone({ rows, logs });
    try { return await action(db); } catch (error) { rows = snapshot.rows; logs = snapshot.logs; throw error; }
  },
};
const { syncPos } = load('lib/branding-pos.ts', {
  './branding-validation': validation,
  './pos-credentials': { async authorizePos(request, store) { if (request.headers.get('authorization') !== 'Bearer test' || store !== 'STORE_A') throw new validation.BrandingError('Unauthorized store.', 403); } },
  './menu-db': { async lockMenu() {} },
  './branding': {
    async lockScope() {}, async withBrandingDb(action) { return action(db); },
    brandingResponse(error) { return Response.json({ success: false, error: error.message }, { status: error.status || 500 }); },
  },
});
const category = { external_category_id: 'CAT-PIZZA', category_name: 'Pizza', image_url: '/images/pizza.jpg', display_order: 1, is_visible: true };
async function send(requestId, categories = [category], store = 'STORE_A') {
  return syncPos(new Request('https://example.test/api/pos/stores/STORE_A/categories/sync', { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify({ request_id: requestId, categories }) }), 'CATEGORY', store);
}
// A historical website-category success must not skip the new menu write.
logs.push({ storeCode: 'STORE_A', syncType: 'CATEGORY', requestId: 'create', syncStatus: 'SUCCESS' });
let response = await send('create');
assert.equal(response.status, 200);
assert.equal((await response.json()).inserted_count, 1);
assert.equal(rows[0].sourceType, 'pos'); assert.equal(rows[0].syncEnabled, true);
assert.ok(rows[0].lastSyncedAt instanceof Date);
assert.equal((await send('create')).headers.get('X-POS-Replayed'), 'true');
assert.equal(writes, 1);
const originalId = rows[0].id;
response = await send('update', [{ ...category, category_name: 'Updated Pizza', is_active: false }]);
assert.equal((await response.json()).updated_count, 1);
assert.equal(rows[0].id, originalId); assert.equal(rows[0].categoryName, 'Updated Pizza'); assert.equal(rows[0].isActive, false);
await send('preserve-active'); assert.equal(rows[0].isActive, false);
rows.push({ id: 'other-store', storeCode: 'STORE_B', externalCategoryId: 'CAT-PIZZA', categoryName: 'Other store' });
assert.equal((await send('wrong-store', [category], 'STORE_B')).status, 403);
assert.equal((await send('missing-id', [{ category_name: 'No ID' }])).status, 400);
assert.equal((await send('duplicate', [category, category])).status, 400);
assert.equal((await send('bad-active', [{ ...category, is_active: 'false' }])).status, 400);
assert.equal((await send('bad-image', [{ ...category, image_url: 'javascript:alert(1)' }])).status, 400);
assert.equal((await send('empty', [])).status, 400);
const missingPathStore = await syncPos(new Request('https://example.test/api/pos/stores//categories/sync', { method: 'POST', headers: { authorization: 'Bearer test', 'content-type': 'application/json' }, body: JSON.stringify({ store_code: 'STORE_A', request_id: 'body-only', categories: [category] }) }), 'CATEGORY', '');
assert.equal(missingPathStore.status, 400, 'A body store code cannot replace the required URL store code');
rows.push({ id: 'manual', storeCode: 'STORE_A', externalCategoryId: 'MANUAL', sourceType: 'manual', categoryName: 'Manual' });
assert.equal((await send('rollback', [{ ...category, category_name: 'Should roll back' }, { ...category, external_category_id: 'MANUAL' }])).status, 409);
assert.equal(rows.find(row => row.id === originalId).categoryName, 'Pizza');
assert.equal(rows.find(row => row.id === 'other-store').categoryName, 'Other store');
rows.find(row => row.id === originalId).archivedAt = new Date();
assert.equal((await send('archived')).status, 409);
rows.find(row => row.id === originalId).archivedAt = null;
rows.find(row => row.id === originalId).syncEnabled = false;
assert.equal((await send('sync-disabled')).status, 409);
console.log('POS menu category checks passed: insert/update, replay, legacy logs, validation, store isolation, manual/archive protection and transaction rollback (in-memory database).');
