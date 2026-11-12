import pg from 'pg';
import fs from 'node:fs';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
try {
  await client.connect();
  const enums = await client.query("SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname");
  console.log(JSON.stringify({ existingEnums: enums.rows }, null, 2));
  const { rows } = await client.query('SELECT migration_name, logs FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at');
  for (const row of rows) {
    console.log(row.migration_name);
    const detail = String(row.logs ?? '').replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[REDACTED]');
    console.log(detail.slice(0, 6000));
  }
  if (process.argv.includes('--probe-order-migration')) {
    // Diagnose the first SQL error, then unconditionally roll back every probe
    // change. Never commit or edit migration history from this helper.
    const sql = fs.readFileSync('prisma/migrations/20261103120000_create_order_tables/migration.sql', 'utf8')
      .replace(/^BEGIN;\s*/m, '').replace(/^COMMIT;\s*/m, '');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      console.log('Order migration SQL probe passed; changes rolled back.');
    } catch (error) {
      console.log('Order migration SQL probe:', error.code, error.message);
    } finally { await client.query('ROLLBACK'); }
  }
} catch (error) {
  console.error('Migration inspection failed:', error.code || 'unavailable');
  process.exitCode = 1;
} finally { await client.end(); }
