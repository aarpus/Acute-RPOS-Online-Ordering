// Uses a disposable local PostgreSQL cluster; never reads DATABASE_URL or .env.
// Run: node scripts/test-menu-schema.mjs
// Set PG_BIN if PostgreSQL's bin directory is not on PATH (Windows defaults to PG18).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { Prisma } from '@prisma/client';

const migration = fs.readFileSync(new URL('../prisma/migrations/20261030120000_add_menu_management_tables/migration.sql', import.meta.url), 'utf8');
const models = Prisma.dmmf.datamodel.models.filter(m => m.dbName?.startsWith('menu_') && m.name !== 'MenuSeo');
const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
assert.equal(models.length, 18);
const created = [...migration.matchAll(/CREATE TABLE "([^"]+)"/g)].map(m => m[1]).sort();
assert.deepEqual(created, models.map(m => m.dbName).sort());
assert.doesNotMatch(migration, /\b(?:DROP|TRUNCATE)\s+(?:TABLE|SCHEMA)|\bDELETE\s+FROM/i);
for (const model of models) {
  const store = model.fields.find(f => f.name === 'storeCode');
  assert.equal(store.dbName, 'store_code');
  const block = schema.match(new RegExp(`model ${model.name} \\{([\\s\\S]*?)\\n\\}`))[1];
  assert.match(block, /storeCode\s+String\s+@map\("store_code"\) @db.VarChar\(50\)/);
  assert.match(migration, new RegExp(`CREATE TABLE "${model.dbName}" \\(\\s*"store_code" VARCHAR\\(50\\) NOT NULL`));
  for (const line of block.split('\n').filter(line => line.includes('fields:'))) {
    assert.match(line, /fields: \[storeCode, /);
    assert.match(line, /references: \[storeCode, /);
    assert.match(line, /onDelete: Restrict, onUpdate: Restrict/);
  }
}

const pgBin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const exe = name => pgBin ? path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'online-ordering-menu-test-'));
const data = path.join(root, 'data');
const run = (name, args) => execFileSync(exe(name), args, { windowsHide: true, stdio: 'ignore' });
let started = false;
let db;
let checks = 0;
try {
  run('initdb', ['-D', data, '-A', 'trust', '-U', 'menu_test', '--encoding=UTF8', '--locale=C']);
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -F`, '-w', 'start']);
  started = true;
  db = new pg.Client({ host: '127.0.0.1', port, user: 'menu_test', database: 'postgres' });
  await db.connect();

  // Existing-table sentinels verify migration scope without relying on the
  // production database or the legacy external tbl_store migration baseline.
  const oldTables = Prisma.dmmf.datamodel.models.filter(m => !m.dbName?.startsWith('menu_') && m.name !== 'MenuSeo').map(m => m.dbName);
  for (const table of oldTables) {
    assert.match(table, /^[a-z_]+$/);
    await db.query(`CREATE TABLE "${table}" (sentinel text PRIMARY KEY); INSERT INTO "${table}" VALUES ('preserve-me')`);
  }
  await db.query(migration);
  for (const table of oldTables) assert.equal((await db.query(`SELECT sentinel FROM "${table}"`)).rows[0].sentinel, 'preserve-me');
  const actual = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'menu_%' ORDER BY table_name");
  assert.deepEqual(actual.rows.map(r => r.table_name), created);
  const storeColumns = await db.query("SELECT data_type, character_maximum_length, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name LIKE 'menu_%' AND column_name = 'store_code'");
  assert.equal(storeColumns.rowCount, 18);
  for (const c of storeColumns.rows) assert.deepEqual(c, { data_type: 'character varying', character_maximum_length: 50, is_nullable: 'NO' });
  const foreignKeys = await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype = 'f' AND conrelid::regclass::text LIKE 'menu_%'");
  assert.equal(foreignKeys.rowCount, 19);
  for (const fk of foreignKeys.rows) {
    assert.match(fk.definition, /FOREIGN KEY \(store_code,/);
    assert.match(fk.definition, /REFERENCES menu_\w+\(store_code,/);
    assert.match(fk.definition, /ON UPDATE RESTRICT ON DELETE RESTRICT/);
  }
  const id = () => randomUUID();
  async function insert(table, row) {
    return db.query(`INSERT INTO "${table}" (${Object.keys(row).map(k => `"${k}"`).join(',')}) VALUES (${Object.keys(row).map((_,i) => `$${i+1}`).join(',')})`, Object.values(row));
  }
  async function reject(code, action) {
    await assert.rejects(action, e => (Array.isArray(code) ? code : [code]).includes(e.code));
    checks++;
  }
  const now = new Date();
  const itemA = id(), otherA = id(), itemB = id(), variantA = id(), groupA = id(), offerA = id();
  const item = (store, uuid, external = null) => ({ id:uuid, store_code:store, item_name:'Test', external_item_id:external, updated_at:now });
  await insert('menu_items', item('A', itemA, 'SAME-POS-ID'));
  await insert('menu_items', item('B', itemB, 'SAME-POS-ID'));
  await insert('menu_items', item('A', otherA));
  await reject('23505', () => insert('menu_items', item('A', id(), 'SAME-POS-ID')));
  await reject('23502', () => insert('menu_items', item(null, id())));
  await reject('23514', () => insert('menu_items', item(' ', id())));
  await insert('menu_item_variants', { id:variantA, store_code:'A', menu_item_id:itemA, name:'Full', is_default:true, updated_at:now });
  const inventory = (store, menuItem, variant = null) => ({ id:id(), store_code:store, menu_item_id:menuItem, variant_id:variant, updated_at:now });
  await reject('23503', () => insert('menu_item_inventory', inventory('B', itemA)));
  await reject('23503', () => insert('menu_item_inventory', inventory('A', otherA, variantA)));
  await reject('23503', () => insert('menu_item_inventory', inventory('B', itemB, variantA)));
  await insert('menu_item_inventory', inventory('A', itemA));
  await insert('menu_item_inventory', inventory('A', itemA, variantA));
  await reject('23505', () => insert('menu_item_inventory', inventory('A', itemA)));
  await reject('23505', () => insert('menu_item_inventory', inventory('A', itemA, variantA)));
  await reject('23505', () => insert('menu_item_variants', { id:id(), store_code:'A', menu_item_id:itemA, name:'Half', is_default:true, updated_at:now }));
  await insert('menu_modifier_groups', { id:groupA, store_code:'A', name:'Spice', updated_at:now });
  const assignment = variant => ({ id:id(), store_code:'A', menu_item_id:itemA, modifier_group_id:groupA, variant_id:variant, updated_at:now });
  for (const variant of [null, variantA]) {
    await insert('menu_item_modifier_groups', assignment(variant));
    await reject('23505', () => insert('menu_item_modifier_groups', assignment(variant)));
  }
  await reject('23514', () => insert('menu_modifier_groups', { id:id(), store_code:'A', name:'Bad', min_select:2, max_select:1, updated_at:now }));
  const image = () => ({ id:id(), store_code:'A', menu_item_id:itemA, image_url:'/test.jpg', is_primary:true, updated_at:now });
  await insert('menu_item_images', image());
  await reject('23505', () => insert('menu_item_images', image()));
  const price = variant => ({ id:id(), store_code:'A', menu_item_id:itemA, variant_id:variant, price_type:'delivery', currency:'USD', price:12, updated_at:now });
  for (const variant of [null, variantA]) {
    await insert('menu_item_prices', price(variant));
    await reject('23505', () => insert('menu_item_prices', price(variant)));
    const window = { ...price(variant), start_at:'2026-10-30T00:00:00Z', end_at:'2026-11-30T00:00:00Z' };
    await insert('menu_item_prices', window);
    await reject('23505', () => insert('menu_item_prices', { ...window, id:id() }));
  }
  await reject('23514', () => insert('menu_item_prices', { ...price(null), price:-1, is_active:false }));
  const schedule = { id:id(), store_code:'A', menu_item_id:itemA, timezone:'Asia/Kolkata', days_of_week:'[1,2,3,4,5,6,7]', start_time:'22:00', end_time:'02:00', updated_at:now };
  await insert('menu_item_schedules', schedule); // Overnight windows remain valid.
  await insert('menu_item_schedules', { ...schedule, id:id(), start_time:'10:00', end_time:'14:00' });
  await reject('23514', () => insert('menu_item_schedules', { ...schedule, id:id(), days_of_week:'[8]' }));
  const comboGroup = id();
  await insert('menu_combo_groups', { id:comboGroup, store_code:'A', combo_item_id:itemA, group_name:'Included meal', selection_type:'fixed', min_select:3, max_select:3, is_required:true, updated_at:now });
  for (const name of ['Pizza','Fries','Drink']) await insert('menu_combo_options', { id:id(), store_code:'A', combo_group_id:comboGroup, option_name:name, external_component_item_id:name, is_default:true, updated_at:now });
  await insert('menu_offers', { id:offerA, store_code:'A', offer_name:'BOGO', offer_type:'buy_x_get_y', conditions:'{"buy":[]}', rewards:'{"get":[]}', updated_at:now });
  await insert('menu_offer_usage', { id:id(), store_code:'A', offer_id:offerA, discount_amount:5, updated_at:now });
  await reject('23503', () => insert('menu_offer_usage', { id:id(), store_code:'B', offer_id:offerA, discount_amount:5, updated_at:now }));
  await reject(['23001', '23503'], () => db.query('DELETE FROM menu_offers WHERE id=$1', [offerA]));
  await reject(['23001', '23503'], () => db.query('DELETE FROM menu_items WHERE id=$1', [itemA]));
  await reject('23514', () => insert('menu_sync_settings', { id:id(), store_code:'A', manual_items_protected:false, updated_at:now }));
  await insert('menu_sync_settings', { id:id(), store_code:'A', updated_at:now });
  await reject('23505', () => insert('menu_sync_settings', { id:id(), store_code:'A', updated_at:now }));
  assert.equal((await db.query('SELECT source_type FROM menu_items WHERE id=$1', [otherA])).rows[0].source_type, 'manual');
  console.log(`Passed: 18 tables, 18 required store codes, ${oldTables.length} existing sentinels preserved, store-safe Prisma relations, ${checks} rejected invalid writes, manual defaults, fixed combos and overnight/multiple schedule windows.`);
} finally {
  if (db) await db.end();
  if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
  // Resolve and verify the generated target before recursive cleanup on Windows.
  const resolved = path.resolve(root);
  assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
  assert.ok(path.basename(resolved).startsWith('online-ordering-menu-test-'));
  fs.rmSync(resolved, { recursive:true, force:true });
}
