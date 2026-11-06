import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

function load(file,dependencies,names){
 const source=stripTypeScriptTypes(readFileSync(file,'utf8'),{mode:'transform'}).replace(/^import .*;$/gm,'').replace(/^export /gm,'');
 return vm.runInNewContext(`${source}\n;({${names.join(',')}});`,{...dependencies,URL,URLSearchParams,Response,console,Set});
}
const service=load('lib/admin-customers.ts',{},['CustomerListError','customerListFilters','listRegisteredCustomers']);
const stores=[{storeid:1,company_code:'A',store_code:'A1',storename:'Store A1',is_delete:false},{storeid:2,company_code:'A',store_code:'A2',storename:'Store A2',is_delete:null},{storeid:3,company_code:'B',store_code:'B1',storename:'Store B1',is_delete:false},{storeid:4,company_code:'A',store_code:'DUP',storename:'Duplicate A',is_delete:false},{storeid:5,company_code:'B',store_code:'DUP',storename:'Duplicate B',is_delete:false},{storeid:6,company_code:'A',store_code:'DELETED',storename:'Deleted',is_delete:true}];
const user=(id,storeCode,firstName,lastName='Customer')=>({id,storeCode,firstName,lastName,email:`${id}@example.com`,phoneNumber:'1234567890',createdAt:new Date('2026-11-02T10:00:00Z'),updatedAt:new Date('2026-11-02T10:00:00Z'),passwordHash:'MUST_NEVER_BE_RETURNED'});
const users=[...Array.from({length:35},(_,index)=>user(`alice-${index}`,'A1','Alice',`Customer ${index}`)),user('bob','A2','Bob'),user('foreign','B1','Private'),user('duplicate','DUP','Private'),user('deleted','DELETED','Private')];
function matches(row,where){
 if(where.AND&&!where.AND.every(clause=>matches(row,clause)))return false;
 if(where.OR&&!where.OR.some(clause=>matches(row,clause)))return false;
 return Object.entries(where).filter(([key])=>!['AND','OR'].includes(key)).every(([key,value])=>value.in?value.in.includes(row[key]):String(row[key]).toLowerCase().includes(value.contains.toLowerCase()));
}
let factoryCalls=0,disconnects=0,admin={id:'admin-a',storeCode:'A'};
const db={
 store:{async findMany({where,select}){assert.equal(where.company_code,'A');assert.deepEqual(Object.keys(select).sort(),['store_code','storename']);return stores.filter(row=>row.company_code==='A'&&row.is_delete!==true);},async groupBy({where}){return where.store_code.in.map(code=>({store_code:code,_count:{_all:stores.filter(row=>row.store_code===code&&row.is_delete!==true).length}}));}},
 user:{async count({where}){return users.filter(row=>matches(row,where)).length;},async findMany({where,select,skip,take,orderBy}){
  assert.equal(select.passwordHash,undefined);assert.equal(orderBy[0].createdAt,'desc');
  return users.filter(row=>matches(row,where)).slice(skip,skip+take).map(row=>Object.fromEntries(Object.keys(select).map(key=>[key,row[key]])));
 }},
 async $transaction(action,options){assert.equal(options.isolationLevel,'RepeatableRead');return action(db);},async $disconnect(){disconnects++;}
};
const route=load('app/api/admin/customers/route.ts',{...service,getAuthenticatedAdmin:async()=>admin,getTrustedStoreContext:()=>({companyCode:'A'}),createPrismaClient:()=>{factoryCalls++;return db;}},['GET']);
const request=(query='')=>new Request(`https://example.com/api/admin/customers${query}`);
admin=null;
assert.equal((await route.GET(request())).status,401);assert.equal(factoryCalls,0);
admin={id:'admin-a',storeCode:'A'};
const response=await route.GET(request());
assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
const data=await response.json();
assert.equal(data.total,36);assert.equal(data.customers.length,25);assert.equal(data.totalPages,2);
assert.deepEqual(data.stores.map(row=>row.code),['A1','A2']);
assert.equal(JSON.stringify(data).includes('MUST_NEVER'),false);
assert.equal(JSON.stringify(data).includes('Private'),false);
assert.equal((await (await route.GET(request('?store_code=A2'))).json()).customers[0].firstName,'Bob');
for(const code of ['B1','DUP','DELETED'])assert.equal((await route.GET(request(`?store_code=${code}`))).status,403);
assert.equal((await route.GET(request('?page=0'))).status,400);
assert.equal((await route.GET(request('?page_size=500'))).status,400);
assert.equal((await (await route.GET(request('?q=Alice%20Customer%2034'))).json()).total,1);
assert.equal((await (await route.GET(request('?q=alice-34%40example.com'))).json()).total,1);
assert.equal((await (await route.GET(request('?q=1234567890'))).json()).total,36);
assert.equal(data.customers[0].createdAt,'2026-11-02T10:00:00.000Z');
assert.equal((await (await route.GET(request('?q=BOB'))).json()).total,1);
assert.equal((await (await route.GET(request('?page=2&page_size=10'))).json()).customers.length,10);
assert.equal((await (await route.GET(request('?page=99'))).json()).page,2);
assert.equal((await (await route.GET(request('?q=notfound'))).json()).total,0);
assert.equal((await (await route.GET(request('?company_code=B'))).json()).total,36);
assert.ok(disconnects>0);
console.log('Passed: admin authentication, company/store isolation, ambiguous/deleted store guards, safe customer fields, full-name/email/phone search, pagination, registration dates and no-store responses.');
