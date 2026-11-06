import assert from 'node:assert/strict';
import { loadMenuModule } from './menu-script-runtime.mjs';
const {isCheckoutPath,checkoutReturnPath,storePath,authPagePath,checkoutSession}=loadMenuModule('lib/checkout-auth.ts');
for(const path of ['/pickup','/checkout','/checkout/payment']) {assert.equal(isCheckoutPath(path),true);assert.equal(checkoutReturnPath(path),path);}
for(const path of [null,'https://evil.example','//evil.example','/admin','/checkout/../admin','/checkout?next=https://evil.example','/\\evil.example']) assert.equal(checkoutReturnPath(path),'/account');
const login=new URL(authPagePath('/login','/pickup','STORE A&B'),'https://example.com');
assert.equal(login.searchParams.get('next'),'/pickup');assert.equal(login.searchParams.get('store_code'),'STORE A&B');
const register=new URL(authPagePath('/register',checkoutReturnPath(login.searchParams.get('next')),'STORE A&B'),'https://example.com');
assert.equal(register.searchParams.get('next'),'/pickup');
assert.equal(new URL(storePath('/checkout/payment','STORE A&B'),'https://example.com').searchParams.get('store_code'),'STORE A&B');
let requested='';
assert.equal(await checkoutSession(async url=>{requested=url;return Response.json({user:null});}),null);
assert.equal(requested,'/api/auth/session');
assert.equal((await checkoutSession(async()=>Response.json({user:{id:'customer-1'}}))).id,'customer-1');
await assert.rejects(checkoutSession(async()=>Response.json({error:'Session service unavailable'},{status:503})),/Session service unavailable/);
await assert.rejects(checkoutSession(async()=>{throw new Error('Network error');}),/Network error/);
console.log('Passed: checkout/login/register return paths, store preservation, redirect allowlist, session checks and service failures.');
