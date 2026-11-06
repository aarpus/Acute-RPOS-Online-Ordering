import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHmac, timingSafeEqual } from 'node:crypto';
import vm from 'node:vm';

function load(path, dependencies, names) {
  const source = stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'), { mode: 'transform' })
    .replace(/^import .*;$/gm, '').replace(/^export \{.*;$/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ ...dependencies, Buffer, Request, Response, Headers, URL, console, process: { env: {} } });
  return vm.runInContext(`${source}\n;({ ${names.join(', ')} });`, context);
}

const workerEnv = { DATABASE_URL: 'test', EMAIL_VERIFICATION_SECRET: 'x'.repeat(32) };
const { homeData } = load('../data/home.ts', {}, ['homeData']);
const menu = load('../lib/menu.ts', {}, ['resolveMenuCategory', 'filterMenuProducts']);
let rows = [];
let disconnected = 0;
let failQuery = false;
let brandingRecord = null;
let heroRecord = null;
let categoryRecords = [];
const { getStorefront } = load('../lib/storefront.ts', {
  homeData, workerEnv, ...menu,
  publicMenu: async () => ({ products: homeData.products, categories: [] }),
  Prisma: { sql: (strings) => strings.join('') },
  createPrismaClient: () => ({
    $transaction: async action => action({}),
    menuSeo: { async findMany() { return []; } },
    websiteBranding: { async findUnique() { return brandingRecord; } },
    heroBanner: { async findFirst() { return heroRecord; } },
    websiteCategory: { async findMany() { return categoryRecords.filter(c => c.isVisible).sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id)); } },
    async $queryRaw(query) {
      assert.match(query, /WHERE is_active = true AND COALESCE\(is_delete, false\) = false/);
      assert.match(query, /ORDER BY storeid ASC/);
      assert.equal(query.includes('storeaccountnumber'), false);
      assert.equal(query.includes('storeroutingnumber'), false);
      if (failQuery) throw Error('Database unavailable');
      return rows;
    },
    async $disconnect() { disconnected++; },
  }),
}, ['getStorefront']);
// The server validates each selected code against active database stores.
const request = code => new Request('https://example.com/api/home', { headers: code === undefined ? {} : { 'x-store-code': code } });
const makeStore = (id, code, name) => ({ storeid: BigInt(id), store_code: code, storename: name,
  storeaddress1: `${id} Main Street`, storecity: 'Test City', storephonenumber: `555-000${id}`,
  storetime: id === 1 ? null : 'Mon-Sat: 10 AM to 11 PM / Sunday closed',
  storeaccountnumber: 'PRIVATE', storeroutingnumber: 'PRIVATE' });

await assert.rejects(getStorefront(request()), /unavailable/);
rows = [makeStore(1, 'A', 'Same Name'), makeStore(2, 'B', 'Same Name')];
const first = await getStorefront(request());
assert.equal(first.store.code, 'A');
assert.equal(first.store.hours, '', 'An empty store time must not show demo hours');
const second = await getStorefront(request('B'));
assert.equal(second.store.code, 'B');
assert.equal(second.store.address, '2 Main Street, Test City');
assert.equal(second.store.phone, '555-0002');
assert.equal(second.store.hours, 'Mon-Sat: 10 AM to 11 PM / Sunday closed');
assert.equal(second.stores.length, 2, 'Active database stores are available for selection');
assert.equal(JSON.stringify(second).includes('PRIVATE'), false);
assert.equal(JSON.stringify(second.products), JSON.stringify(homeData.products));
await assert.rejects(getStorefront(request('UNKNOWN')), /unavailable/);
await assert.rejects(getStorefront(request('')), /unavailable/);
rows.push(makeStore(3, 'B', 'Duplicate Code'));
await assert.rejects(getStorefront(request('B')), /unique/);
rows = [makeStore(1, '', 'Missing Code')];
await assert.rejects(getStorefront(request()), /unavailable/);
failQuery = true;
await assert.rejects(getStorefront(request()), /Database unavailable/);
assert.equal(disconnected, 8);
failQuery = false;
rows = [makeStore(1, 'A', 'First Store'), makeStore(2, 'B', 'Second Store')];

const auth = load('../lib/auth.ts', { workerEnv, getStorefront, createHmac, timingSafeEqual },
  ['getAuthConfig', 'getCustomerAuthConfig', 'getSessionCookie', 'serializeSessionCookie', 'jsonWithCookies', 'publicUser', 'sameOrigin']);
