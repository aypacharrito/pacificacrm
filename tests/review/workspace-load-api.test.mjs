import test from 'node:test';
import assert from 'node:assert/strict';
import {GET,PUT} from '../../app/api/crm/workspace/route.ts';

function setup(t,values={}){
 const names=['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','VERCEL'];
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 for(const name of names){if(values[name]===undefined)delete process.env[name];else process.env[name]=values[name];}
 globalThis.workspaceAccess={allowed:true,userId:'tenant',email:'owner@example.test',role:'owner'};
 globalThis.workspaceAuthError=false;
 const logs=[];t.mock.method(console,'error',(...values)=>logs.push(values));
 t.after(()=>{for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}delete globalThis.workspaceAccess;delete globalThis.workspaceAuthError;});
 return logs;
}
const request=()=>new Request('https://example.test/api/crm/workspace');
test('missing production storage returns a actionable code and reference, never found:false',async t=>{
 const logs=setup(t,{VERCEL:'1'});const response=await GET(request()),data=await response.json();
 assert.equal(response.status,503);assert.equal(data.code,'STORAGE_NOT_CONFIGURED');assert.equal(data.found,undefined);
 assert.match(data.requestId,/^[a-f0-9-]{36}$/);assert.equal(logs[0][1].requestId,data.requestId);
 assert.equal(response.headers.get('cache-control'),'no-store');
});
test('signed-out and access-paused responses are distinct and cannot read or write storage',async t=>{
 setup(t);t.mock.method(globalThis,'fetch',()=>assert.fail('No storage request allowed'));
 for(const [role,status,code] of [['signed-out',401,'SIGN_IN_REQUIRED'],['access-paused',403,'ACCESS_REQUIRED']]){
  globalThis.workspaceAccess={allowed:false,role};
  const response=await GET(request());assert.equal(response.status,status);assert.equal((await response.json()).code,code);
  assert.equal((await PUT(new Request(request(),{method:'PUT',body:'{}'}))).status,status);
 }
});
test('unexpected identity exceptions are handled without returning or logging private provider text',async t=>{
 const logs=setup(t);globalThis.workspaceAuthError=true;
 const response=await GET(request());assert.equal(response.status,500);
 assert.equal((await response.json()).code,'WORKSPACE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(logs),/Private provider/);
});
test('valid tenant reads keep conditional caching and missing records stay explicitly empty',async t=>{
 setup(t,{KV_REST_API_URL:'https://storage.example.test',KV_REST_API_TOKEN:'test'});
 let raw=JSON.stringify({leads:[{id:1,name:'Keep me'}],callLogs:[],profile:{}});
 t.mock.method(globalThis,'fetch',async(_url,options)=>{assert.deepEqual(JSON.parse(options.body),['GET','pacifica:v2:workspace:tenant']);return Response.json({result:raw})});
 const response=await GET(request()),etag=response.headers.get('etag');assert.ok(etag);
 assert.equal((await response.json()).leads[0].name,'Keep me');
 const unchanged=await GET(new Request(request(),{headers:{'If-None-Match':etag}}));assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
 raw=null;const missing=await GET(request());assert.equal(missing.status,200);assert.equal((await missing.json()).found,false);
 raw='{broken';const invalid=await GET(request());assert.equal(invalid.status,500);assert.equal((await invalid.json()).code,'WORKSPACE_DATA_INVALID');
});
test('reads leave out server-only data, keep phone calendar items, and ignore server-only changes for caching',async t=>{
 setup(t,{KV_REST_API_URL:'https://storage.example.test',KV_REST_API_TOKEN:'test'});
 const base={leads:[{id:1,name:'Keep me'}],callLogs:[],profile:{},officeItems:[{id:'c1',leadId:0,kind:'appointment',title:'Renewal call',dueAt:'2026-11-10T17:00:00.000Z',amount:0,status:'open',reminderAt:'',reminderState:'off'}]};
 let stored={...base,voicePilotHistory:[{id:'v1'}],minerState:{searches:[]},quoteIntake:{links:[],submissions:[]},
  documentInsights:[{id:'d1'}],aiControl:{},conversationCalendar:{},noteReminders:[],smsLedger:{}};
 t.mock.method(globalThis,'fetch',async()=>Response.json({result:JSON.stringify(stored)}));
 const response=await GET(request()),data=await response.json(),etag=response.headers.get('etag');
 assert.equal(data.leads[0].name,'Keep me');
 assert.equal(data.officeItems[0].title,'Renewal call');
 for(const key of ['voicePilotHistory','minerState','quoteIntake','documentInsights','aiControl','conversationCalendar','noteReminders','smsLedger'])
  assert.equal(key in data,false,key);
 // A background job changing server-only data does not force clients to download the workspace again.
 stored={...stored,voicePilotHistory:[{id:'v1'},{id:'v2'}],quoteIntake:{links:[],submissions:[{id:'q1',details:{}}]}};
 const again=await GET(new Request('https://example.test/api/crm/workspace',{headers:{'If-None-Match':etag}}));
 assert.equal(again.status,304);
 stored={...stored,leads:[{id:1,name:'Changed'}]};
 assert.equal((await GET(new Request('https://example.test/api/crm/workspace',{headers:{'If-None-Match':etag}}))).status,200);
});
