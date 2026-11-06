// Deliberately limited to the configured localhost database. No credentials are
// placed in command arguments or printed. The dump is ignored by source control.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
const url = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('This helper only backs up a localhost database.');
const directory = resolve('.local-backups');
mkdirSync(directory, { recursive: true });
const file = join(directory, `menu-before-crud-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const exe = name => bin ? join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)), ...(url.searchParams.has('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode') } : {}) };
execFileSync(exe('pg_dump'), ['--format=custom', '--no-owner', '--no-privileges', '--table=public.menu_*', '--table=public._prisma_migrations', '--file', file], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
execFileSync(exe('pg_restore'), ['--list', file], { stdio: 'ignore', windowsHide: true });
if (statSync(file).size < 1000) throw new Error('Backup is unexpectedly small.');
console.log(`Verified local menu backup: ${file}`);
