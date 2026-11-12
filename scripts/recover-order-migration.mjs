import fs from 'node:fs';
import pg from 'pg';

// One-time forward recovery. Reuse only identical existing enum definitions.
// Historical migration files and existing data are never rewritten or dropped.
const name = '20261103120000_create_order_tables';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
const apply = process.argv.includes('--apply');
let transaction = false;
try {
  await client.connect();
  await client.query('BEGIN'); transaction = true;
  const failure = await client.query('SELECT 1 FROM "_prisma_migrations" WHERE migration_name=$1 AND finished_at IS NULL AND rolled_back_at IS NULL', [name]);
  if (failure.rowCount !== 1) throw new Error('Expected exactly one active failed order migration.');
  for (const table of ['orders', 'order_items', 'order_item_options', 'order_transaction', 'order_status_history', 'order_otps']) {
    const result = await client.query('SELECT to_regclass($1) AS relation', [`public.${table}`]);
    if (result.rows[0].relation) throw new Error('An order table already exists; manual review required.');
  }
  let sql = fs.readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8')
    .replace(/^BEGIN;\s*/m, '').replace(/^COMMIT;\s*/m, '');
  const declarations = [...sql.matchAll(/CREATE TYPE "(\w+)" AS ENUM \(([^;]+)\);/g)];
  for (const declaration of declarations) {
    const expected = [...declaration[2].matchAll(/'([^']+)'/g)].map(match => match[1]);
    const result = await client.query("SELECT e.enumlabel::text AS label FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname=$1 ORDER BY e.enumsortorder", [declaration[1]]);
    if (result.rowCount) {
      if (JSON.stringify(result.rows.map(row => row.label)) !== JSON.stringify(expected)) throw new Error('Existing enum differs from migration; manual review required.');
      sql = sql.replace(declaration[0], `-- Reusing verified matching existing enum ${declaration[1]}.`);
      console.log(`Reusing matching enum: ${declaration[1]}`);
    }
  }
  await client.query(sql);
  await client.query(apply ? 'COMMIT' : 'ROLLBACK'); transaction = false;
  console.log(apply ? 'Order migration SQL completed. Verify schema, then resolve this migration as applied.' : 'Recovery probe passed; all probe changes rolled back.');
} catch (error) {
  if (transaction) await client.query('ROLLBACK').catch(() => {});
  console.error('Order recovery stopped:', error.code || String(error.message).replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED]'));
  process.exitCode = 1;
} finally { await client.end(); }
