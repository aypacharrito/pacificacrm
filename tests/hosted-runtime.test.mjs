import test from 'node:test';
import assert from 'node:assert/strict';
import {isHostedRuntime,deployInfo} from '../app/lib/hosted-runtime.ts';

const NAMES=['VERCEL','PACIFICA_HOSTING','ONYX_ENV','PACIFICA_LOCAL_DEV','VERCEL_GIT_COMMIT_SHA','ONYX_COMMIT_SHA','ONYX_BRANCH','ONYX_URL','VERCEL_ENV','VERCEL_URL','VERCEL_PROJECT_PRODUCTION_URL','VERCEL_GIT_COMMIT_REF'];
function clean(t,agent){
 const saved=Object.fromEntries(NAMES.map(name=>[name,process.env[name]]));for(const name of NAMES)delete process.env[name];
 const nav=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 if(agent!==undefined)Object.defineProperty(globalThis,'navigator',{value:{userAgent:agent},configurable:true});
 t.after(()=>{for(const [name,value] of Object.entries(saved))if(value===undefined)delete process.env[name];else process.env[name]=value;
  if(nav)Object.defineProperty(globalThis,'navigator',nav);else delete globalThis.navigator;});
}

test('a developer machine is not hosted, so the local owner fallback still works in tests and next dev',t=>{
 clean(t);assert.equal(isHostedRuntime(),false);
});
test('Vercel, Onyx and any declared host are hosted',t=>{
 for(const name of ['VERCEL','PACIFICA_HOSTING','ONYX_ENV']){clean(t);process.env[name]='1';assert.equal(isHostedRuntime(),true,name);delete process.env[name];}
});
test('a Cloudflare Worker is hosted even when nobody set a host variable (fail-closed)',t=>{
 clean(t,'Cloudflare-Workers');assert.equal(isHostedRuntime(),true);
 process.env.PACIFICA_LOCAL_DEV='1';assert.equal(isHostedRuntime(),false); // explicit local Worker preview only
 process.env.ONYX_ENV='preview';assert.equal(isHostedRuntime(),true);      // a real deploy wins over the local flag
});
test('deploy facts come from Vercel first, then Onyx',t=>{
 clean(t);assert.deepEqual(deployInfo(),{release:'local',branch:'local',environment:'local',url:'local'});
 Object.assign(process.env,{ONYX_COMMIT_SHA:'abc1234def',ONYX_BRANCH:'main',ONYX_ENV:'preview',ONYX_URL:'https://onyx-pacificacrm.example.workers.dev'});
 assert.deepEqual(deployInfo(),{release:'abc1234d',branch:'main',environment:'preview',url:'https://onyx-pacificacrm.example.workers.dev'});
 process.env.VERCEL_ENV='production';assert.equal(deployInfo().environment,'production');
});
