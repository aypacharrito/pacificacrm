import test from 'node:test';
import assert from 'node:assert/strict';
import {GET as list,POST as create} from '../../app/api/integrations/jarvis/quote-requests/route.ts';
import {acceptQuoteSubmission} from '../../app/lib/opportunities.ts';
import {GET as one,POST as record} from '../../app/api/integrations/jarvis/quote-requests/[id]/route.ts';
import {PUT as save} from '../../app/api/crm/workspace/route.ts';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
import {workspaceKey} from '../../app/lib/workspace-storage.ts';

const TOKEN='jarvis-test-token-'.repeat(3);
const store=new Map();
const details={name:'Maria Lopez',phone:'8185550123',email:'',product:'Auto',address:'1 Test St',city:'Van Nuys',state:'CA',zip:'91406',
  dateOfBirth:'1990-06-15',renewalDate:'',vin:'1HGCM82633A004352',currentCarrier:'',contactPermission:true};
const submission=(id,submittedAt,status='pending')=>({id,linkId:'link-'+id,leadId:null,source:'Website',submittedAt,status,details,consentText:'ok'});
const req=(body,{token=TOKEN,url='https://example.test/api',method}={})=>new Request(url,{method:method||(body===undefined?'GET':'POST'),
  headers:{'Content-Type':'application/json',...(token===null?{}:{Authorization:`Bearer ${token}`})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const params=id=>({params:Promise.resolve({id})});
const workspace=(id='a')=>JSON.parse(store.get(workspaceKey(id)));

function setup(){
  store.clear();
  process.env.JARVIS_INTEGRATION_TOKEN=TOKEN;process.env.JARVIS_WORKSPACE_ID='a';
  process.env.KV_REST_API_URL='https://kv.example.test';process.env.KV_REST_API_TOKEN='test-only';
  globalThis.jarvisTestAccess={allowed:true,userId:'a',email:'owner@example.test',role:'owner'};
  store.set(workspaceKey('a'),JSON.stringify({leads:[],callLogs:[],profile:{...defaultWorkspaceProfile,businessName:'Test Agency'},
    quoteIntake:{links:[],submissions:[submission('req-older1','2026-11-01T10:00:00.000Z'),submission('req-newer1','2026-11-02T10:00:00.000Z'),
      submission('req-done01','2026-10-01T10:00:00.000Z','accepted')]}}));
  store.set(workspaceKey('b'),JSON.stringify({leads:[],callLogs:[],profile:defaultWorkspaceProfile,
    quoteIntake:{links:[],submissions:[submission('req-other1','2026-11-03T10:00:00.000Z')]}}));
  globalThis.fetch=async(url,init)=>{assert.equal(url,'https://kv.example.test');const c=JSON.parse(init.body);
    if(c[0]==='GET')return Response.json({result:store.get(c[1])??null});
    if(c[0]==='EVAL'){const key=c[3],before=c[4],after=c[5];if(store.get(key)===before||!store.has(key)&&c[6]==='create'){store.set(key,after);return Response.json({result:1})}return Response.json({result:0})}
    throw Error('Unexpected storage command '+c[0]);};
}

test('fails closed without configuration, with a wrong token, or with the token in the URL',async()=>{
  setup();
  delete process.env.JARVIS_INTEGRATION_TOKEN;assert.equal((await list(req())).status,503);
  process.env.JARVIS_INTEGRATION_TOKEN='too-short';assert.equal((await list(req())).status,503);
  process.env.JARVIS_INTEGRATION_TOKEN=TOKEN;
  assert.equal((await list(req(undefined,{token:'wrong'}))).status,401);
  assert.equal((await list(req(undefined,{token:null,url:`https://example.test/api?key=${TOKEN}`}))).status,401);
  assert.equal((await record(req({status:'failed',notes:'x'},{token:'wrong'}),params('req-older1'))).status,401);
  assert.equal(workspace().quoteIntake.submissions[0].jarvis,undefined);
});

test('lists only pending requests that still need a quote, newest first, from the bound workspace',async()=>{
  setup();
  const data=await (await list(req())).json();
  assert.deepEqual(data.requests.map(r=>r.id),['req-newer1','req-older1']);
  assert.equal(data.requests[0].details.vin,'1HGCM82633A004352');
  const all=await (await list(req(undefined,{url:'https://example.test/api?filter=all'}))).json();
  assert.equal(all.requests.length,3);
  assert.ok(!JSON.stringify(all).includes('req-other1'));  // workspace b is never visible
  assert.equal((await list(req(undefined,{url:'https://example.test/api?filter=everything'}))).status,400);
});

test('records a quote; it survives a stale CRM autosave; the request stays pending for the owner',async()=>{
  setup();
  const stale=workspace();
  const response=await record(req({status:'quoted',carrier:'Mercury',premium:'$1,284.50',termMonths:6,quoteNumber:'MQ-77812',notes:'Full coverage'}),params('req-older1'));
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.request.jarvis.premium,1284.5);
  assert.equal(body.request.needsQuote,false);
  assert.equal(body.request.status,'pending');  // Jarvis cannot accept or dismiss
  const remaining=await (await list(req())).json();
  assert.deepEqual(remaining.requests.map(r=>r.id),['req-newer1']);
  assert.equal((await save(new Request('https://example.test/api',{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...stale,quoteIntake:{links:[],submissions:[]}})}))).status,200);
  const kept=workspace().quoteIntake.submissions.find(s=>s.id==='req-older1');
  assert.equal(kept.jarvis.carrier,'Mercury');
  assert.equal(kept.jarvisHistory.length,1);
  const single=await (await one(req(),params('req-older1'))).json();
  assert.equal(single.request.jarvis.quoteNumber,'MQ-77812');
});

