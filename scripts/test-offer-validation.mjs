import assert from 'node:assert/strict';
import { loadMenuModule } from './menu-script-runtime.mjs';

const { validateOfferForm } = loadMenuModule('lib/offer-form-validation.ts');
const base = { id:1, name:'Lunch offer', type:'Percentage Discount', value:10, minimum:0, maxDiscount:0, usage:0, perCustomer:0, minItems:1, buyQty:1, getQty:1, priority:0, start:'2026-11-02', end:'2026-12-02', days:['Mon'], startTime:'00:00', endTime:'23:59', scope:'All Items', items:[], categories:[], code:'', externalId:'' };
assert.equal(validateOfferForm(base, []).length,0,'Default zero priority must save');
assert.equal(validateOfferForm({...base,startTime:'22:00',endTime:'02:00'}, []).length,0,'Overnight offers are supported by the server');
const invalid = validateOfferForm({...base,name:'',value:101,start:'',end:'',priority:-1,days:[],perCustomer:-1,scope:'Selected Items'},[]);
for (const field of ['Offer Name','Discount Value (%)','Start Date','End Date','Priority','Available Days','Usage Limit per Customer','Apply Offer To']) assert.ok(invalid.some(issue=>issue.field===field),field);
assert.equal(invalid.find(issue=>issue.field==='Priority').tab,'Advanced');
assert.equal(invalid.find(issue=>issue.field==='Usage Limit per Customer').tab,'Conditions');
assert.ok(validateOfferForm({...base,end:'2026-10-01'},[]).some(issue=>issue.field==='End Date'));
assert.ok(validateOfferForm({...base,start:'2026-02-30'},[]).some(issue=>issue.field==='Start Date'));
assert.ok(validateOfferForm({...base,value:1.001},[]).some(issue=>issue.field==='Discount Value (%)'));
for (const field of ['name','code','externalId']) {
  const form = {...base,[field]:'DUPLICATE'};
  assert.ok(validateOfferForm(form,[{...base,id:2,[field]:'duplicate'}]).some(issue=>/already/.test(issue.message)));
}
assert.equal(validateOfferForm({...base,type:'Free Delivery',value:999},[]).length,0);
const { menuFailure } = loadMenuModule('lib/menu-db.ts');
for (const [target, field] of [['offer_code','Promo code'],['external_offer_id','External offer ID']]) {
  const response = menuFailure({code:'P2002',meta:{target:['store_code',target]}});
  assert.equal(response.status,409);
  assert.match((await response.json()).error,new RegExp(`${field} is already used`));
}
console.log('Passed: zero priority, multiple field errors, tab routing, dates, amounts, duplicate identifiers, and overnight schedule.');
