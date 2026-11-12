import fs from 'node:fs';
import pg from 'pg';
import { parse } from 'dotenv';

// Correct one imported store row against the existing local reference. Never
// modify admin scopes, credentials, menu/orders, or authorization rules.
const apply = process.argv.includes('--apply');
const backup = process.argv[process.argv.indexOf('--backup') + 1];
if (apply && (!process.argv.includes('--backup') || !fs.existsSync(backup) || fs.statSync(backup).size < 1000)) throw new Error('A verified current backup is required.');
const local = parse(fs.readFileSync('.dev.vars'));
const live = parse(fs.readFileSync('.env'));
if (!local.DATABASE_URL || !live.DATABASE_URL || local.DATABASE_URL === live.DATABASE_URL) throw new Error('Expected separate reference and live datasource settings.');
const reference = new pg.Client({ connectionString: local.DATABASE_URL, connectionTimeoutMillis: 10000 });
const target = new pg.Client({ connectionString: live.DATABASE_URL, connectionTimeoutMillis: 10000 });
let transaction = false;
try {
  await reference.connect();
  await reference.query('BEGIN READ ONLY');
  const refs = await reference.query('SELECT storeid::text, storename, store_code, company_code FROM tbl_store WHERE coalesce(is_delete,false)=false');
  if (refs.rowCount !== 1) throw new Error('Expected one unambiguous reference store.');
  const correct = refs.rows[0];
  await reference.query('ROLLBACK');
  await target.connect();
  await target.query('BEGIN'); transaction = true;
  const rows = await target.query('SELECT storeid::text, storename, store_code, company_code FROM tbl_store WHERE storeid=$1::bigint FOR UPDATE', [correct.storeid]);
  const current = rows.rows[0];
  if (!current || current.storename !== correct.storename) throw new Error('Store identity differs; manual review required.');
  if (current.store_code !== correct.company_code || current.company_code !== correct.store_code) throw new Error('Expected precisely reversed codes; no change made.');
  const admins = await target.query('SELECT count(*)::int AS count FROM admin WHERE store_code=$1', [correct.company_code]);
  const items = await target.query('SELECT count(*)::int AS count FROM menu_items WHERE store_code=$1', [correct.store_code]);
  const conflicts = await target.query('SELECT 1 FROM tbl_store WHERE store_code=$1 AND storeid<>$2::bigint AND coalesce(is_delete,false)=false', [correct.store_code, correct.storeid]);
  if (!admins.rows[0].count || !items.rows[0].count || conflicts.rowCount) throw new Error('Tenant consistency checks failed; no change made.');
  const update = await target.query('UPDATE tbl_store SET store_code=$1, company_code=$2 WHERE storeid=$3::bigint AND store_code=$4 AND company_code=$5', [correct.store_code, correct.company_code, correct.storeid, current.store_code, current.company_code]);
  if (update.rowCount !== 1) throw new Error('Expected exactly one changed row.');
  const visible = await target.query('SELECT count(*)::int AS count FROM tbl_store WHERE company_code=$1 AND store_code=$2 AND coalesce(is_delete,false)=false', [correct.company_code, correct.store_code]);
  if (visible.rows[0].count !== 1) throw new Error('Post-update visibility check failed.');
  await target.query(apply ? 'COMMIT' : 'ROLLBACK'); transaction = false;
  console.log(JSON.stringify({ applied: apply, matchedReferenceStore: true, correctedRows: 1, storeCode: correct.store_code, companyCode: correct.company_code, matchingAdminAccounts: admins.rows[0].count, matchingMenuItems: items.rows[0].count }, null, 2));
} catch (error) {
  if (transaction) await target.query('ROLLBACK').catch(() => {});
  console.error('Store-scope repair stopped:', error.code || error.message);
  process.exitCode = 1;
} finally { await reference.end(); await target.end(); }
