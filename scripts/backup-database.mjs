import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Credentials go only to child-process environment variables, never arguments/logs.
const url = new URL(process.env.DATABASE_URL || '');
if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A PostgreSQL DATABASE_URL is required.');
const directory = resolve('.local-backups');
mkdirSync(directory, { recursive: true });
const file = join(directory, `database-before-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`);
const bin = process.env.PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const exe = name => bin ? join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
const env = {
  ...process.env,
  PGHOST: url.hostname, PGPORT: url.port || '5432',
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
  PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGCONNECT_TIMEOUT: '15',
  ...(url.searchParams.has('sslmode') ? { PGSSLMODE: url.searchParams.get('sslmode') } : {}),
  ...(url.searchParams.has('channel_binding') ? { PGCHANNELBINDING: url.searchParams.get('channel_binding') } : {}),
};
try {
  execFileSync(exe('pg_dump'), ['--format=custom', '--no-owner', '--no-privileges', '--file', file], { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  execFileSync(exe('pg_restore'), ['--list', file], { stdio: 'ignore', windowsHide: true });
  if (statSync(file).size < 1000) throw new Error('Backup too small');
  console.log(`Verified database backup: ${file}`);
} catch {
  console.error('Database backup failed. Recovery must not continue without a verified backup.');
  process.exitCode = 1;
}
