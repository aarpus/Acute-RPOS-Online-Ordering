// Uses a temporary account in the configured local database and removes it.
import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';

const varsFile = existsSync('.dev.vars.development') ? '.dev.vars.development' : '.dev.vars';
const config = { ...process.env, ...(existsSync(varsFile) ? parseEnv(readFileSync(varsFile, 'utf8')) : {}) };
const clean = value => String(value ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: clean(config.DATABASE_URL) }) });
const base = 'http://localhost:5173';
const email = `team-qa-${randomUUID()}@example.test`;
let createdId;
const childEmail = `team-child-${randomUUID()}@example.test`;
let childId;
async function call(path, init = {}) {
  const response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); }
  catch { throw new Error(`${path}: HTTP ${response.status}: ${text.slice(0, 200)}`); }
  return { response, body };
}
try {
  const admin = await db.admin.findFirstOrThrow({ where: { email: 'admin123@gmail.com', role: 'super_admin' } });
  const encoded = Buffer.from(JSON.stringify({ adminId: admin.id, email: admin.email, storeCode: admin.storeCode, expiresAt: Date.now() + 120000 })).toString('base64url');
  const signature = createHmac('sha256', clean(config.EMAIL_VERIFICATION_SECRET)).update(`admin-session\0${encoded}`).digest('base64url');
  const headers = { cookie: `st_admin_session=${encoded}.${signature}`, origin: base, 'Content-Type': 'application/json' };
  const team = await call('/api/admin/team', { headers });
  assert.equal(team.response.status, 200, JSON.stringify(team.body));
  assert.equal(team.body.canAssignSuperAdmin, true);
  assert.ok(team.body.data.some(member => member.id === admin.id));
  const password = randomUUID();
  const create = await call('/api/admin/team', { method: 'POST', headers, body: JSON.stringify({ email, password, role: 'admin' }) });
  assert.equal(create.response.status, 201, JSON.stringify(create.body));
  createdId = create.body.data.id;
  assert.equal('passwordHash' in create.body.data, false);
  const login = await call('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: base }, body: JSON.stringify({ email, password }) });
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  const memberHeaders = { cookie: login.response.headers.get('set-cookie').split(';')[0] };
  assert.equal((await call('/api/admin/session', { headers: memberHeaders })).response.status, 200);
  const regularList = await call('/api/admin/team', { headers: memberHeaders });
  assert.equal(regularList.response.status, 200);
  assert.equal(regularList.body.canAssignSuperAdmin, false);
  assert.ok(regularList.body.data.every(member => member.role === 'admin'));
  assert.ok(!regularList.body.data.some(member => member.id === admin.id));
  const createHeaders = { ...memberHeaders, origin: base, 'Content-Type': 'application/json' };
  const escalation = await call('/api/admin/team', { method: 'POST', headers: createHeaders, body: JSON.stringify({ email: childEmail, password, role: 'super_admin' }) });
  assert.equal(escalation.response.status, 403);
  const child = await call('/api/admin/team', { method: 'POST', headers: createHeaders, body: JSON.stringify({ email: childEmail, password }) });
  assert.equal(child.response.status, 201, JSON.stringify(child.body));
  childId = child.body.data.id;
  assert.equal(child.body.data.role, 'admin');
  const childLogin = await call('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', origin: base }, body: JSON.stringify({ email: childEmail, password }) });
  assert.equal(childLogin.response.status, 200, JSON.stringify(childLogin.body));
  const store = await db.store.findFirstOrThrow({ where: { company_code: clean(config.COMPANY_CODE) || admin.storeCode, OR: [{ is_delete: false }, { is_delete: null }] }, select: { store_code: true } });
  const menu = await call(`/api/admin/menu/create-policy?store_code=${encodeURIComponent(store.store_code)}`, { headers: memberHeaders });
  assert.equal(menu.response.status, 200, JSON.stringify(menu.body));
  const page = await fetch(base + '/admin/team', { signal: AbortSignal.timeout(20000) });
  assert.equal(page.status, 200);
  console.log('Passed live Admin team creation and login, hidden Super Admin accounts, role escalation prevention, sessions, and Team page compilation.');
} finally {
  // Only the randomly named account created by this run is removed.
  if (childId) await db.admin.delete({ where: { id: childId, email: childEmail } });
  if (createdId) await db.admin.delete({ where: { id: createdId, email } });
  await db.$disconnect();
}
