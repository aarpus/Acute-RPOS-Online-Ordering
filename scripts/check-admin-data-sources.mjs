import fs from 'node:fs';
import pg from 'pg';
import { parse } from 'dotenv';

const sources = ['.env', '.dev.vars'].map(file => ({ file, env: fs.existsSync(file) ? parse(fs.readFileSync(file)) : {} }));
const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const tables = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)].map(match => match[2].match(/@@map\("([^"]+)"\)/)?.[1] ?? match[1]);
for (const { file, env } of sources) {
  if (!env.DATABASE_URL) continue;
  const client = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10000, query_timeout: 10000 });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const counts = {};
    const available = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.map(row => row.table_name);
    for (const table of tables) {
      if (available.includes(table)) counts[table] = Number((await client.query(`SELECT count(*) AS count FROM public."${table}"`)).rows[0].count);
    }
    const admins = await client.query('SELECT store_code AS admin_scope, role, count(*)::int AS accounts FROM admin GROUP BY store_code, role ORDER BY store_code, role');
    const stores = await client.query('SELECT store_code, company_code, is_active, coalesce(is_delete,false) AS is_deleted FROM tbl_store ORDER BY storeid');
    const scopes = {};
    for (const table of ['menu_items', 'menu_categories', 'orders', 'users', 'tbl_website_branding']) {
      if (available.includes(table)) scopes[table] = (await client.query(`SELECT store_code, count(*)::int AS rows FROM "${table}" GROUP BY store_code ORDER BY store_code`)).rows;
    }
    console.log(JSON.stringify({ source: file, tableCounts: counts, adminScopes: admins.rows, storeScopes: stores.rows, dataScopes: scopes }, null, 2));
    await client.query('ROLLBACK');
  } catch (error) {
    console.error(JSON.stringify({ source: file, checkFailed: error.code || 'unavailable' }));
    process.exitCode = 1;
  } finally { await client.end(); }
}
