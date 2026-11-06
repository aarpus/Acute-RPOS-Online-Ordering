import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

const source = stripTypeScriptTypes(readFileSync('lib/menu-public.ts', 'utf8'), { mode: 'transform' }).replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const { publicMenu } = vm.runInNewContext(`${source}\n;({publicMenu});`, { MenuError: Error });
const at = new Date('2026-11-02T20:00:00Z'); // Monday, noon in Los Angeles.
const base = { id:'one', offerName:'Lunch offer', offerType:'percentage', discountValue:15, offerCode:'LUNCH15', minimumOrder:20, applicableCategories:['burgers'], applicableChannels:['website'], configuration:{ website:true, days:['Mon'], startTime:'11:00', endTime:'14:00' } };
let rows = [base];
let query;
const db = {
  menuOffer: { async findMany(input) { query = input; return rows; } },
  menuCategory: { async findMany() { return [{id:'burgers', categoryName:'Burgers', imageUrl:''}]; } },
  menuItem: { async findMany() { return []; } },
};
const read = () => publicMenu(db, 'STORE-A', 'USD', 'Delivery', at);
let catalog = await read();
assert.equal(catalog.offers.length, 1);
assert.equal(catalog.offers[0].scope, 'Burgers');
assert.equal(catalog.offers[0].categoryId, 'burgers');
assert.equal(catalog.offers[0].value, 15);
assert.equal(catalog.offers[0].code, 'LUNCH15');
assert.equal(query.where.storeCode, 'STORE-A');
assert.equal(query.where.isActive, true);
assert.equal(query.where.archivedAt, null);
assert.equal(query.where.AND[0].OR[1].startAt.lte, at);
assert.equal(query.where.AND[1].OR[1].endAt.gt, at);
assert.equal(query.orderBy[0].priority, 'desc');
for (const configuration of [{website:false}, {days:['Tue']}, {days:[2]}, {startTime:'14:00',endTime:'16:00'}, {startTime:'22:00',endTime:'02:00'}]) {
  rows = [{...base, configuration}];
  assert.equal((await read()).offers.length, 0);
}
rows = [{...base, applicableChannels:['app']}];
assert.equal((await read()).offers.length, 0);
rows = [{...base, configuration:{days:[1], image:'/offers/lunch.jpg'}}];
assert.equal((await read()).offers[0].image, '/offers/lunch.jpg');
rows = [];
assert.equal((await read()).offers.length, 0);
console.log('Passed: store isolation, active/date query, priority, website/channel visibility, numeric and named weekdays, daily/overnight times, offer details, images, and no-offer fallback data.');
