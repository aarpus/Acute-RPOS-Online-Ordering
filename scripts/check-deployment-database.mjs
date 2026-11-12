import fs from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';

// Read-only audit of DATABASE_URL, not a substitute for a deployed Hyperdrive probe.
const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error('DATABASE_URL is required for this read-only check.');
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, query_timeout: 10000 });
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  await client.query('SELECT 1');
  console.log('Configured DATABASE_URL: read-only PostgreSQL connection passed.');
  const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
  const models = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .map(match => ({ model: match[1], table: match[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? match[1] }));
  const tables = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")).rows.map(row => row.table_name);
  const expected = models.map(model => model.table);
  const missingTables = expected.filter(name => !tables.includes(name));
  const unmanagedTables = tables.filter(name => name !== '_prisma_migrations' && !expected.includes(name));
  console.log(JSON.stringify({ publicTables: tables.length, applicationTables: tables.filter(name => name !== '_prisma_migrations').length, prismaModels: models.length, missingTables, unmanagedTables }, null, 2));
  if (missingTables.length || unmanagedTables.length) process.exitCode = 1;
  const { rows } = await client.query('SELECT migration_name, checksum, finished_at, rolled_back_at FROM "_prisma_migrations"');
  const applied = new Map(rows.filter(row => row.finished_at && !row.rolled_back_at).map(row => [row.migration_name, row.checksum]));
  const local = fs.readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  const pending = local.filter(name => !applied.has(name));
  const changed = local.filter(name => applied.has(name) && createHash('sha256').update(fs.readFileSync(`prisma/migrations/${name}/migration.sql`)).digest('hex') !== applied.get(name));
  const failed = rows.filter(row => !row.finished_at && !row.rolled_back_at).map(row => row.migration_name);
  const extra = [...applied.keys()].filter(name => !local.includes(name));
  console.log(JSON.stringify({ localMigrations: local.length, appliedMigrations: applied.size, pending, changed, failed, databaseOnly: extra }, null, 2));
  if (pending.length || changed.length || failed.length || extra.length) process.exitCode = 1;
  await client.query('ROLLBACK');
} catch (error) {
  // Do not print connection strings, usernames, hosts, or driver error details.
  console.error('Read-only database audit failed. Code:', typeof error?.code === 'string' ? error.code : 'unavailable');
  process.exitCode = 1;
} finally {
  await client.end();
}
