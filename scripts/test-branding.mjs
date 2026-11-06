import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';

// Exercise the actual server modules against PostgreSQL; only the Worker binding
// is supplied here because Node cannot import cloudflare:workers.
const require = createRequire(import.meta.url);
const tag = randomUUID().slice(0, 8);
const codeA = `TEST_BRAND_A_${tag}`, codeB = `TEST_BRAND_B_${tag}`;
let secretA = randomUUID();
const secretB = randomUUID();
const env = { ...process.env, COMPANY_CODE: `TEST_${tag}`, EMAIL_VERIFICATION_SECRET: randomUUID() };
const objects = new Map();
env.BRANDING_IMAGES = { async put(key, bytes, options) { objects.set(key, { body: bytes, httpMetadata: options.httpMetadata }); }, async get(key) { return objects.get(key) || null; } };
const cache = new Map();
function load(path) {
  const file = resolve(path);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  let source = stripTypeScriptTypes(readFileSync(file, 'utf8'), { mode: 'transform' });
  const names = [...source.matchAll(/export (?:async )?(?:function|class|const|let) (\w+)/g)].map(match => match[1]);
  source = source.replace(/^import \{(.*?)\} from ['"](.*?)['"];$/gm, (_, names, name) => `const {${names.replace(/ as /g, ': ')}} = require('${name}');`)
    .replace(/^export \{(.*?)\} from ['"](.*?)['"];$/gm, (_, names, name) => `Object.assign(exports, require('${name}'));`)
    .replace(/^export /gm, '');
  source += `\nObject.assign(exports, {${names.join(',')}});`;
  const localRequire = name => name === 'cloudflare:workers' ? { env } : name.startsWith('.') ? load(resolve(dirname(file), `${name}.ts`)) : require(name);
  new Function('require', 'module', 'exports', source)(localRequire, module, module.exports);
  return module.exports;
}
const { createPrismaClient } = load('lib/prisma.ts');
const db = createPrismaClient();
const { brandingAdmin } = load('lib/branding-admin.ts');
const { syncPos: handlePosSync } = load('lib/branding-pos.ts');
const syncPos = (request, type, storeCode = decodeURIComponent(new URL(request.url).pathname.split('/')[4])) => handlePosSync(request, type, storeCode);
const { hashPosToken, managePosCredential } = load('lib/pos-credentials.ts');
const { getStorefront } = load('lib/storefront.ts');
const { hashPassword, verifyPassword } = load('lib/password.ts');
const { createAdminSessionCookie, readAdminSession } = load('lib/admin-auth.ts');
const { POST: upload } = load('app/api/admin/branding/upload/route.ts');
const { GET: media } = load('app/api/media/[...key]/route.ts');
const validation = load('lib/branding-validation.ts');
let cookie = '';
const jsonRequest = (body, method = 'PUT', code = codeA, authCookie = cookie) => new Request(`https://test.example/api/admin/branding?store_code=${code}`, { method, headers: { cookie: authCookie, origin: 'https://test.example', 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body) });
const posRequest = (body, token = secretA) => new Request(`https://test.example/api/pos/stores/${encodeURIComponent(body.store_code)}/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const banner = { image_url: 'https://example.com/banner.jpg', heading: 'New banner', text_color: '#FFFFFF', alignment: 'left', overlay_opacity: 40 };
const category = (name, order = 0) => ({ external_category_id: name.toLowerCase(), category_name: name, image_url: 'https://example.com/category.jpg', display_order: order, is_visible: true });
let checks = 0;
function check(actual, expected, message) { assert.equal(actual, expected, message); checks++; }
try {
  await db.store.createMany({ data: [codeA, codeB].map(store_code => ({ store_code, storename: store_code, company_code: env.COMPANY_CODE, created_by: 0 })) });
  await db.posApiCredential.createMany({ data: [{ storeCode: codeA, tokenHash: hashPosToken(secretA) }, { storeCode: codeB, tokenHash: hashPosToken(secretB) }] });
  const passwordHash = await hashPassword('Branding-test-password');
  const admin = await db.admin.create({ data: { storeCode: codeA, email: `${tag}@test.example`, passwordHash } });
  const session = createAdminSessionCookie(admin, env.EMAIL_VERIFICATION_SECRET);
  cookie = `${session.name}=${session.value}`;
  const storeA = await db.store.findFirst({ where: { store_code: codeA } });
  const credentialRequest = (method = 'GET', authCookie = cookie) => new Request('https://test.example/api/admin/stores/credential', { method, headers: { cookie: authCookie, origin: 'https://test.example' } });
  check((await managePosCredential(credentialRequest('GET', ''), String(storeA.storeid))).status, 401);
  const metadata = await (await managePosCredential(credentialRequest(), String(storeA.storeid))).json();
  check(metadata.data.configured, true);
  check('token' in metadata.data, false); check('tokenHash' in metadata.data, false);
  const oldSecretA = secretA;
  const rotation = await managePosCredential(credentialRequest('POST'), String(storeA.storeid)); check(rotation.status, 200);
  secretA = (await rotation.json()).data.token;
  check((await db.posApiCredential.findUnique({ where: { storeCode: codeA } })).tokenHash, hashPosToken(secretA));
  check((await syncPos(posRequest({ store_code: codeA, request_id: 'old-token', banner }, oldSecretA), 'HERO_BANNER')).status, 401);
  check((await syncPos(posRequest({ request_id: 'path-mismatch', store_code: codeB, banner }), 'HERO_BANNER', codeA)).status, 403);
  check(await verifyPassword('Branding-test-password', passwordHash), true, 'Existing password verification');
  check(readAdminSession(new Request('https://test.example', { headers: { cookie } }), env.EMAIL_VERIFICATION_SECRET).adminId, admin.id);
  check(readAdminSession(new Request('https://test.example', { headers: { cookie: cookie + 'bad' } }), env.EMAIL_VERIFICATION_SECRET), null);
  check((await brandingAdmin(jsonRequest({}, 'GET', codeA, ''), 'branding')).status, 401);
  const brand = { logoUrl: '/images/logo.png', logoWidth: 144, navAlignment: 'center', primaryColor: '#123456', headerColor: '#FFFFFF', footerColor: '#654321', footerTextColor: '#FEDCBA', accentColor: '#AABBCC' };
  const hero = { imageUrl: banner.image_url, heading: 'Admin hero', textColor: '#FFFFFF' };
  check((await brandingAdmin(jsonRequest({ section: 'Branding', branding: brand, hero }), 'workspace')).status, 200);
  let state = await db.heroBanner.findFirst({ where: { storeCode: codeA, status: 1 } });
  const originalHero = state.id;
  check((await brandingAdmin(jsonRequest({ section: 'Branding', branding: { ...brand, primaryColor: '#999999' }, heroId: randomUUID(), hero }), 'workspace')).status, 409);
  check((await db.websiteBranding.findUnique({ where: { storeCode: codeA } })).primaryColor, '#123456', 'Coordinated writes rollback');
  check((await brandingAdmin(jsonRequest({ ...hero, heading: 'Edited' }), 'hero', originalHero)).status, 200);
  check((await db.heroBanner.findFirst({ where: { storeCode: codeA, status: 1 } })).id, originalHero, 'Ordinary edit retains ID');
  check((await brandingAdmin(jsonRequest(hero, 'POST'), 'hero')).status, 201);
  check((await db.heroBanner.findUnique({ where: { id: originalHero } })).status, 0, 'Replacement preserves history');
  const denied = await db.store.create({ data: { store_code: `DENIED_${tag}`, storename: 'Other company', company_code: 'OTHER', created_by: 0 } });
  try { check((await brandingAdmin(jsonRequest(brand, 'PUT', denied.store_code), 'branding')).status, 403); }
  finally { check((await managePosCredential(credentialRequest('POST'), String(denied.storeid))).status, 404); await db.store.delete({ where: { storeid: denied.storeid } }); }
  const makeCategory = (name, order) => ({ categoryName: name, displayOrder: order, imageUrl: '/images/category-0.jpg', isVisible: true });
  check((await brandingAdmin(jsonRequest(makeCategory('A', 2), 'POST'), 'categories')).status, 201);
  check((await brandingAdmin(jsonRequest(makeCategory('B', 1), 'POST'), 'categories')).status, 201);
  let cats = await db.websiteCategory.findMany({ where: { storeCode: codeA, status: 1 } });
  check(cats.length, 2);
  check((await brandingAdmin(jsonRequest(makeCategory('Edited category', 3)), 'categories', cats[0].id)).status, 200);
  check((await brandingAdmin(jsonRequest({}, 'DELETE', codeB), 'categories', cats[0].id)).status, 409, 'Category ID cannot cross store boundary');
  check((await brandingAdmin(jsonRequest({}, 'DELETE'), 'categories', cats[0].id)).status, 200);
  check(await db.websiteCategory.count({ where: { storeCode: codeA, status: 1 } }), 1, 'Deleting one category leaves others active');
  const sync = (id, extra = {}) => ({ store_code: codeA, request_id: id, banner, ...extra });
  check((await syncPos(posRequest(sync('auth'), 'invalid'), 'HERO_BANNER')).status, 401);
  check((await syncPos(posRequest(sync('store', { store_code: codeB })), 'HERO_BANNER')).status, 403);
  check((await syncPos(posRequest(sync('array', { banner: [banner] })), 'HERO_BANNER')).status, 400);
  check((await syncPos(posRequest(sync('array2', { banners: [banner] })), 'HERO_BANNER')).status, 400);
  const responses = await Promise.all(Array.from({ length: 5 }, () => syncPos(posRequest(sync('same-id')), 'HERO_BANNER')));
  for (const response of responses) check(response.status, 200);
  check(await db.posSyncLog.count({ where: { storeCode: codeA, syncType: 'HERO_BANNER', requestId: 'same-id' } }), 1, 'Idempotent concurrent request');
  check(await db.heroBanner.count({ where: { storeCode: codeA, source: 'POS' } }), 1);
  const concurrent = await Promise.all(['one', 'two', 'three'].map(id => syncPos(posRequest(sync(id)), 'HERO_BANNER')));
  for (const response of concurrent) check(response.status, 200);
  check(await db.heroBanner.count({ where: { storeCode: codeA, status: 1 } }), 1, 'Single active hero under concurrency');
  const catBody = { store_code: codeA, request_id: 'cats', categories: [category('Pizza', 2), { ...category('Burger', 1), is_visible: false }] };
  check((await syncPos(posRequest(catBody), 'CATEGORY')).status, 200);
  check((await syncPos(posRequest(catBody), 'CATEGORY')).status, 200);
  check(await db.websiteCategory.count({ where: { storeCode: codeA, status: 1 } }), 3);
  check((await syncPos(posRequest({ ...catBody, request_id: 'empty', categories: [] }), 'CATEGORY')).status, 400);
  check((await syncPos(posRequest({ ...catBody, request_id: 'bad', categories: [category('Good'), { category_name: '' }] }), 'CATEGORY')).status, 400);
  check(await db.websiteCategory.count({ where: { storeCode: codeA, status: 1 } }), 3, 'Invalid batch leaves current categories intact');
  const oldIds = (await db.websiteCategory.findMany({ where: { storeCode: codeA, status: 1 } })).map(c => c.id).sort();
  // Inject a failure after deactivation using PostgreSQL constraints, proving rollback.
  await assert.rejects(db.$transaction(async tx => {
    await tx.websiteCategory.updateMany({ where: { storeCode: codeA, status: 1 }, data: { status: 0 } });
    await tx.websiteCategory.create({ data: { storeCode: codeA, categoryName: 'Invalid', status: 9 } });
  })); checks++;
  assert.deepEqual((await db.websiteCategory.findMany({ where: { storeCode: codeA, status: 1 } })).map(c => c.id).sort(), oldIds); checks++;
  const storefront = await getStorefront(new Request('https://test.example', { headers: { 'x-store-code': codeA } }));
  check(storefront.store.code, codeA, 'Public selection is validated against the database');
  const otherStorefront = await getStorefront(new Request('https://test.example', { headers: { 'x-store-code': codeB } }));
  check(otherStorefront.store.code, codeB);
  check(otherStorefront.branding, null, 'Store B does not receive store A branding');
  await assert.rejects(getStorefront(new Request('https://test.example', { headers: { 'x-store-code': 'UNKNOWN_STORE' } })), /unavailable/); checks++;
  check(storefront.branding.primaryColor, '#123456');
  check(storefront.branding.footerTextColor, '#FEDCBA', 'Footer text color persists and reaches the public website');
  check((await brandingAdmin(jsonRequest({ ...brand, footerTextColor: 'invalid' }), 'branding')).status, 400);
  check((await db.websiteBranding.findUnique({ where: { storeCode: codeA } })).footerTextColor, '#FEDCBA', 'Invalid footer color leaves saved values intact');
  check(storefront.categories.length, 2, 'Existing visible categories remain alongside new POS categories');
  check(storefront.categories.some(c => c.name === 'Pizza'), true);
  check(storefront.categories.some(c => c.name === 'Burger'), false, 'Invisible category filtered');
  check(storefront.store.logo, '/images/logo.png');
  check(storefront.store.logoWidth, 144, 'Saved logo width reaches header/footer data');
  check(storefront.branding.navAlignment, 'center', 'Saved navbar position reaches the public header');
  for (const navAlignment of ['left', 'right', 'center']) {
    check((await brandingAdmin(jsonRequest({ ...brand, navAlignment }), 'branding')).status, 200);
    check((await getStorefront(new Request('https://test.example', { headers: { 'x-store-code': codeA } }))).branding.navAlignment, navAlignment);
  }
  for (const navAlignment of ['', 'top', 'CENTER', null, 1]) {
    check((await brandingAdmin(jsonRequest({ ...brand, navAlignment }), 'branding')).status, 400);
  }
  for (const logoWidth of [0, 23, 401, 56.5, '144']) { check((await brandingAdmin(jsonRequest({ ...brand, logoWidth }), 'branding')).status, 400); }
  check((await db.websiteBranding.findUnique({ where: { storeCode: codeA } })).logoWidth, 144, 'Invalid logo widths preserve saved data');
  check(await db.heroBanner.count({ where: { storeCode: codeB } }), 0, 'Store B is unchanged');
  const uploadRequest = (bytes, mime = 'image/png') => new Request(`https://test.example/api/admin/branding/upload?store_code=${codeA}`, { method: 'POST', headers: { cookie, 'Content-Type': mime }, body: bytes });
  check((await upload(uploadRequest(new Uint8Array([1, 2, 3])))).status, 400);
  check((await upload(uploadRequest(new Uint8Array(2 * 1024 * 1024 + 1)))).status, 413);
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'));
  const uploaded = await upload(uploadRequest(png)); check(uploaded.status, 201);
  const url = (await uploaded.json()).data.url;
  check(validation.imageUrl(url), url);
  check((await media(new Request('https://test.example'), { params: Promise.resolve({ key: url.split('/').slice(3) }) })).status, 200);
  check((await brandingAdmin(jsonRequest({ ...brand, logoUrl: url }), 'branding')).status, 200);
  check((await getStorefront(new Request('https://test.example', { headers: { 'x-store-code': codeA } }))).store.logo, url, 'Persisted uploaded logo reaches storefront');
  for (const url of ['blob:temp', 'data:image/png;base64,AA', 'javascript:alert(1)', 'file:///C:/image.jpg', 'not a URL', '//example.com/image.jpg']) { assert.throws(() => validation.imageUrl(url)); checks++; }
  for (const url of ['http://example.com/a.jpg', 'http://localhost:5173/images/hero.jpg', 'http://192.168.1.10:8080/banner.jpg', 'https://127.0.0.1/a.jpg', 'https://localhost/a.jpg', 'https://[::1]/a.jpg', '/uploads/banner.jpg']) { check(validation.imageUrl(url), url); }
  check(validation.heroInput({ image_url: 'http://localhost:5173/images/hero.jpg' }, true).imageUrl, 'http://localhost:5173/images/hero.jpg');
  check(validation.categoryInput({ category_name: 'Local category', image_url: '/images/category-0.jpg' }, true).imageUrl, '/images/category-0.jpg');
  env.BRANDING_IMAGES = undefined;
  check((await upload(uploadRequest(png))).status, 503, 'R2 configuration error reported');
  check((await brandingAdmin(jsonRequest(brand), 'branding')).status, 200, 'Color-only save works without R2');
  const legacy = { ...brand }; delete legacy.footerTextColor; delete legacy.logoWidth; delete legacy.navAlignment;
  check((await brandingAdmin(jsonRequest(legacy), 'branding')).status, 200);
  check((await db.websiteBranding.findUnique({ where: { storeCode: codeA } })).footerTextColor, '#FEDCBA', 'Older clients preserve saved footer text color');
  check((await db.websiteBranding.findUnique({ where: { storeCode: codeA } })).logoWidth, 144, 'Older clients preserve saved logo width');
  check((await db.websiteBranding.findUnique({ where: { storeCode: codeA } })).navAlignment, 'center', 'Older clients preserve saved navbar position');
  // Category upserts preserve omitted records; hero replacements remain exclusive.
  const heroUpsert = (requestId, externalId, heading) => posRequest({ store_code: codeA, request_id: requestId, banner: { ...banner, external_banner_id: externalId, heading } });
  const insertedHeroResponse = await (await syncPos(heroUpsert('hero-upsert-new', 'UPSERT-BANNER', 'Initial'), 'HERO_BANNER')).json();
  check(insertedHeroResponse.inserted_count, 1); check(insertedHeroResponse.updated_count, 0);
  const heroRow = await db.heroBanner.findFirst({ where: { storeCode: codeA, externalBannerId: 'UPSERT-BANNER' } });
  check((await brandingAdmin(jsonRequest({ ...hero, heading: 'Admin edit retains POS identity' }), 'hero', heroRow.id)).status, 200);
  check((await db.heroBanner.findUnique({ where: { id: heroRow.id } })).externalBannerId, 'UPSERT-BANNER', 'Admin edits preserve POS banner identity');
  const heroTotal = await db.heroBanner.count({ where: { storeCode: codeA } });
  const heroUpdateBody = await (await syncPos(heroUpsert('hero-upsert-edit', 'UPSERT-BANNER', 'Updated'), 'HERO_BANNER')).json();
  check(heroUpdateBody.inserted_count, 0); check(heroUpdateBody.updated_count, 1);
  check((await db.heroBanner.findUnique({ where: { id: heroRow.id } })).heading, 'Updated');
  check(await db.heroBanner.count({ where: { storeCode: codeA } }), heroTotal, 'Hero update does not insert a duplicate');
  await syncPos(heroUpsert('hero-upsert-replace', 'OTHER-BANNER', 'Replacement'), 'HERO_BANNER');
  check((await db.heroBanner.findUnique({ where: { id: heroRow.id } })).status, 0, 'Replaced hero remains as inactive history');
  await syncPos(heroUpsert('hero-upsert-reactivate', 'UPSERT-BANNER', 'Reactivated'), 'HERO_BANNER');
  check((await db.heroBanner.findUnique({ where: { id: heroRow.id } })).status, 1, 'Inactive hero reactivated in place');
  check(await db.heroBanner.count({ where: { storeCode: codeA, status: 1 } }), 1);
  const heroReplay = await (await syncPos(heroUpsert('hero-upsert-edit', 'UPSERT-BANNER', 'Ignored replay'), 'HERO_BANNER')).json();
  assert.deepEqual(heroReplay, heroUpdateBody); checks++;
  check((await db.heroBanner.findUnique({ where: { id: heroRow.id } })).heading, 'Reactivated', 'Old request replay does not overwrite newer data');
  const concurrentEdits = await Promise.all(['edit-a', 'edit-b', 'edit-c'].map(id => syncPos(heroUpsert(id, 'UPSERT-BANNER', id), 'HERO_BANNER')));
  for (const response of concurrentEdits) check(response.status, 200);
  check(await db.heroBanner.count({ where: { storeCode: codeA, externalBannerId: 'UPSERT-BANNER' } }), 1);
  const originalPizza = await db.websiteCategory.findFirst({ where: { storeCode: codeA, externalCategoryId: 'pizza', status: 1 } });
  const originalBurger = await db.websiteCategory.findFirst({ where: { storeCode: codeA, externalCategoryId: 'burger', status: 1 } });
  check((await brandingAdmin(jsonRequest({ categoryName: 'Admin edited pizza', displayOrder: 2 }), 'categories', originalPizza.id)).status, 200);
  check((await db.websiteCategory.findUnique({ where: { id: originalPizza.id } })).externalCategoryId, 'pizza', 'Admin edits preserve POS category identity');
  const categoryTotal = await db.websiteCategory.count({ where: { storeCode: codeA } });
  await db.websiteCategory.create({ data: { storeCode: codeB, externalCategoryId: 'pizza', categoryName: 'Other store pizza' } });
  const categoryUpsertPayload = { store_code: codeA, request_id: 'cat-upsert', categories: [{ ...category('Pizza', 3), category_name: 'Pizza Updated' }, category('Drinks', 4)] };
  const categoryUpsertResult = await (await syncPos(posRequest(categoryUpsertPayload), 'CATEGORY')).json();
  check(categoryUpsertResult.inserted_count, 1); check(categoryUpsertResult.updated_count, 1); check(categoryUpsertResult.deactivated_count, 0);
  const updatedPizza = await db.websiteCategory.findUnique({ where: { id: originalPizza.id } });
  check(updatedPizza.categoryName, 'Pizza Updated'); check(updatedPizza.displayOrder, 3); check(updatedPizza.status, 1);
  check((await db.websiteCategory.findUnique({ where: { id: originalBurger.id } })).status, 1, 'Omitted category remains active');
  check((await db.websiteCategory.findUnique({ where: { id: originalBurger.id } })).updatedAt.getTime(), originalBurger.updatedAt.getTime(), 'Omitted category is not modified');
  check(await db.websiteCategory.count({ where: { storeCode: codeA } }), categoryTotal + 1, 'Only the new category inserts a row');
  check((await db.websiteCategory.findFirst({ where: { storeCode: codeB, externalCategoryId: 'pizza' } })).categoryName, 'Other store pizza');
  const categoryReplay = await (await syncPos(posRequest(categoryUpsertPayload), 'CATEGORY')).json();
  assert.deepEqual(categoryReplay, categoryUpsertResult); checks++;
  check((await brandingAdmin(jsonRequest({}, 'DELETE'), 'categories', originalBurger.id)).status, 200);
  const reactivation = await (await syncPos(posRequest({ store_code: codeA, request_id: 'cat-reactivate', categories: [category('Burger', 1)] }), 'CATEGORY')).json();
  check(reactivation.inserted_count, 0); check(reactivation.updated_count, 1);
  check((await db.websiteCategory.findUnique({ where: { id: originalBurger.id } })).status, 0, 'POS updates preserve admin deactivation');
  check(reactivation.deactivated_count, 0);
  const concurrentCategories = await Promise.all(['cat-a', 'cat-b'].map(request_id => syncPos(posRequest({ store_code: codeA, request_id, categories: [category('Burger', 1)] }), 'CATEGORY')));
  for (const response of concurrentCategories) check(response.status, 200);
  check(await db.websiteCategory.count({ where: { storeCode: codeA, externalCategoryId: 'burger' } }), 1);
  check((await db.websiteCategory.findUnique({ where: { id: originalBurger.id } })).status, 0, 'Concurrent POS edits do not undo admin deactivation');
  check((await db.websiteCategory.findUnique({ where: { id: originalPizza.id } })).status, 1, 'Updating one category leaves another active');
  check((await managePosCredential(credentialRequest('DELETE'), String(storeA.storeid))).status, 200);
  check((await syncPos(posRequest({ store_code: codeA, request_id: 'disabled', banner }), 'HERO_BANNER')).status, 401);
  console.log(`Passed ${checks} branding checks: PostgreSQL persistence, CRUD, history, transaction rollback, concurrent/idempotent POS sync, store isolation, public integration, session/password regression, image validation and R2 binding contract.`);
} finally {
  // Delete only the unique fixtures created by this test run.
  for (const model of ['posApiCredential', 'posSyncLog', 'websiteCategory', 'heroBanner', 'websiteBranding', 'admin']) await db[model].deleteMany({ where: { storeCode: { in: [codeA, codeB] } } });
  await db.store.deleteMany({ where: { store_code: { in: [codeA, codeB] } } });
  await db.$disconnect();
}