assert.equal((await auth.getCustomerAuthConfig(request('B'))).storeCode, 'B');
let userLookups = 0;
const sessionRoute = load('../app/api/auth/session/route.ts', {
  ...auth,
  createPrismaClient: () => ({ user: { async findUnique() {
    userLookups++;
    return { id: 'user-a', email: 'a@example.com', storeCode: 'A', firstName: 'A', lastName: 'User', phoneNumber: '1234567890' };
  } }, async $disconnect() {} }),
}, ['GET']);
const cookie = auth.serializeSessionCookie({ userId: 'user-a', email: 'a@example.com', storeCode: 'A' }, workerEnv.EMAIL_VERIFICATION_SECRET).split(';')[0];
const sessionRequest = code => new Request('https://example.com/api/auth/session', { headers: { cookie, 'x-store-code': code } });
assert.equal((await (await sessionRoute.GET(sessionRequest('B'))).json()).user, null);
assert.equal(userLookups, 0, 'A session must not query account data in store B');
assert.equal((await (await sessionRoute.GET(sessionRequest('A'))).json()).user.id, 'user-a');
assert.equal(userLookups, 1);
assert.match(auth.serializeSessionCookie({userId:'user-a',email:'a@example.com',storeCode:'A'},workerEnv.EMAIL_VERIFICATION_SECRET),/Path=\/;/);
const renewedSession = await sessionRoute.GET(sessionRequest('A'));
const renewedCookies = renewedSession.headers.getSetCookie();
assert.ok(renewedCookies.some(cookie=>/Path=\/;/.test(cookie)),'Session checks upgrade the old auth-only cookie to root scope');
assert.ok(renewedCookies.some(cookie=>/Path=\/api\/auth; Max-Age=0/.test(cookie)),'Expire the legacy cookie to avoid ambiguous sessions');
let customerRecord = { id:'user-b',email:'b@example.com',storeCode:'B',firstName:'B',lastName:'User',phoneNumber:'1234567890' };
const customerSession = load('../lib/customer-session.ts',{
  ...auth,
  createPrismaClient:()=>({user:{async findUnique(){return customerRecord;}},async $disconnect(){}}),
},['authenticatedCustomer']);
// Real order persistence/routes are exercised against PostgreSQL in test-order-flow.mjs.
const orderCookie = auth.serializeSessionCookie({userId:'user-b',email:'b@example.com',storeCode:'B'},workerEnv.EMAIL_VERIFICATION_SECRET).split(';')[0];
const orderRequest = sessionCookie => new Request('https://example.com/api/orders', { headers: { cookie: sessionCookie } });
assert.equal(await customerSession.authenticatedCustomer(orderRequest(''), 'B'), null);
assert.equal(await customerSession.authenticatedCustomer(orderRequest(cookie), 'B'), null);
assert.equal(await customerSession.authenticatedCustomer(orderRequest(orderCookie + 'tampered'), 'B'), null);
const expiredPayload = Buffer.from(JSON.stringify({userId:'user-b',email:'b@example.com',storeCode:'B',expiresAt:Date.now()-1000})).toString('base64url');
const expiredSignature = createHmac('sha256',workerEnv.EMAIL_VERIFICATION_SECRET).update('session\0' + expiredPayload).digest('base64url');
assert.equal(await customerSession.authenticatedCustomer(orderRequest('st_session=' + expiredPayload + '.' + expiredSignature), 'B'), null);
const validCustomer = customerRecord;
customerRecord = null;
assert.equal(await customerSession.authenticatedCustomer(orderRequest(orderCookie), 'B'), null);
customerRecord = {...validCustomer,email:'changed@example.com'};
assert.equal(await customerSession.authenticatedCustomer(orderRequest(orderCookie), 'B'), null);
customerRecord = validCustomer;
assert.equal((await customerSession.authenticatedCustomer(orderRequest(orderCookie), 'B')).id, validCustomer.id);
console.log('Passed: database-backed store selection, public data filtering, root-cookie renewal, legacy-cookie cleanup and expired/tampered/deleted/cross-store customer sessions.');


