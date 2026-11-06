import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Test the running Worker, not mocked route modules. Only creates/deletes a
// uniquely named test user and that user's addresses; existing users are untouched.
const base = process.env.ADDRESS_TEST_URL || 'http://localhost:5173';
const vars = {};
if (fs.existsSync('.dev.vars')) for (const line of fs.readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) vars[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
}
const connectionString = vars.DATABASE_URL || process.env.DATABASE_URL;
const secret = vars.EMAIL_VERIFICATION_SECRET || process.env.EMAIL_VERIFICATION_SECRET;
const storeCode = vars.STORE_CODE || process.env.STORE_CODE;
assert.ok(connectionString && secret && storeCode, 'Configure database, session secret and server STORE_CODE.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const userId = randomUUID();
try {
  await db.user.create({ data: { id: userId, storeCode, firstName: 'Address', lastName: 'HTTP Test', email: `address-test-${userId}@example.invalid`, phoneNumber: '2025550100', passwordHash: 'test-only-no-login' } });
  const payload = Buffer.from(JSON.stringify({ userId, email: `address-test-${userId}@example.invalid`, storeCode, expiresAt: Date.now() + 600000 })).toString('base64url');
  const signature = createHmac('sha256', secret).update(`session\0${payload}`).digest('base64url');
  async function request(method, suffix = '', body) {
    const response = await fetch(base + '/api/addresses' + suffix, { method, headers: { cookie: `st_session=${payload}.${signature}`, origin: base, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    console.log(method, suffix || '/', response.status, text.slice(0, 400));
    assert.ok(response.ok, text);
    return JSON.parse(text);
  }
  await request('GET');
  const input = { shippingName: 'Address HTTP Test', shippingPhone: '2025550100', flatHouseNo: '10', areaStreet: 'Test Street', city: 'Boston', state: 'MA', pincode: '02108', country: 'US', addressType: 'Home', isDefault: true };
  let result = await request('POST', '', input);
  const id = result.addresses[0].id;
  assert.equal((await db.userAddress.findUnique({ where: { id } })).city, 'Boston');
  assert.equal((await request('GET')).addresses[0].id, id);
  await request('PUT', '/' + id, { ...input, city: 'Cambridge' });
  assert.equal((await db.userAddress.findUnique({ where: { id } })).city, 'Cambridge');
  result = await request('POST', '', { ...input, addressType: 'Work', isDefault: false });
  const second = result.addresses.find(address => address.id !== id);
  await request('PATCH', '/' + second.id);
  assert.equal((await db.userAddress.findUnique({ where: { id: second.id } })).isDefault, true);
  await request('DELETE', '/' + second.id);
  await request('DELETE', '/' + id);
  assert.equal(await db.userAddress.count({ where: { userId } }), 0);
  console.log('Passed: running Worker CRUD/default routes and independent PostgreSQL persistence checks.');
} finally {
  await db.user.deleteMany({ where: { id: userId, email: `address-test-${userId}@example.invalid` } });
  await db.$disconnect();
}
