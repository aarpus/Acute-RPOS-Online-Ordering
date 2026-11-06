// Runs actual route handlers, session validation and Prisma against disposable
// PostgreSQL. Never reads .env or modifies the application's database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const pgBin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acute-address-test-'));
const dataDir = path.join(root, 'data');
const run = (name, args) => execFileSync(pgBin ? path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')) : name, args, { windowsHide: true, stdio: 'ignore' });
let started = false, client, db;
try {
  run('initdb', ['-D', dataDir, '-A', 'trust', '-U', 'address_test', '--encoding=UTF8', '--locale=C']);
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  run('pg_ctl', ['-D', dataDir, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -F`, '-w', 'start']);
  started = true;
  const connectionString = `postgresql://address_test@127.0.0.1:${port}/postgres`;
  client = new pg.Client({ connectionString }); await client.connect();
  for (const migration of ['20261026130500_create_users', '20261102090000_create_user_addresses']) {
    await client.query(fs.readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
  }
  const makeDb = () => new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  db = makeDb();
  const users = [];
  for (const storeCode of ['A', 'A', 'B']) users.push(await db.user.create({ data: { id: randomUUID(), storeCode, firstName: 'Test', lastName: 'Customer', phoneNumber: '5551234567', email: `${randomUUID()}@example.com`, passwordHash: 'unused' } }));
  const env = { DATABASE_URL: connectionString, EMAIL_VERIFICATION_SECRET: 'test-secret-'.repeat(5), STORE_CODE: 'A' };
  const require = createRequire(import.meta.url), cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    let source = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' });
    const names = [...source.matchAll(/export (?:async )?(?:function|class|const|let) (\w+)/g)].map(match => match[1]);
    source = source.replace(/^export \{.*?\} from ['"].*?['"];$/gm, '')
      .replace(/^import \{(.*?)\} from ['"](.*?)['"];$/gm, (_, names, name) => `const {${names.replace(/ as /g, ': ')}} = require('${name}');`)
      .replace(/^export /gm, '');
    source += `\nObject.assign(exports, {${names.join(',')}});`;
    new Function('require', 'module', 'exports', source)(name => {
      if (name === 'cloudflare:workers') return { env };
      if (name === './prisma') return { createPrismaClient: makeDb };
      if (name === './storefront') return { getStorefront: () => { throw Error('Address scope must not use client store selection'); } };
      return name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
    }, module, module.exports);
    return module.exports;
  }
  const auth = load('lib/auth.ts');
  const collection = load('app/api/addresses/route.ts'), item = load('app/api/addresses/[id]/route.ts');
  const { addressCustomer, customerForUser } = load('lib/address.ts');
  const cookies = users.map(user => auth.serializeSessionCookie({ userId: user.id, email: user.email, storeCode: user.storeCode }, env.EMAIL_VERIFICATION_SECRET));
  async function request(method, { user = 0, id, body, cookie = cookies[user], origin = 'https://test.local', store = 'B' } = {}) {
    const req = new Request('https://test.local/api/addresses' + (id ? '/' + id : '') + '?store_code=B&user_id=' + users[1].id, {
      method, headers: { origin, cookie, 'x-store-code': store, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const response = await (id ? item[method](req, { params: Promise.resolve({ id }) }) : collection[method](req));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, ...await response.json() };
  }
  const input = { shippingName: 'Test Customer', shippingPhone: '5551234567', flatHouseNo: '10', areaStreet: 'Main Street', city: 'Boston', state: 'MA', pincode: '02108', addressType: 'Home', country: 'US', deliveryInstructions: 'Ring bell' };
  assert.equal((await request('GET', { cookie: '' })).status, 401);
  assert.equal((await request('GET', { user: 2 })).status, 401);
  assert.equal((await request('POST', { origin: 'https://evil.test', body: input })).status, 403);
  for (const invalid of [{ pincode: '1234' }, { pincode: '123456' }, { state: 'XX' }, { country: 'CA' }, { shippingName: '' }, { flatHouseNo: '' }, { areaStreet: '' }, { shippingPhone: 'abc' }, { city: '' }, { shippingName: 'x'.repeat(101) }, { isDefault: 'true' }]) {
    assert.equal((await request('POST', { body: { ...input, ...invalid } })).status, 400);
  }
  let result = await request('POST', { body: { ...input, userId: users[1].id, storeCode: 'B' } });
  assert.equal(result.status, 201);
  const first = result.addresses[0]; assert.equal(first.isDefault, true); assert.equal(first.userId, users[0].id); assert.equal(first.storeCode, 'A');
  result = await request('POST', { body: { ...input, pincode: '02108-1234', addressType: 'Work' } });
  assert.equal(result.addresses.length, 2); const second = result.addresses.find(a => a.id !== first.id);
  assert.equal((await request('GET', { user: 1 })).addresses.length, 0);
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal((await request(method, { user: 1, id: first.id, body: method === 'PUT' ? input : undefined })).status, 404);
  assert.equal((await request('DELETE', { id: 'invalid' })).status, 404);
  result = await request('PUT', { id: second.id, body: { ...input, city: 'Cambridge', isDefault: true } });
  assert.equal(result.addresses[0].id, second.id); assert.equal(result.addresses[0].city, 'Cambridge');
  await Promise.all(Array.from({ length: 8 }, (_, i) => request('PATCH', { id: i % 2 ? first.id : second.id }).then(r => assert.equal(r.status, 200))));
  result = await request('GET'); assert.equal(result.addresses.filter(a => a.isDefault).length, 1);
  // Database index also protects against writers that bypass the API.
  await assert.rejects(db.userAddress.update({ where: { id: result.addresses.find(a => !a.isDefault).id }, data: { isDefault: true } }), e => e.code === 'P2002');
  const customer = addressCustomer(result.addresses[0]); const snapshot = JSON.parse(JSON.stringify(customer));
  assert.deepEqual(customerForUser(customer, users[0].id, users[0]), customer);
  const otherDraft = customerForUser(customer, users[0].id, users[1]);
  assert.equal(otherDraft.street, ''); assert.equal(otherDraft.postalCode, ''); assert.equal(otherDraft.state, undefined);
  assert.equal(customer.state, 'MA'); assert.equal(customer.country, 'US'); assert.equal(customer.apartment, '10'); assert.equal(customer.street, 'Main Street'); assert.equal(customer.instructions, 'Ring bell');
  result = await request('DELETE', { id: result.addresses[0].id });
  assert.equal(result.addresses.length, 1); assert.equal(result.addresses[0].isDefault, true);
  assert.deepEqual(customer, snapshot); // Saved-address mutation never edits order snapshots.
  env.STORE_CODE = 'B';
  assert.equal((await request('GET')).status, 401);
  result = await request('POST', { user: 2, body: input }); assert.equal(result.status, 201); assert.equal(result.addresses[0].storeCode, 'B');
  assert.equal((await request('DELETE', { user: 2, id: first.id })).status, 404);
  env.STORE_CODE = 'A';
  assert.equal((await request('GET')).addresses.length, 1);
  // Concurrent first addresses also leave one default.
  await Promise.all([1, 2].map(() => request('POST', { user: 1, body: input }).then(r => assert.equal(r.status, 201))));
  assert.equal((await request('GET', { user: 1 })).addresses.filter(a => a.isDefault).length, 1);
  console.log('Passed: migrations, authenticated CRUD routes, default switching/concurrency/index, ZIP/state/required fields, checkout mapping, order snapshots, user/store isolation and forged scope rejection.');
} finally {
  await db?.$disconnect(); await client?.end();
  if (started) run('pg_ctl', ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
  if (path.isAbsolute(relative) || relative.startsWith('..') || !path.basename(root).startsWith('acute-address-test-')) throw Error('Unsafe temporary cleanup path.');
  fs.rmSync(root, { recursive: true, force: true });
}