const biryaniKey = menu.resolveMenuCategory(null, ' BIRYANI ', homeData.categories);
assert.equal(biryaniKey, 'biryani');
const biryaniCategory = { id: 'database-uuid', name: 'Biryani', menuCategoryId: biryaniKey };
assert.equal(menu.filterMenuProducts(homeData.products, biryaniCategory, '').length, 1);
assert.equal(menu.filterMenuProducts(homeData.products, biryaniCategory, '')[0].id, 'chicken-biryani');
assert.equal(menu.filterMenuProducts(homeData.products, biryaniCategory, 'naan').length, 0);
assert.equal(menu.resolveMenuCategory('wraps', 'Renamed Wraps', homeData.categories), 'wraps');
assert.equal(menu.resolveMenuCategory('CAT001', 'Biryani', homeData.categories), 'biryani');
assert.equal(menu.resolveMenuCategory(null, 'Unknown Category', homeData.categories), null);
assert.equal(menu.filterMenuProducts(homeData.products, { id: 'new-category', name: 'Unknown', menuCategoryId: null }, '').length, 0);
assert.equal(menu.filterMenuProducts(homeData.products, null, '').length, homeData.products.length);
assert.equal(menu.filterMenuProducts(homeData.products, { id: 'popular-uuid', name: 'Popular', menuCategoryId: 'popular' }, '').length, homeData.products.filter(p => p.popular).length);
console.log('Passed category-to-menu mapping, category filtering, search, popular, empty category and See All behavior.');

// The embedded preview and saved public storefront must produce the same data.
const { applyWebsitePreview } = load('../lib/website-preview.ts', { homeData, ...menu }, ['applyWebsitePreview']);
const baseline = await getStorefront(request('A'));
const beforePreview = JSON.stringify(baseline);
const settings = {
  logo: '/images/custom-logo.png', logoWidth: 144, navAlignment: 'center', hero: '/images/custom-hero.jpg',
  primaryColor: '#123456', headerColor: '#EEEEEE', footerColor: '#654321', footerTextColor: '#FEDCBA',
  accentColor: '#AABBCC', textColor: '#CCBBAA', eyebrow: 'Fresh every day', subtitle: 'Made for you',
  heading: 'Welcome\nEnjoy your meal', alignment: 'right', overlay: 65,
};
const categories = [
  { id: 'wraps-uuid', name: 'Renamed Wraps', externalCategoryId: 'wraps', image: '/images/wrap.jpg', order: 3, visible: true },
  { id: 'hidden-uuid', name: 'Hidden', image: '', order: 0, visible: false },
  { id: 'biryani-uuid', name: 'Biryani', image: '', order: 1, visible: true },
];
const draft = { type: 'website-preview:update', storeCode: 'A', settings, categories };
const preview = applyWebsitePreview(baseline, draft);
assert.equal(JSON.stringify(baseline), beforePreview, 'Unsaved drafts must not mutate public data');
assert.equal(applyWebsitePreview(baseline, { ...draft, storeCode: 'B' }), baseline, 'Drafts cannot cross store boundaries');
assert.equal(applyWebsitePreview(baseline, null), baseline);
assert.equal(JSON.stringify(preview.categories), JSON.stringify(baseline.categories), 'Branding drafts must not replace menu categories');
brandingRecord = { ...settings, logoUrl: settings.logo };
heroRecord = { imageUrl: settings.hero, heading: settings.heading, eyebrow: settings.eyebrow, subtitle: settings.subtitle,
  textColor: settings.textColor, alignment: settings.alignment, overlayOpacity: settings.overlay };
categoryRecords = categories.map(c => ({ id: c.id, categoryName: c.name, externalCategoryId: c.externalCategoryId,
  imageUrl: c.image, displayOrder: c.order, isVisible: c.visible }));
const saved = await getStorefront(request('A'));
assert.equal(saved.branding.navAlignment, 'center');
for (const field of ['store', 'branding', 'hero', 'categories', 'products', 'footer']) {
  assert.equal(JSON.stringify(preview[field]), JSON.stringify(saved[field]), `${field} must match after saving the preview draft`);
}
console.log('Passed preview/save parity for logo size, all branding colors, hero text/alignment/overlay, independent menu categories, and store isolation.');

const { brandingInput } = load('../lib/branding-validation.ts', {}, ['brandingInput']);
const brandPayload = { ...settings, logoUrl: settings.logo };
for (const navAlignment of ['left', 'center', 'right']) {
  assert.equal(brandingInput({ ...brandPayload, navAlignment }).navAlignment, navAlignment);
  const positioned = applyWebsitePreview(baseline, { ...draft, settings: { ...settings, navAlignment } });
  assert.equal(positioned.branding.navAlignment, navAlignment);
}
for (const navAlignment of ['', 'top', 'CENTER', null, 1, {}]) {
  assert.throws(() => brandingInput({ ...brandPayload, navAlignment }), /Navbar menu position/);
}
const legacyBrand = { ...brandPayload }; delete legacyBrand.navAlignment;
assert.equal(Object.hasOwn(brandingInput(legacyBrand), 'navAlignment'), false, 'Older clients must preserve saved navbar position');
console.log('Passed navbar position validation, all three preview positions, and backwards-compatible updates.');
