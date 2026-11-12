import fs from 'node:fs';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { parse } from 'dotenv';

// Read-only diagnostics; never print account identities, hashes or secret values.
const localSecrets = fs.existsSync('.dev.vars') ? parse(fs.readFileSync('.dev.vars')) : {};
const fileEnv = fs.existsSync('.env') ? parse(fs.readFileSync('.env')) : {};
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not configured.');
console.log(JSON.stringify({
  localSigningSecretConfigured: String(localSecrets.EMAIL_VERIFICATION_SECRET || fileEnv.EMAIL_VERIFICATION_SECRET || '').length >= 32,
  localDatabaseSettingsMatch: !localSecrets.DATABASE_URL || localSecrets.DATABASE_URL === connectionString,
}, null, 2));
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 10000 }) });
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
try {
  const adminCount = await db.admin.count();
  const storeCount = await db.store.count();
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const { rows } = await client.query(`SELECT
    count(*) FILTER (WHERE email <> lower(btrim(email)))::int AS unnormalized_emails,
    count(*) FILTER (WHERE password_hash !~ '^pbkdf2\\$[0-9]+\\$[0-9a-f]+\\$[0-9a-f]+$')::int AS unsupported_password_formats
    FROM admin`);
  const duplicates = await client.query('SELECT count(*)::int AS groups FROM (SELECT lower(btrim(email)) FROM admin GROUP BY lower(btrim(email)) HAVING count(*) > 1) duplicate_emails');
  console.log(JSON.stringify({ adminCount, storeCount, ...rows[0], duplicateAdminEmailGroups: duplicates.rows[0].groups, prismaAdminQueries: 'passed' }, null, 2));
  const visibility = await client.query(`SELECT a.role,
    (SELECT count(*)::int FROM tbl_store s WHERE s.company_code=a.store_code AND coalesce(s.is_delete,false)=false) AS visible_stores,
    (SELECT count(*)::int FROM menu_items m WHERE m.archived_at IS NULL AND EXISTS (SELECT 1 FROM tbl_store s WHERE s.company_code=a.store_code AND s.store_code=m.store_code AND coalesce(s.is_delete,false)=false)) AS visible_items,
    (SELECT count(*)::int FROM orders o WHERE EXISTS (SELECT 1 FROM tbl_store s WHERE s.company_code=a.store_code AND s.store_code=o.store_code AND coalesce(s.is_delete,false)=false)) AS visible_orders,
    (SELECT count(*)::int FROM users u WHERE EXISTS (SELECT 1 FROM tbl_store s WHERE s.company_code=a.store_code AND s.store_code=u.store_code AND coalesce(s.is_delete,false)=false)) AS visible_customers
    FROM admin a ORDER BY a.role`);
  console.log(JSON.stringify({ visibilityByAdminRole: visibility.rows }, null, 2));
  await client.query('ROLLBACK');
} catch (error) {
  console.error('Admin readiness check failed:', error.code || 'unavailable');
  process.exitCode = 1;
} finally {
  await db.$disconnect();
  await client.end();
}
