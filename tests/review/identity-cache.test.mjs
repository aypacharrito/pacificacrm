import {registerHooks} from 'node:module';
// Counts Clerk and Stripe calls made by the real access checks.
registerHooks({resolve(specifier,context,next){let source;
 if(specifier==='@clerk/nextjs/server')source=`export async function auth(){return {userId:globalThis.session}}
  export async function currentUser(){globalThis.calls.current++;if(globalThis.failNext){globalThis.failNext=false;throw Error('Clerk down')}return globalThis.users[globalThis.session]}
  export async function clerkClient(){return {users:{getUser:async id=>{globalThis.calls.getUser++;return globalThis.users[id]}}}}`;
 if(specifier==='next/navigation')source=`export function redirect(path){throw Error(path)}`;
 if(specifier.endsWith('/clerk-config'))source=`export function isClerkConfigured(){return true}`;
 if(specifier.endsWith('/platform-feature-store'))source=`export async function getPlatformFeatures(){return {miner:false,industryTools:false}}`;
 if(specifier.endsWith('/stripe'))source=`export function getStripe(){return {customers:{list:async()=>{globalThis.calls.stripe++;return {data:[{id:'c'}]}}},subscriptions:{list:async()=>({data:globalThis.paid?[{status:'active'}]:[]})}}}`;
 return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:next(specifier,context);
}});
const test=(await import('node:test')).default;
const assert=(await import('node:assert/strict')).default;
const {getPacificaAccess}=await import('../../app/lib/clerk-access.ts');
const {clearIdentityCaches,forgetClerkUser}=await import('../../app/lib/identity-cache.ts');

const user=(id,email,meta={})=>({id,firstName:'T',lastName:id,primaryEmailAddress:{emailAddress:email},emailAddresses:[{emailAddress:email}],privateMetadata:meta});
function setup(){
 delete process.env.PACIFICA_IDENTITY_CACHE_MS;
 clearIdentityCaches();
 globalThis.calls={current:0,getUser:0,stripe:0};globalThis.paid=true;globalThis.failNext=false;
 globalThis.users={owner:user('owner','owner@example.test'),agent:user('agent','agent@example.test',{pacificaWorkspaceId:'owner',pacificaRole:'agent'})};
}

test('repeated requests reuse the Clerk user and the subscription check',async()=>{
 setup();globalThis.session='owner';
 for(let i=0;i<10;i++)assert.equal((await getPacificaAccess()).allowed,true);
 assert.deepEqual(globalThis.calls,{current:1,getUser:0,stripe:1});
});

test('team members: their record and the workspace owner record are each fetched once',async()=>{
 setup();globalThis.session='agent';
 await Promise.all(Array.from({length:5},()=>getPacificaAccess()));
 const access=await getPacificaAccess();
 assert.equal(access.allowed,true);assert.equal(access.role,'agent');assert.equal(access.userId,'owner');
 assert.equal(globalThis.calls.current,1);
 assert.equal(globalThis.calls.getUser,1);
});

test('an access change through Pacifica applies on the next request',async()=>{
 setup();globalThis.session='owner';
 globalThis.users.owner=user('owner','owner@example.test',{pacificaAccessPaused:true});
 assert.equal((await getPacificaAccess()).allowed,false);
 globalThis.users.owner=user('owner','owner@example.test');
 assert.equal((await getPacificaAccess()).allowed,false);  // cached
 forgetClerkUser('owner');
 assert.equal((await getPacificaAccess()).allowed,true);
});

test('failures are not cached and a zero TTL turns caching off',async()=>{
 setup();globalThis.session='owner';globalThis.failNext=true;
 assert.equal((await getPacificaAccess()).role,'signed-out');  // Clerk failure fails closed
 assert.equal((await getPacificaAccess()).allowed,true);
 assert.equal(globalThis.calls.current,2);
 setup();process.env.PACIFICA_IDENTITY_CACHE_MS='0';globalThis.session='owner';
 await getPacificaAccess();await getPacificaAccess();
 assert.equal(globalThis.calls.current,2);
 delete process.env.PACIFICA_IDENTITY_CACHE_MS;
});

test('an unpaid answer is re-checked after the short TTL, not kept for minutes',async()=>{
 setup();process.env.PACIFICA_IDENTITY_CACHE_MS='20';globalThis.session='owner';globalThis.paid=false;
 assert.equal((await getPacificaAccess()).allowed,false);
 globalThis.paid=true;await new Promise(r=>setTimeout(r,40));
 assert.equal((await getPacificaAccess()).allowed,true);
 delete process.env.PACIFICA_IDENTITY_CACHE_MS;
});
