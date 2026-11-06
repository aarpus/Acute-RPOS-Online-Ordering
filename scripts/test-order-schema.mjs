// Disposable PostgreSQL only. Never reads .env or the configured DATABASE_URL.
// Run: npm run test:orders:schema (PG_BIN may override the PostgreSQL bin path).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const migrationName = '20261103120000_create_order_tables';
const readMigration = name => fs.readFileSync(new URL('../prisma/migrations/' + name + '/migration.sql', import.meta.url), 'utf8');
const migration = readMigration(migrationName);
const tables = ['orders', 'order_items', 'order_item_options', 'order_transaction', 'order_status_history', 'order_otps'].sort();
assert.deepEqual([...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]).sort(), tables);
assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE)\s+(?:TABLE|SCHEMA)|\bDELETE\s+FROM/i);

const pgBin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const exe = name => pgBin ? path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'online-ordering-order-test-'));
const data = path.join(root, 'data');
const run = (name, args) => execFileSync(exe(name), args, { windowsHide: true, stdio: 'ignore' });
let started = false, db, prisma;
let checks = 0;
try {
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'order_test', '--encoding=UTF8', '--locale=C']);
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', '-h 127.0.0.1 -p ' + port + ' -F', '-w', 'start']);
  started = true;
  const config = { host: '127.0.0.1', port, user: 'order_test', database: 'postgres' };
  db = new pg.Client(config);
  await db.connect();
  for (const name of ['20261026130500_create_users', '20261028120000_create_admins', '20261030120000_add_menu_management_tables']) {
    await db.query(readMigration(name));
  }
  const now = new Date();
  const ids = { userA: randomUUID(), userB: randomUUID(), adminA: randomUUID(), adminB: randomUUID(), menuA: randomUUID(), menuB: randomUUID() };
  const insert = (table, row) => db.query(
    'INSERT INTO "' + table + '" (' + Object.keys(row).map(k => '"' + k + '"').join(',') + ') VALUES (' + Object.keys(row).map((_, i) => '$' + (i + 1)).join(',') + ')',
    Object.values(row));
  const reject = async (code, action) => {
    await assert.rejects(action, error => (Array.isArray(code) ? code : [code]).includes(error.code));
    checks++;
  };
  for (const store of ['A', 'B']) {
    await insert('users', { id: ids['user' + store], store_code: store, first_name: 'Customer', last_name: store, phone_number: '5551234567', email: 'customer@example.test', password_hash: 'sentinel-user', updated_at: now });
    await insert('admin', { id: ids['admin' + store], store_code: store, email: 'staff@example.test', password_hash: 'sentinel-admin', updated_at: now });
    await insert('menu_items', { id: ids['menu' + store], store_code: store, item_name: 'Original item', base_price: 10, updated_at: now });
  }
  // Preserve complete existing rows across migration, including credentials.
  const before = {};
  for (const table of ['users', 'admin', 'menu_items']) before[table] = (await db.query('SELECT * FROM "' + table + '" ORDER BY id')).rows;
  await db.query(migration);
  await db.query(readMigration('20261103140000_enable_order_checkout'));
  await db.query(readMigration('20261103160000_fix_order_admin_scope'));
  for (const table of Object.keys(before)) assert.deepEqual((await db.query('SELECT * FROM "' + table + '" ORDER BY id')).rows, before[table]);
  const actual = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name", [tables]);
  assert.deepEqual(actual.rows.map(r => r.table_name), tables);
  const fks = await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text = ANY($1::text[])", [tables]);
  assert.equal(fks.rowCount, 11);
  for (const fk of fks.rows) {
    if (!fk.definition.includes('REFERENCES admin(id)')) assert.match(fk.definition, /FOREIGN KEY \(store_code,/);
    assert.match(fk.definition, /ON UPDATE RESTRICT ON DELETE RESTRICT/);
  }
  const order = (store = 'A') => ({
    id: randomUUID(), store_code: store, order_number: randomUUID(), user_id: ids['user' + store],
    order_type: 'pickup', customer_name: 'Receipt name', customer_phone: '5551234567',
    customer_email: 'receipt@example.test', currency: 'USD', subtotal: 10, grand_total: 10,
    idempotency_key: randomUUID(), updated_at: now
  });
  const a = order(), b = { ...order('B'), order_number: a.order_number, idempotency_key: a.idempotency_key };
  await insert('orders', a);
  await insert('orders', b); // Same keys in a different store are valid.
  await reject('23505', () => insert('orders', { ...order(), order_number: a.order_number }));
  await reject('23505', () => insert('orders', { ...order(), idempotency_key: a.idempotency_key }));
  await reject('23503', () => insert('orders', { ...order(), user_id: ids.userB }));
  await reject('23502', () => insert('orders', { ...order(), customer_email: null }));
  await reject('23514', () => insert('orders', { ...order(), customer_email: ' ' }));
  await reject('22P02', () => insert('orders', { ...order(), status: 'unknown' }));
  for (const field of ['subtotal', 'discount_amount', 'tax_amount', 'delivery_fee', 'grand_total']) {
    for (const value of [-1, 'NaN']) await reject('23514', () => insert('orders', { ...order(), [field]: value }));
  }
  await reject('23514', () => insert('orders', { ...order(), timing: 'scheduled' }));
  await reject('23514', () => insert('orders', { ...order(), scheduled_at: now }));
  await reject('23514', () => insert('orders', { ...order(), order_type: 'delivery' }));
  await reject('23514', () => insert('orders', { ...order(), order_type: 'delivery', delivery_address: 'null' }));
  await insert('orders', { ...order(), timing: 'scheduled', scheduled_at: new Date(now.getTime() + 3600000), order_type: 'delivery', delivery_address: '{"city":"Test city","postalCode":"10001"}' });
  const item = () => ({ id: randomUUID(), store_code: 'A', order_id: a.id, menu_item_id: ids.menuA, item_name: 'Receipt item', quantity: 1, base_unit_price: 10, unit_price: 10, subtotal: 10, line_total: 10 });
  const line = item();
  await insert('order_items', line);
  await reject('23503', () => insert('order_items', { ...item(), order_id: b.id }));
  await reject('23503', () => insert('order_items', { ...item(), menu_item_id: ids.menuB }));
  await reject('23514', () => insert('order_items', { ...item(), quantity: 0 }));
  for (const field of ['base_unit_price', 'options_unit_total', 'unit_price', 'subtotal', 'discount_amount', 'tax_amount', 'line_total']) {
    for (const value of [-1, 'NaN']) await reject('23514', () => insert('order_items', { ...item(), [field]: value }));
  }
  const option = () => ({ id: randomUUID(), store_code: 'A', order_item_id: line.id, option_type: 'modifier', option_name: 'Cheese', additional_unit_price: 1 });
  await insert('order_item_options', option());
  await insert('order_item_options', { ...option(), option_type: 'combo', quantity: '0.5' });
  await reject('23503', () => insert('order_item_options', { ...option(), store_code: 'B' }));
  for (const quantity of [0, -1, 'NaN']) await reject('23514', () => insert('order_item_options', { ...option(), quantity }));
  for (const value of [-1, 'NaN']) await reject('23514', () => insert('order_item_options', { ...option(), additional_unit_price: value }));
  const transaction = () => ({ id: randomUUID(), store_code: 'A', order_id: a.id, payment_method: 'pay_at_pickup', amount: 10, currency: 'USD', idempotency_key: randomUUID(), updated_at: now });
  const payment = transaction();
  await insert('order_transaction', payment);
  await insert('order_transaction', { ...transaction(), store_code: 'B', order_id: b.id, idempotency_key: payment.idempotency_key });
  await reject('23505', () => insert('order_transaction', { ...transaction(), idempotency_key: payment.idempotency_key }));
  await reject('23503', () => insert('order_transaction', { ...transaction(), order_id: b.id }));
  await reject('23503', () => insert('order_transaction', { ...transaction(), collected_by_admin_id: randomUUID() }));
  for (const amount of [-1, 'NaN']) await reject('23514', () => insert('order_transaction', { ...transaction(), amount }));
  await db.query("UPDATE order_transaction SET status = 'success', collected_by_admin_id = $1, paid_at = $2 WHERE id = $3", [ids.adminA, now, payment.id]);
  const event = () => ({ id: randomUUID(), store_code: 'A', order_id: a.id, to_status: 'placed', actor_type: 'system' });
  await insert('order_status_history', event());
  await insert('order_status_history', { ...event(), actor_type: 'customer', actor_user_id: ids.userA });
  await insert('order_status_history', { ...event(), actor_type: 'admin', actor_admin_id: ids.adminA });
  await reject('23503', () => insert('order_status_history', { ...event(), order_id: b.id }));
  await reject('23503', () => insert('order_status_history', { ...event(), actor_type: 'admin', actor_admin_id: randomUUID() }));
  await reject('23503', () => insert('order_status_history', { ...event(), actor_type: 'customer', actor_user_id: ids.userB }));
  await reject('23514', () => insert('order_status_history', { ...event(), actor_type: 'admin' }));
  await reject('23514', () => insert('order_status_history', { ...event(), actor_admin_id: ids.adminA }));
  await reject('23514', () => insert('order_status_history', { ...event(), actor_type: 'customer', actor_user_id: ids.userA, actor_admin_id: ids.adminA }));
  const otp = () => ({ id: randomUUID(), store_code: 'A', order_id: a.id, purpose: 'pickup_handover', otp_hash: 'test-only-hash', recipient_email: 'receipt@example.test', created_at: now, expires_at: new Date(now.getTime() + 600000), updated_at: now });
  const firstOtp = otp();
  await insert('order_otps', firstOtp);
  const defaults = (await db.query('SELECT attempt_count, max_attempts, send_count, status FROM order_otps WHERE id = $1', [firstOtp.id])).rows[0];
  assert.deepEqual(defaults, { attempt_count: 0, max_attempts: 5, send_count: 0, status: 'active' });
  await reject('23505', () => insert('order_otps', otp()));
  await reject('23503', () => insert('order_otps', { ...otp(), store_code: 'B' }));
  await reject('23502', () => insert('order_otps', { ...otp(), expires_at: null }));
  for (const fields of [{ attempt_count: -1 }, { attempt_count: 6 }, { max_attempts: 0 }, { send_count: -1 }, { recipient_email: ' ' }, { otp_hash: '' }, { expires_at: now }, { status: 'verified' }]) {
    await reject('23514', () => insert('order_otps', { ...otp(), ...fields }));
  }
  await reject('23503', () => insert('order_otps', { ...otp(), status: 'verified', verified_at: now, verified_by_admin_id: randomUUID() }));
  await db.query("UPDATE order_otps SET status = 'revoked' WHERE id = $1", [firstOtp.id]);
  const replacement = otp();
  await insert('order_otps', replacement);
  await db.query("UPDATE order_otps SET status = 'verified', verified_at = $1, verified_by_admin_id = $2 WHERE id = $3", [now, ids.adminA, replacement.id]);
  await insert('order_otps', otp()); // Verified/revoked history does not block new active OTP.
  await insert('order_otps', { ...otp(), purpose: 'delivery_handover' });
  await reject('23505', () => db.query("UPDATE order_otps SET status = 'active', verified_at = NULL, verified_by_admin_id = NULL WHERE id = $1", [replacement.id]));
  for (const [table, id] of [['orders', a.id], ['order_items', line.id], ['users', ids.userA], ['admin', ids.adminA], ['menu_items', ids.menuA]]) {
    await reject(['23001', '23503'], () => db.query('DELETE FROM "' + table + '" WHERE id = $1', [id]));
  }
  // Snapshot names/prices stay independent of later catalog/account edits.
  await db.query("UPDATE menu_items SET item_name = 'New name', base_price = 50 WHERE id = $1", [ids.menuA]);
  await db.query("UPDATE users SET email = 'changed@example.test' WHERE id = $1", [ids.userA]);
  prisma = new PrismaClient({ adapter: new PrismaPg(config) });
  const receipt = await prisma.order.findUnique({
    where: { storeCode_id: { storeCode: 'A', id: a.id } },
    include: { items: { include: { options: true } }, transactions: true, statusHistory: true, otps: true }
  });
  assert.equal(receipt.customerEmail, 'receipt@example.test');
  assert.equal(receipt.items[0].itemName, 'Receipt item');
  assert.equal(receipt.items[0].unitPrice.toFixed(2), '10.00');
  assert.equal(receipt.items[0].options.length, 2);
  assert.equal(receipt.transactions[0].status, 'success');
  assert.equal(receipt.statusHistory.length, 3);
  assert.equal(receipt.otps.length, 4);
  console.log('Passed: 6 tables, preserved existing rows, 11 restrictive FKs (store-scoped orders/customers and company-admin actors), email OTP lifecycle, receipt snapshots, Prisma relations and ' + checks + ' rejected invalid writes.');
} finally {
  if (prisma) await prisma.$disconnect();
  if (db) await db.end();
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(resolved).startsWith('online-ordering-order-test-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
