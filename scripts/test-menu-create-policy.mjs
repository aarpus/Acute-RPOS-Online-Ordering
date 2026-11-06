import assert from 'node:assert/strict';
import { loadMenuModule } from './menu-script-runtime.mjs';

const { canCreateMenuRecord, menuCreateSections } = loadMenuModule('lib/menu-create-policy.ts');
const { assertMenuCreateAccess } = loadMenuModule('lib/menu-create-access.ts');
const { saveMenuRecord } = loadMenuModule('lib/menu-db.ts');
for (const resource of Object.keys(menuCreateSections)) {
  assert.equal(canCreateMenuRecord(false, { [resource]: false }, resource), true);
  assert.equal(canCreateMenuRecord(true, {}, resource), true);
  assert.equal(canCreateMenuRecord(true, { [resource]: false }, resource), false);
  assert.equal(canCreateMenuRecord(true, { [resource]: true }, resource), true);
}
let store;
let credential = { isActive: true, menuCreateVisibility: { items: false, variants: false } };
const db = { posApiCredential: { findUnique: async ({ where }) => { store = where.storeCode; return credential; } } };
await assert.rejects(assertMenuCreateAccess(db, 'store-a', ['items']), error => error.status === 403);
assert.equal(store, 'store-a');
await assertMenuCreateAccess(db, 'store-a', ['categories']);
// Service-level checks cover direct, batch, PATCH-without-ID, and recursive child creation.
await assert.rejects(saveMenuRecord(db, 'store-a', 'admin-id', 'items', {}), error => error.status === 403);
await assert.rejects(saveMenuRecord(db, 'store-a', 'admin-id', 'variants', {}, undefined, 1), error => error.status === 403);
credential = { ...credential, isActive: false };
await assertMenuCreateAccess(db, 'store-a', ['items', 'variants']);
credential = null;
await assertMenuCreateAccess(db, 'store-a', ['items']);
console.log('Menu creation policy checks passed.');
