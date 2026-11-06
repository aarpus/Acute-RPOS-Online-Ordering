// Actual HTTP handlers + Prisma against disposable PostgreSQL. SMTP is mocked.
// Never loads .env and never sends a real email.
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
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'online-order-flow-'));
const data = path.join(root, 'data');
const run = (name, args) => execFileSync(pgBin ? path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')) : name, args, { windowsHide: true, stdio: 'ignore' });
let started = false, client, db;
try {
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'order_test', '--encoding=UTF8', '--locale=C']);
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + port + ' -F', '-w', 'start']);
  started = true;
  const connectionString = 'postgresql://order_test@127.0.0.1:' + port + '/postgres';
  client = new pg.Client({ connectionString }); await client.connect();
  for (const name of ['20261026130500_create_users', '20261028120000_create_admins', '20261030120000_add_menu_management_tables', '20261030150000_menu_crud_and_seo', '20261103120000_create_order_tables', '20261103140000_enable_order_checkout', '20261103160000_fix_order_admin_scope']) {
    await client.query(fs.readFileSync('prisma/migrations/' + name + '/migration.sql', 'utf8'));
  }
  await client.query("CREATE TABLE tbl_store (storeid BIGSERIAL PRIMARY KEY, store_code VARCHAR(50), company_code VARCHAR(50), storename VARCHAR(50), is_delete BOOLEAN DEFAULT false); INSERT INTO tbl_store (store_code, company_code, storename) VALUES ('A','COMPANY_A','Store A'),('A2','COMPANY_A','Store A2'),('B','COMPANY_B','Store B')");
  const makeDb = () => new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  db = makeDb();
  const env = { DATABASE_URL: connectionString, EMAIL_VERIFICATION_SECRET: 'order-test-secret-'.repeat(4) };
  const require = createRequire(import.meta.url), cache = new Map(), sent = [];
  let mailFails = false;
  const sendOrderMail = async message => { if (mailFails) throw Error('test transport failure'); sent.push(message); };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    let source = stripTypeScriptTypes(fs.readFileSync(file, 'utf8'), { mode: 'transform' });
    const names = [...source.matchAll(/export (?:async )?(?:function|class|const|let) (\w+)/g)].map(match => match[1]);
    source = source.replace(/^export \{.*?\} from ['"].*?['"];$/gm, '')
      .replace(/^import \{(.*?)\} from ['"](.*?)['"];$/gm, (_, names, name) => 'const {' + names.replace(/ as /g, ': ') + "} = require('" + name + "');")
      .replace(/^export /gm, '');
    source += '\nObject.assign(exports, {' + names.join(',') + '});';
    new Function('require', 'module', 'exports', source)(name => {
      if (name === 'cloudflare:workers') return { env };
      if (name === './prisma') return { createPrismaClient: makeDb };
      if (name === './order-mail') return { sendOrderMail };
      if (name === './storefront') return { getStorefront: async request => ({ ...load('data/home.ts').homeData, store: { ...load('data/home.ts').homeData.store, code: request.headers.get('x-store-code') || 'A' } }) };
      return name.startsWith('.') ? load(path.resolve(path.dirname(file), name + '.ts')) : require(name);
    }, module, module.exports);
    return module.exports;
  }
  const users = [];
  for (const storeCode of ['A', 'A', 'B']) users.push(await db.user.create({ data: { storeCode, firstName: 'Test', lastName: 'Customer', phoneNumber: '5551234567', email: randomUUID() + '@example.test', passwordHash: 'test-only' } }));
  const admins = [];
  for (const storeCode of ['COMPANY_A', 'COMPANY_B']) admins.push(await db.admin.create({ data: { storeCode, email: randomUUID() + '@example.test', passwordHash: 'test-only' } }));
  const auth = load('lib/auth.ts'), adminAuth = load('lib/admin-auth.ts');
  const cookies = users.map(user => auth.serializeSessionCookie({ userId: user.id, email: user.email, storeCode: user.storeCode }, env.EMAIL_VERIFICATION_SECRET));
  const adminCookies = admins.map(admin => { const c = adminAuth.createAdminSessionCookie(admin, env.EMAIL_VERIFICATION_SECRET); return c.name + '=' + c.value; });
  const { orderRequest } = load('lib/order-http.ts'), service = load('lib/order-service.ts');
  const { homeData } = load('data/home.ts');
  const storefront = { ...homeData, store: { ...homeData.store, code: 'A' } };
  const category = await db.menuCategory.create({ data: { storeCode: 'A', categoryName: 'Test menu' } });
  async function item(name, price = 10, stock = 30, type = 'regular') {
    const row = await db.menuItem.create({ data: { storeCode: 'A', itemName: name, basePrice: price, itemType: type, imageUrl: '/images/biryani.jpg' } });
    await db.menuItemCategory.create({ data: { storeCode: 'A', menuItemId: row.id, categoryId: category.id } });
    const inventory = await db.menuItemInventory.create({ data: { storeCode: 'A', menuItemId: row.id, trackInventory: true, quantityAvailable: stock } });
    return { ...row, inventory };
  }
  const main = await item('Original meal'), component = await item('Extra component', 2, 40);
  const modifierGroup = await db.menuModifierGroup.create({ data: { storeCode: 'A', name: 'Extras', minSelect: 0, maxSelect: 1 } });
  const modifier = await db.menuModifierOption.create({ data: { storeCode: 'A', modifierGroupId: modifierGroup.id, name: 'Extra side', price: 2, linkedItemId: component.id } });
  const link = await db.menuItemModifierGroup.create({ data: { storeCode: 'A', menuItemId: main.id, modifierGroupId: modifierGroup.id } });
  const modifierKey = link.id + ':' + modifier.id;
  function checkout(product = main, extras = [], price = 10, quantity = 1) {
    return { items: [{ productId: product.id, sizeId: 'base', extraIds: extras, quantity, instructions: 'Less spicy' }], mode: 'Pickup',
      customer: { name: 'Receipt customer', phone: '5551234567', street: '', apartment: '', city: '', postalCode: '', instructions: 'Ring bell' },
      schedule: { timing: 'asap', date: '', time: '' }, promo: '', paymentMethod: 'cash', expectedTotal: price * quantity, quotedUnitPrices: [price], idempotencyKey: randomUUID() };
  }
  async function request(method = 'GET', { kind = 'customer', user = 0, admin = 0, store = 'A', id, body, origin = 'https://test.local', cookie, query = '' } = {}) {
    const req = new Request('https://test.local/api/' + (kind === 'admin' ? 'admin/' : '') + 'orders' + (id ? '/' + id : '') + query, {
      method, headers: { origin, cookie: cookie ?? (kind === 'admin' ? adminCookies[admin] : cookies[user]), 'x-store-code': store, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const response = await orderRequest(req, kind, id);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { statusCode: response.status, data: await response.json() };
  }
  const expect = (result, status) => { assert.equal(result.statusCode, status, JSON.stringify(result.data)); return result.data; };
  const post = async body => expect(await request('POST', { body }), 201);
  const action = async (id, action, extra = {}) => request('POST', { kind: 'admin', id, body: { action, ...extra } });
  const quantity = async inventory => Number((await db.menuItemInventory.findUnique({ where: { id: inventory.id } })).quantityAvailable);
  const codeFor = number => sent.filter(m => m.subject === 'Order handover code ' + number).at(-1)?.text.match(/is (\d{6})\./)?.[1];
  const ageOtp = async id => db.orderOtp.updateMany({ where: { orderId: id }, data: { createdAt: new Date(Date.now() - 61000) } });
  expect(await request('GET', { cookie: '' }), 401);
  expect(await request('GET', { kind: 'admin', cookie: '' }), 401);
  expect(await request('POST', { origin: 'https://evil.test', body: checkout() }), 403);
  expect(await request('POST', { user: 2, body: checkout() }), 401);
  expect(await request('GET', { query: '?page=NaN' }), 400);
  expect(await request('POST', { body: { ...checkout(), paymentMethod: 'card' } }), 400);
  expect(await request('POST', { body: { ...checkout(), customer: { name: 'Test', phone: 'abc' } } }), 400);
  expect(await request('POST', { body: { ...checkout(), expectedTotal: 1 } }), 409);
  const attempt = checkout(main, [modifierKey], 12, 2);
  // Concurrent retries create one order and reserve inventory exactly once.
  const responses = await Promise.all([request('POST', { body: attempt }), request('POST', { body: attempt })]);
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 201]);
  const order = responses[0].data;
  assert.equal(responses[1].data.id, order.id);
  assert.equal(order.customerEmail, users[0].email);
  assert.equal(order.items[0].product.extras[0].id, modifierKey);
  assert.equal(await quantity(main.inventory), 28);
  assert.equal(await quantity(component.inventory), 38);
  assert.equal(await db.order.count(), 1);
  assert.equal(await db.orderTransaction.count(), 1);
  assert.equal(sent.filter(m => m.subject.startsWith('Order confirmation')).length, 1);
  assert.ok(order.confirmationSentAt);
  assert.ok(!JSON.stringify(order).includes('otpHash'));
  expect(await request('POST', { body: { ...attempt, customer: { ...attempt.customer, name: 'Changed' } } }), 409);
  expect(await request('POST', { user: 1, body: attempt }), 409);
  expect(await request('GET', { user: 1, id: order.id }), 404);
  expect(await request('GET', { kind: 'admin', admin: 1, store: 'B', id: order.id }), 404);
  expect(await request('GET', { kind: 'admin', store: 'B' }), 403);
  expect(await request('POST', { kind: 'admin', id: order.id, body: { action: 'status', status: 'completed' } }), 409);
  expect(await request('POST', { user: 1, id: order.id, body: { action: 'confirmation' } }), 404);
  expect(await request('POST', { id: order.id, body: { action: 'payment' } }), 403);
  assert.equal(expect(await request('GET', { user: 1 }), 200).total, 0);
  const detail = expect(await request('GET', { id: order.id }), 200);
  assert.equal(detail.orderNumber, order.orderNumber);
  // Snapshot receipt survives catalog and address edits, and user session changes.
  await db.menuItem.update({ where: { id: main.id }, data: { itemName: 'Renamed meal', basePrice: 15 } });
  assert.equal(expect(await request('GET', { id: order.id }), 200).items[0].product.name, 'Original meal');
  assert.equal(expect(await request('GET', { id: order.id }), 200).totals.total, 24);
  expect(await request('POST', { body: attempt }), 200); // Replay ignores new prices.
  assert.equal(expect(await request('GET', { kind: 'admin', query: '?q=' + order.orderNumber }), 200).total, 1);
  const companyOrders = expect(await request('GET', { kind: 'admin', store: '' }), 200);
  assert.equal(companyOrders.total, 1);
  assert.deepEqual(companyOrders.stores.map(store => store.code).sort(), ['A', 'A2']);

  assert.equal(expect(await request('GET', { kind: 'admin', query: '?mode=delivery' }), 200).total, 0);
  expect(await action(order.id, 'status', { status: 'preparing' }), 409);
  for (const status of ['accepted', 'preparing', 'ready']) expect(await action(order.id, 'status', { status }), 200);
  let code = codeFor(order.orderNumber); assert.match(code, /^\d{6}$/);
  const storedOtp = await db.orderOtp.findFirst({ where: { orderId: order.id } });
  assert.notEqual(storedOtp.otpHash, code);
  expect(await action(order.id, 'send_otp'), 429);
  expect(await action(order.id, 'verify_otp', { code }), 409); // Payment gate.
  await Promise.all([action(order.id, 'payment'), action(order.id, 'payment')].map(async result => expect(await result, 200)));
  assert.equal(await db.orderStatusHistory.count({ where: { orderId: order.id, reason: 'Cash payment received.' } }), 1);
  expect(await action(order.id, 'status', { status: 'cancelled', reason: 'Test' }), 409);
  const wrong = code === '000000' ? '111111' : '000000';
  const wrongResults = await Promise.all(Array.from({ length: 5 }, () => action(order.id, 'verify_otp', { code: wrong })));
  assert.deepEqual(wrongResults.map(r => r.statusCode).sort(), [400, 400, 400, 400, 429]);
  assert.equal((await db.orderOtp.findUnique({ where: { id: storedOtp.id } })).attemptCount, 5);
  await ageOtp(order.id);
  const resends = await Promise.all([action(order.id, 'send_otp'), action(order.id, 'send_otp')]);
  assert.deepEqual(resends.map(r => r.statusCode).sort(), [200, 429]);
  code = codeFor(order.orderNumber);
  let active = await db.orderOtp.findFirst({ where: { orderId: order.id, status: 'active' } });
  await db.orderOtp.update({ where: { id: active.id }, data: { createdAt: new Date(Date.now() - 660000), expiresAt: new Date(Date.now() - 1000) } });
  expect(await action(order.id, 'verify_otp', { code }), 400);
  assert.equal((await db.orderOtp.findUnique({ where: { id: active.id } })).status, 'expired');
  expect(await action(order.id, 'send_otp'), 200);
  code = codeFor(order.orderNumber);
  const completions = await Promise.all([action(order.id, 'verify_otp', { code }), action(order.id, 'verify_otp', { code })]);
  assert.deepEqual(completions.map(r => r.statusCode).sort(), [200, 409]);
  assert.equal(await db.orderStatusHistory.count({ where: { orderId: order.id, toStatus: 'completed' } }), 1);
  expect(await action(order.id, 'payment'), 409);
  // Last-unit competition cannot oversell.
  const last = await item('Last item', 5, 1);
  const lastResults = await Promise.all([request('POST', { body: checkout(last, [], 5) }), request('POST', { body: checkout(last, [], 5) })]);
  assert.deepEqual(lastResults.map(r => r.statusCode).sort(), [201, 409]);
  assert.equal(await quantity(last.inventory), 0);
  const lastOrder = lastResults.find(r => r.statusCode === 201).data;
  const cancellations = await Promise.all([action(lastOrder.id, 'status', { status: 'cancelled', reason: 'Customer request' }), action(lastOrder.id, 'status', { status: 'cancelled', reason: 'Customer request' })]);
  assert.deepEqual(cancellations.map(r => r.statusCode).sort(), [200, 409]);
  assert.equal(await quantity(last.inventory), 1);
  // Fixed combo components are saved and reserved, including fractional quantities.
  const combo = await item('Fixed combo', 8, 5, 'combo');
  const comboGroup = await db.menuComboGroup.create({ data: { storeCode: 'A', comboItemId: combo.id, groupName: 'Included', selectionType: 'fixed', minSelect: 1, maxSelect: 1, isRequired: true } });
  await db.menuComboOption.create({ data: { storeCode: 'A', comboGroupId: comboGroup.id, componentItemId: component.id, optionName: 'Half side', quantity: '0.5', extraPrice: 1, isDefault: true } });
  const fixed = await post(checkout(combo, [], 9));
  assert.equal(await quantity(combo.inventory), 4);
  assert.equal(await quantity(component.inventory), 37.5);
  assert.ok(fixed.items[0].extraIds.some(id => id.startsWith('fixed:')));
  assert.equal(fixed.items[0].product.sizes[0].price, 9);
  expect(await action(fixed.id, 'status', { status: 'cancelled', reason: 'Cancel combo' }), 200);
  assert.equal(await quantity(component.inventory), 38);
  const fractionalPart = await item('Fractional component', 1, 0.3);
  const fractionalCombo = await item('Fractional combo', 4, 5, 'combo');
  const fractionalGroup = await db.menuComboGroup.create({ data: { storeCode: 'A', comboItemId: fractionalCombo.id, groupName: 'Fractional included', selectionType: 'fixed', minSelect: 1, maxSelect: 1, isRequired: true } });
  await db.menuComboOption.create({ data: { storeCode: 'A', comboGroupId: fractionalGroup.id, componentItemId: fractionalPart.id, optionName: 'Tenth', quantity: '0.1', extraPrice: 0, isDefault: true } });
  const fractional = await post(checkout(fractionalCombo, [], 4, 3));
  assert.equal(await quantity(fractionalPart.inventory), 0);
  expect(await action(fractional.id, 'status', { status: 'cancelled', reason: 'Restore fractional stock' }), 200);
  assert.equal(await quantity(fractionalPart.inventory), 0.3);
  // Selectable combos preserve selection keys and charge once.
  await db.menuComboGroup.update({ where: { id: comboGroup.id }, data: { selectionType: 'selectable' } });
  const componentOption = await db.menuComboOption.findFirst({ where: { comboGroupId: comboGroup.id } });
  const selectable = await post(checkout(combo, ['combo:' + componentOption.id], 9));
  assert.equal(selectable.totals.total, 9);
  assert.equal(selectable.items[0].product.extras[0].price, 1);
  expect(await action(selectable.id, 'status', { status: 'cancelled', reason: 'Cancel' }), 200);
  // Tracked backorders decrement and restore rather than silently skipping stock.
  const backorder = await item('Backorder', 3, 0);
  await db.menuItemInventory.update({ where: { id: backorder.inventory.id }, data: { allowBackorder: true } });
  const back = await post(checkout(backorder, [], 3, 2));
  assert.equal(await quantity(backorder.inventory), -2);
  expect(await action(back.id, 'status', { status: 'cancelled', reason: 'Cancel' }), 200);
  assert.equal(await quantity(backorder.inventory), 0);
  // Delivery/schedule persistence and failed email recovery.
  const deliveryItem = await item('Delivery meal', 7, 10);
  const deliveryBody = checkout(deliveryItem, [], 7);
  deliveryBody.mode = 'Delivery'; deliveryBody.expectedTotal = 10.99;
  deliveryBody.customer = { ...deliveryBody.customer, street: 'Main Street', apartment: '10', city: 'Boston', state: 'MA', country: 'US', postalCode: '02108' };
  deliveryBody.schedule = { timing: 'later', date: load('lib/order.ts').localDate(new Date(Date.now() + 86400000), homeData.store.timezone), time: homeData.ordering.timeSlots[0] };
  mailFails = true;
  const delivery = await post(deliveryBody);
  assert.ok(delivery.warning);
  assert.equal(delivery.schedule.timing, 'later');
  assert.equal(delivery.schedule.date, deliveryBody.schedule.date);
  assert.equal(delivery.customer.apartment, '10');
  assert.equal(delivery.confirmationSentAt, null);
  expect(await action(delivery.id, 'confirmation'), 429);
  await db.order.update({ where: { id: delivery.id }, data: { confirmationAttemptAt: new Date(Date.now() - 61000) } });
  expect(await action(delivery.id, 'confirmation'), 502);
  mailFails = false;
  await db.order.update({ where: { id: delivery.id }, data: { confirmationAttemptAt: new Date(Date.now() - 61000) } });
  expect(await action(delivery.id, 'confirmation'), 200);
  for (const status of ['accepted', 'preparing', 'ready']) expect(await action(delivery.id, 'status', { status }), 200);
  expect(await action(delivery.id, 'send_otp'), 409);
  mailFails = true;
  const dispatched = expect(await action(delivery.id, 'status', { status: 'out_for_delivery' }), 200);
  assert.ok(dispatched.warning);
  assert.equal(dispatched.order.status, 'out_for_delivery');
  assert.equal(dispatched.order.otp.status, 'revoked');
  mailFails = false; await ageOtp(delivery.id);
  expect(await action(delivery.id, 'send_otp'), 200);
  expect(await action(delivery.id, 'payment'), 200);
  expect(await action(delivery.id, 'verify_otp', { code: codeFor(delivery.orderNumber) }), 200);
  const publicView = expect(await request('GET', { id: delivery.id }), 200);
  assert.equal(publicView.status, 'completed'); assert.equal(publicView.paymentStatus, 'paid');
  assert.ok(!('otp' in publicView));
  // All email bodies are captured locally; no real SMTP module was loaded.
  assert.ok(sent.every(message => message.to.endsWith('@example.test') && !message.html.includes('<script>')));
  console.log('Passed: real handlers/auth, scoped reads/writes, order snapshots, schedule, cash, idempotency, concurrent inventory/cancellation/payment/OTP, fixed/selectable combos, backorders, email failure/retry and complete pickup/delivery lifecycle. No real emails sent.');
} finally {
  await db?.$disconnect(); await client?.end();
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(resolved).startsWith('online-order-flow-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