test('needs-info results keep the request in the queue and list what is missing',async()=>{
  setup();
  await record(req({status:'needs_info',missing:['Driver license number','Vehicle garaging address']}),params('req-newer1'));
  const data=await (await list(req())).json();
  const item=data.requests.find(r=>r.id==='req-newer1');
  assert.equal(item.needsQuote,true);
  assert.deepEqual(item.jarvis.missing,['Driver license number','Vehicle garaging address']);
});

test('validation and not-found errors change nothing',async()=>{
  setup();
  const before=store.get(workspaceKey('a'));
  for(const [body,status] of [[{status:'quoted',carrier:'Mercury'},400],[{status:'accepted'},400],[{status:'needs_info'},400],
    [{status:'quoted',carrier:'Mercury',premium:-5},400],[{status:'quoted',carrier:'Mercury',premium:100,termMonths:99},400]]){
    assert.equal((await record(req(body),params('req-older1'))).status,status,JSON.stringify(body));
  }
  assert.equal((await record(req({status:'failed',notes:'x'}),params('req-other1'))).status,404);
  assert.equal((await record(req({status:'failed',notes:'x'}),params('../../etc'))).status,404);
  assert.equal((await one(req(),params('nope-nope'))).status,404);
  const huge=new Request('https://example.test/api',{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`},body:'{"notes":"'+'x'.repeat(9000)+'"}'});
  assert.equal((await record(huge,params('req-older1'))).status,413);
  assert.equal(store.get(workspaceKey('a')),before);
});

const RID='5b0f8a52-3c1e-4d2a-9f6b-1a2b3c4d5e6f';
const draft=(extra={})=>({customerName:'Ana Ruiz',product:'Auto',coverage:'full coverage auto',phone:'(818) 555-1234',email:'Ana@Example.test',
  source:'doxa',requestId:RID,...extra});

test('creates a pending, agent-entered request that the owner still reviews',async()=>{
  setup();
  const stale=workspace();
  const response=await create(req(draft()));
  assert.equal(response.status,201);
  const body=await response.json();
  assert.equal(body.created,true);
  assert.equal(body.request.id,RID);
  assert.equal(body.request.status,'pending');
  assert.equal(body.request.source,'Doxa');
  assert.equal(body.request.needsQuote,true);
  assert.equal(body.request.requestNotes,'full coverage auto');
  assert.deepEqual({name:body.request.details.name,phone:body.request.details.phone,email:body.request.details.email,product:body.request.details.product},
    {name:'Ana Ruiz',phone:'8185551234',email:'ana@example.test',product:'Auto'});
  const saved=workspace().quoteIntake.submissions.find(s=>s.id===RID);
  assert.equal(saved.details.contactPermission,false);  // no customer consent is claimed
  assert.match(saved.consentText,/Not submitted by the customer/);
  assert.equal(workspace().leads.length,0);  // never writes leads
  // A stale CRM autosave cannot erase it, and it shows up in Jarvis's own queue.
  assert.equal((await save(new Request('https://example.test/api',{method:'PUT',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({...stale,quoteIntake:{links:[],submissions:[]}})}))).status,200);
  const queue=await (await list(req())).json();
  assert.equal(queue.requests[0].id,RID);
});

test('a resend with the same requestId does not create a duplicate',async()=>{
  setup();
  assert.equal((await create(req(draft()))).status,201);
  const again=await create(req(draft({coverage:'changed'})));
  assert.equal(again.status,200);
  const body=await again.json();
  assert.equal(body.created,false);
  assert.equal(body.request.requestNotes,'full coverage auto');
  assert.equal(workspace().quoteIntake.submissions.filter(s=>s.id===RID).length,1);
  // An id that belongs to a customer-submitted request cannot be reused or overwritten.
  const taken='0a0a0a0a-0000-4000-8000-000000000000';
  const ws=workspace();ws.quoteIntake.submissions.push(submission(taken,'2026-11-02T11:00:00.000Z'));store.set(workspaceKey('a'),JSON.stringify(ws));
  assert.equal((await create(req(draft({requestId:taken})))).status,409);
});

test('create fails closed and validates every field',async()=>{
  setup();
  const before=store.get(workspaceKey('a'));
  assert.equal((await create(req(draft(),{token:'wrong'}))).status,401);
  assert.equal((await create(req(draft(),{token:null,url:`https://example.test/api?key=${TOKEN}`}))).status,401);
  delete process.env.JARVIS_WORKSPACE_ID;assert.equal((await create(req(draft()))).status,503);process.env.JARVIS_WORKSPACE_ID='a';
  for(const extra of [{customerName:''},{customerName:'x'},{customerName:'<script>'},{product:'Boat'},{phone:'555-1234'},
    {email:'nope'},{requestId:'not-a-uuid'},{requestId:undefined}]){
    assert.equal((await create(req(draft(extra)))).status,400,JSON.stringify(extra));
  }
  assert.equal((await create(req([draft()]))).status,400);
  const bad=new Request('https://example.test/api',{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`},body:'{nope'});
  assert.equal((await create(bad)).status,400);
  const huge=new Request('https://example.test/api',{method:'POST',headers:{Authorization:`Bearer ${TOKEN}`},body:JSON.stringify(draft({coverage:'x'.repeat(9000)}))});
  assert.equal((await create(huge)).status,413);
  assert.equal(store.get(workspaceKey('a')),before);
  // Only the bound workspace is written.
  assert.equal((await create(req(draft()))).status,201);
  assert.ok(!JSON.stringify(workspace('b')).includes(RID));
});

test('daily create limit',async()=>{
  setup();
  const ws=workspace();
  const now=Date.now();
  for(let i=0;i<50;i++)ws.quoteIntake.submissions.push({...submission(`doxa-old-${i}`,new Date(now-i*60000).toISOString()),linkId:'doxa',source:'Doxa'});
  store.set(workspaceKey('a'),JSON.stringify(ws));
  assert.equal((await create(req(draft()))).status,429);
});

test('accepting an agent-entered request without phone or email creates a new lead, not a match on blanks',async()=>{
  setup();
  await create(req(draft({phone:'',email:''})));
  const saved=workspace().quoteIntake.submissions.find(s=>s.id===RID);
  const noPhone={id:7,name:'Someone Else',phone:'',email:''};
  const result=acceptQuoteSubmission([noPhone],saved,new Date('2026-11-03T12:00:00Z'));
  assert.equal(result.leads.length,2);
  const lead=result.leads.find(l=>l.id===result.leadId);
  assert.equal(lead.name,'Ana Ruiz');
  assert.equal(lead.smsConsent,false);
  assert.equal(lead.emailConsent,false);
  assert.equal(lead.extraFields['Requested coverage'],'full coverage auto');
});
