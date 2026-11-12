import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

// Exercise the actual connection policy without network access or credentials.
const source = stripTypeScriptTypes(fs.readFileSync('lib/prisma.ts', 'utf8'))
  .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
function connection(workerEnv, env) {
  const context = vm.createContext({ workerEnv, process: { env } });
  return vm.runInContext(`${source}\ngetDatabaseConnectionString()`, context);
}
assert.equal(connection({ HYPERDRIVE: { connectionString: 'postgresql://hyperdrive/test' }, DATABASE_URL: 'direct' }, { NODE_ENV: 'production' }), 'postgresql://hyperdrive/test');
assert.throws(() => connection({ DATABASE_URL: 'direct' }, { NODE_ENV: 'production', DATABASE_URL: 'also-direct' }), /HYPERDRIVE/);
assert.throws(() => connection({ HYPERDRIVE: { connectionString: ' ' } }, { NODE_ENV: 'production' }), /HYPERDRIVE/);
assert.equal(connection({ DATABASE_URL: ' local-worker ' }, { NODE_ENV: 'development' }), 'local-worker');
assert.equal(connection({}, { NODE_ENV: 'development', DATABASE_URL: 'local-node' }), 'local-node');
assert.throws(() => connection({}, { NODE_ENV: 'development' }), /Database connection is not configured/);
console.log('Passed: production requires Hyperdrive; local Worker/Node DATABASE_URL fallback remains available.');

function loadHandler(file, dependencies, name) {
  const code = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' })
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
  return vm.runInNewContext(`${code}\n${name}`, { ...dependencies, Response });
}
const GET = loadHandler('app/api/media/[...key]/route.ts', { env: {} }, 'GET');
assert.equal((await GET(null, { params: Promise.resolve({ key: ['a'.repeat(64), '00000000-0000-0000-0000-000000000000.png'] }) })).status, 404);
class BrandingError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}
let authenticated = true;
const POST = loadHandler('app/api/admin/branding/upload/route.ts', {
  env: {}, BrandingError,
  adminContext: async () => { if (!authenticated) throw new BrandingError('Unauthorized', 401); return { storeCode: 'test' }; },
  brandingResponse: error => Response.json({ error: error.message }, { status: error.status }),
}, 'POST');
assert.equal((await POST({})).status, 503);
authenticated = false;
assert.equal((await POST({})).status, 401);
console.log('Passed: absent branding R2 returns 404 for media and 503 for authenticated uploads; authentication still runs first.');
