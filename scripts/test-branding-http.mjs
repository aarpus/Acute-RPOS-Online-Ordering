import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID, pbkdf2Sync, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';

const tag = randomUUID().slice(0, 8), code = `HTTP_BRAND_${tag}`;
const password = 'Branding-qa-password-2026';
const email = `${tag}@branding.example`;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
let token = '';
const salt = randomBytes(16);
let server;
let previewLog = '';
const base = 'http://localhost:3107';
const mode = `brandingqa-${tag}`;
const varsPath = `.dev.vars.${mode}`;
try {
  const store = await db.store.create({ data: { store_code: code, storename: 'Branding QA', company_code: code, created_by: 0 } });
  await db.admin.create({ data: { storeCode: code, email, passwordHash: `pbkdf2$100000$${salt.toString('hex')}$${pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex')}` } });
  writeFileSync(varsPath, Object.entries({ DATABASE_URL: process.env.DATABASE_URL, EMAIL_VERIFICATION_SECRET: randomUUID(), ADMIN_USER_ID: '0', SMTP_USER: 'unused', SMTP_PASSWORD: 'unused' }).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'), { flag: 'wx' });
  async function startPreview() {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', '3107', '--mode', mode, '--force'], {
    env: { ...process.env, VINEXT_NO_DEV_LOCK: '1', RAYON_NUM_THREADS: '2', TOKIO_WORKER_THREADS: '2', ADMIN_USER_ID: '0', COMPANY_CODE: code }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  let startup = '';
  server.stdout.on('data', data => { startup += data; previewLog += data; });
  server.stderr.on('data', data => { startup += data; previewLog += data; });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`Preview exited: ${startup.slice(-3000)}`);
    try { const response = await fetch(`${base}/api/hello`); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.equal(ready, true, startup.slice(-3000));
  console.log('Worker preview started.');
  }
  await startPreview();
  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200, await login.clone().text());
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { cookie, 'Content-Type': 'application/json', origin: base };
  const generated = await fetch(`${base}/api/admin/stores/${store.storeid}/pos-credential`, { method: 'POST', headers });
  assert.equal(generated.status, 200, await generated.clone().text());
  token = (await generated.json()).data.token; assert.ok(token.startsWith('pos_'));
  const metadata = await (await fetch(`${base}/api/admin/stores/${store.storeid}/pos-credential`, { headers })).json(); assert.equal('token' in metadata.data, false);
  const brand = { logoUrl: '/images/logo.png', logoWidth: 144, primaryColor: '#7A0E0E', headerColor: '#FFFFFF', footerColor: '#7A0E0E', footerTextColor: '#FEDCBA', accentColor: '#D0021B' };
  const hero = { imageUrl: '/images/hero.jpg', heading: 'Persisted QA Banner', eyebrow: 'FRESH FOOD', subtitle: 'Saved in PostgreSQL', textColor: '#FFFFFF', alignment: 'left', overlayOpacity: 40 };
  const save = await fetch(`${base}/api/admin/branding/workspace?store_code=${code}`, { method: 'PUT', headers, body: JSON.stringify({ section: 'Branding', branding: brand, hero, heroId: null }) });
  assert.equal(save.status, 200, await save.clone().text());
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const upload = await fetch(`${base}/api/admin/branding/upload?store_code=${code}`, { method: 'POST', headers: { cookie, 'Content-Type': 'image/png' }, body: png });
  assert.equal(upload.status, 201, await upload.clone().text());
  const imageUrl = (await upload.json()).data.url;
  const image = await fetch(base + imageUrl); assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped;
  await startPreview();
  const afterRestart = await fetch(base + imageUrl);
  assert.equal(afterRestart.status, 200, 'Local uploads survive a Worker restart');
  assert.deepEqual(Buffer.from(await afterRestart.arrayBuffer()), png);

  const unrelatedCategory = await db.websiteCategory.create({ data: { storeCode: code, categoryName: 'Existing Admin Category', externalCategoryId: 'admin-existing', displayOrder: 9 } });
  const pos = await fetch(`${base}/api/pos/stores/${code}/categories/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ store_code: code, request_id: 'HTTP-CAT', categories: [{ external_category_id: 'biryani', category_name: 'Biryani', image_url: 'https://example.com/biryani.jpg', display_order: 1, is_visible: true }] }) });
  assert.equal(pos.status, 200, await pos.clone().text());
  const posHero = await fetch(`${base}/api/pos/stores/${code}/hero-banner/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: 'HTTP-HERO', banner: { external_banner_id: 'HTTP-BANNER', image_url: 'https://example.com/banner.jpg', heading: 'Persisted QA Banner' } }) });
  assert.equal(posHero.status, 200, await posHero.clone().text());
  const heroBefore = await db.heroBanner.findFirst({ where: { storeCode: code, externalBannerId: 'HTTP-BANNER' } });
  const categoryBefore = await db.websiteCategory.findFirst({ where: { storeCode: code, externalCategoryId: 'biryani' } });
  const posHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const heroEdit = await fetch(`${base}/api/pos/stores/${code}/hero-banner/sync`, { method: 'POST', headers: posHeaders, body: JSON.stringify({ request_id: 'HTTP-HERO-EDIT', banner: { external_banner_id: 'HTTP-BANNER', image_url: `${base}/images/hero.jpg`, heading: 'Updated QA Banner' } }) });
  assert.equal(heroEdit.status, 200, await heroEdit.clone().text());
  assert.equal(heroEdit.headers.get('X-POS-Replayed'), 'false');
  assert.equal(heroEdit.headers.get('X-POS-Request-Id'), 'HTTP-HERO-EDIT');
  assert.equal((await db.heroBanner.findFirst({ where: { storeCode: code, externalBannerId: 'HTTP-BANNER' } })).imageUrl, `${base}/images/hero.jpg`);
  const heroCounts = await heroEdit.json(); assert.equal(heroCounts.inserted_count, 0); assert.equal(heroCounts.updated_count, 1);
  assert.equal((await db.heroBanner.findFirst({ where: { storeCode: code, status: 1 } })).id, heroBefore.id);
  const categoryEdit = await fetch(`${base}/api/pos/stores/${code}/categories/sync`, { method: 'POST', headers: posHeaders, body: JSON.stringify({ request_id: 'HTTP-CAT-EDIT', categories: [{ external_category_id: 'biryani', category_name: 'Biryani', image_url: '/images/biryani.jpg', description: 'Updated via POS', display_order: 2, is_visible: true }] }) });
  assert.equal(categoryEdit.status, 200, await categoryEdit.clone().text());
  const categoryCounts = await categoryEdit.json(); assert.equal(categoryCounts.inserted_count, 0); assert.equal(categoryCounts.updated_count, 1); assert.equal(categoryCounts.deactivated_count, 0);
  assert.equal((await db.websiteCategory.findUnique({ where: { id: unrelatedCategory.id } })).status, 1, 'Partial sync preserves omitted categories');
  assert.equal((await db.websiteCategory.findFirst({ where: { storeCode: code, status: 1, externalCategoryId: 'biryani' } })).id, categoryBefore.id);
  const deactivate = await fetch(`${base}/api/admin/categories/${categoryBefore.id}?store_code=${code}`, { method: 'DELETE', headers });
  assert.equal(deactivate.status, 200);
  const inactiveEdit = await fetch(`${base}/api/pos/stores/${code}/categories/sync`, { method: 'POST', headers: posHeaders, body: JSON.stringify({ request_id: 'HTTP-INACTIVE-EDIT', categories: [{ external_category_id: 'biryani', category_name: 'Biryani Updated', is_visible: true }] }) });
  assert.equal(inactiveEdit.status, 200);
  assert.equal((await db.websiteCategory.findUnique({ where: { id: categoryBefore.id } })).status, 0, 'Admin deactivation survives subsequent POS updates');
  const replay = await fetch(`${base}/api/pos/stores/${code}/hero-banner/sync`, { method: 'POST', headers: posHeaders, body: JSON.stringify({ request_id: 'HTTP-HERO-EDIT', banner: { external_banner_id: 'HTTP-BANNER', image_url: `${base}/images/hero.jpg`, heading: 'Updated QA Banner' } }) });
  assert.equal(replay.status, 200); assert.equal(replay.headers.get('X-POS-Replayed'), 'true');
  assert.deepEqual(await replay.json(), heroCounts);
  console.log(JSON.stringify({ heroUpdate: { inserted_count: heroCounts.inserted_count, updated_count: heroCounts.updated_count }, categoryUpdate: { inserted_count: categoryCounts.inserted_count, updated_count: categoryCounts.updated_count }, replayHeader: replay.headers.get('X-POS-Replayed') }));
  const publicResponse = await fetch(`${base}/api/home`, { headers: { 'x-store-code': code } });
  const home = await publicResponse.json(); assert.equal(home.store.code, code); assert.equal(home.store.logoWidth, 144); assert.equal(home.branding.footerTextColor, '#FEDCBA'); assert.equal(home.hero.title, 'Updated QA Banner'); assert.equal(home.categories.some(c => c.id === unrelatedCategory.id), true); assert.equal(home.categories.some(c => c.id === categoryBefore.id), false);
  assert.equal((await fetch(`${base}/api/home`, { headers: { 'x-store-code': 'UNTRUSTED' } })).status, 503);
  const defaultHome = await (await fetch(`${base}/api/home`)).json();
  assert.ok(defaultHome.stores.some(store => store.code === code));
  for (const path of ['/', '/admin/branding', '/admin/stores', '/login']) assert.equal((await fetch(base + path)).status, 200);
  console.log('Passed HTTP integration: actual admin login/session, coordinated save, local R2 upload/retrieval/restart persistence, POS authentication/sync, database-backed store selection/isolation and page responses.');
  if (process.argv.includes('--browser')) {
    console.log(`Browser QA ready at ${base}. Temporary admin: ${email} / ${password}`);
    console.log('Press Enter to stop and clean up the fixtures (automatic cleanup after 3 minutes).');
    process.stdin.resume();
    await new Promise(resolve => { const timeout = setTimeout(resolve, 180000); process.stdin.once('data', () => { clearTimeout(timeout); resolve(); }); });
    process.stdin.pause();
  }
} catch (error) {
  const diagnostics = previewLog.split('\n').filter(line => /memory allocation|panicked|fatal|thread.*failed/i.test(line)).slice(-10).join('\n');
  if (diagnostics) console.error(diagnostics);
  throw error;
} finally {
  if (server && server.exitCode === null && server.signalCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited; }
  for (const model of ['posApiCredential', 'posSyncLog', 'websiteCategory', 'heroBanner', 'websiteBranding', 'admin']) await db[model].deleteMany({ where: { storeCode: code } });
  await db.store.deleteMany({ where: { store_code: code } });
  await db.$disconnect();
  if (existsSync(varsPath)) unlinkSync(varsPath);
}
