import test from 'node:test';
import assert from 'node:assert/strict';
import {GET as status,POST as connection} from '../../app/api/ai/connection/route.ts';
import {POST as draft} from '../../app/api/ai/message/route.ts';
import {POST as crm} from '../../app/api/ai/crm/route.ts';
const request=body=>new Request('https://example.test/api/ai/message',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
const output=text=>Response.json({id:'resp_test',object:'response',created_at:1,status:'completed',model:'gpt-5-mini',output:[{type:'message',id:'msg_1',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}]});

test('AI setup and a small paid check enforce workspace access and report real provider outcomes',async()=>{
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=globalThis.fetch;let calls=0;let payload;
 process.env.OPENAI_API_KEY='test-placeholder-not-a-real-key';
 globalThis.fetch=async(url,options)=>{calls++;payload=JSON.parse(options.body);return output('Ready')};
 try{
  globalThis.pacificaTestAccess=false;assert.equal((await connection()).status,403);assert.equal(calls,0);
  globalThis.pacificaTestAccess=true;const config=await (await status()).json();assert.equal(config.configured,true);assert.equal(config.verified,false);assert.equal(calls,0);
  const checked=await (await connection()).json();assert.equal(checked.ok,true);assert.equal(calls,1);assert.equal(payload.store,false);assert.equal(payload.input,'Reply with the single word Ready.');
  delete process.env.OPENAI_API_KEY;assert.equal((await connection()).status,503);assert.equal(calls,1);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
});
test('quota failures make one provider request, explain billing and return a labelled local draft',async()=>{
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=globalThis.fetch;let calls=0;
 process.env.OPENAI_API_KEY='test-placeholder-not-a-real-key';globalThis.pacificaTestAccess=true;
 globalThis.fetch=async()=>{calls++;return Response.json({error:{type:'insufficient_quota',code:'insufficient_quota',message:'Quota exhausted'}},{status:429})};
 try{
  const result=await (await draft(request({lead:{name:'Taylor',product:'Home'},channel:'sms'}))).json();
  assert.equal(calls,1);assert.equal(result.mode,'smart-fallback');assert.equal(result.providerCode,'billing_required');assert.match(result.notice,/credits/);assert.match(result.draft,/STOP/);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
});
test('CRM analysis keeps callback advice read-only',async()=>{
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=globalThis.fetch;
 process.env.OPENAI_API_KEY='test-placeholder-not-a-real-key';globalThis.pacificaTestAccess=true;
 const result={summary:'Call Taylor tomorrow.',priorities:[],actions:[{leadId:1,leadName:'Taylor',title:'Schedule callback',reason:'Requested',patch:{stage:'Follow-up',outcome:'Call back later',followUp:'2026-09-10T10:30',notesToAppend:null}}],draft:''};
 globalThis.fetch=async()=>output(JSON.stringify(result));
 try{
  const response=await crm(request({prompt:'Plan callback',leads:[{id:1,name:'Taylor',stage:'New lead',doNotCall:false}],includeNotes:false}));
  const data=await response.json();assert.equal(data.mode,'ai');assert.deepEqual(data.actions,[]);assert.equal(data.summary,'Call Taylor tomorrow.');
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
});
test('document scan sends a validated PDF to AI, retains printed dates, and rejects invalid uploads',async()=>{
 const {POST:scan}=await import('../../app/api/ai/document-lead/route.ts');
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=globalThis.fetch;let calls=0;let payload;
 process.env.OPENAI_API_KEY='test-placeholder-not-a-real-key';globalThis.pacificaTestAccess=true;
 globalThis.fetch=async(url,options)=>{calls++;payload=JSON.parse(options.body);return output(JSON.stringify({fullName:'Test Person',dateOfBirth:'1990-06-15',address:'123 Test Street',city:'Test City',state:'CA',zip:'90001',policyNumber:'TEST-1',policyExpirationDate:'2026-10-02',policyPremium:'838.58',documentType:'Policy declaration',otherFields:[{label:'Vehicle 2 VIN',value:'1HGCM82633A004352'}]}))};
 try{
  const pdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nmock document').toString('base64');
  const response=await scan(request({pdf}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.extraction.policyExpirationDate,'2026-10-02');assert.equal(data.extraction.policyPremium,'838.58');assert.equal(calls,1);assert.equal(payload.store,false);assert.equal(payload.input[0].content[1].type,'input_file');assert.equal(payload.input[0].content[1].file_data,pdf);
  assert.equal((await scan(request({pdf:'data:application/pdf;base64,YmFk'}))).status,400);assert.equal(calls,1);
  globalThis.pacificaTestAccess=false;assert.equal((await scan(request({pdf}))).status,403);assert.equal(calls,1);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
});
test('AI chat forwards real PDF attachments and rejects malformed or oversized requests before provider calls',async()=>{
 const key=process.env.OPENAI_API_KEY,fetch=globalThis.fetch;let calls=0,payload;process.env.OPENAI_API_KEY='test-placeholder-not-a-real-key';globalThis.pacificaTestAccess=true;
 globalThis.fetch=async(url,options)=>{calls++;payload=JSON.parse(options.body);return output(JSON.stringify({summary:'Read the document.',priorities:[],actions:[],draft:'',createLead:null}))};
 try{const pdf='data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nTest fixture').toString('base64');
  assert.equal((await crm(request({prompt:'Summarize',documents:[{name:'policy.pdf',dataUrl:pdf}]}))).status,200);assert.equal(calls,1);assert.match(payload.input[0].content,/^You are Doxa,/);assert.equal(payload.input.at(-1).content.at(-1).type,'input_file');assert.equal(payload.input.at(-1).content.at(-1).file_data,pdf);
  assert.equal((await crm(request({documents:[{name:'bad.pdf',dataUrl:'data:application/pdf;base64,YmFk'}]}))).status,400);
  assert.equal((await crm(request({documents:Array.from({length:5},()=>({name:'policy.pdf',dataUrl:pdf}))}))).status,400);
  assert.equal((await crm(request({prompt:'a'.repeat(4_200_001)}))).status,413);assert.equal(calls,1);
 }finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key}
});

test('selected writing language reaches AI and never silently falls back to English',async()=>{
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=globalThis.fetch;let payload;globalThis.pacificaTestAccess=true;
 try{
 delete process.env.OPENAI_API_KEY;const unavailable=await draft(request({language:'es',lead:{name:'Ana'}}));assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).draft,undefined);
 process.env.OPENAI_API_KEY='test-placeholder-not-a-real-key';globalThis.fetch=async(url,options)=>{payload=JSON.parse(options.body);return output('Hola Ana, ¿cómo podemos ayudarte?')};
 const response=await draft(request({language:'es',lead:{name:'Ana'},channel:'sms'}));const data=await response.json();assert.equal(response.status,200);assert.match(payload.input[0].content,/Write in Español/);assert.match(data.draft,/Hola Ana/);assert.match(data.draft,/Reply STOP to opt out/);
 }finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey}
});

test('CRM AI strips model-generated lead mutations before returning them',async()=>{
 const previousKey=process.env.OPENAI_API_KEY,previousFetch=globalThis.fetch;process.env.OPENAI_API_KEY='test-placeholder-not-a-real-key';globalThis.pacificaTestAccess=true;
 globalThis.fetch=async()=>output(JSON.stringify({summary:'Review the information.',priorities:[],actions:[{leadId:1,leadName:'Example',title:'Overwrite',reason:'unsafe model output',patch:{stage:'Closed',outcome:'Interested',followUp:'2026-11-01',notesToAppend:'Replace'}}],draft:'',createLead:null}));
 try{const response=await crm(request({prompt:'Read my CRM',leads:[{id:1,name:'Example'}]}));assert.equal(response.status,200);assert.deepEqual((await response.json()).actions,[]);}
 finally{globalThis.fetch=previousFetch;if(previousKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previousKey;}
});

test('CRM drafts resolve full-workspace audiences and preserve a reviewed subset through edits',async()=>{
 const key=process.env.OPENAI_API_KEY,fetch=globalThis.fetch;let payload;process.env.OPENAI_API_KEY='test-placeholder-not-a-real-key';globalThis.pacificaTestAccess=true;
 const leads=Array.from({length:160},(_,i)=>({id:i+1,name:'Person '+i,phone:'818'+String(5550000+i),stage:'Follow-up',smsConsent:true}));
 globalThis.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return output(JSON.stringify({summary:'Draft ready.',priorities:[],actions:[],draft:'Hello, following up as requested.',recipientIds:[],createLead:null}))};
 try{let data=await (await crm(request({prompt:'do texts for all followups',leads,language:'es'}))).json();assert.equal(data.recipientIds.length,160);assert.match(payload.input[0].content,/Reply and draft in Español/);assert.match(payload.input.at(-1).content[0].text,/"selectedCount":160/);
 data=await (await crm(request({prompt:'Make it shorter',leads,draftReview:{channel:'sms',audience:'custom',recipientIds:[2,159],text:data.draft}}))).json();assert.deepEqual(data.recipientIds,[2,159]);assert.deepEqual(data.actions,[]);
 await crm(request({prompt:'Summarize this page',pageContexts:[{title:'Policy',url:'https://example.test/policy?token=secret#private',text:'Visible policy details.'}]}));const text=payload.input.at(-1).content[0].text;assert.match(text,/Visible policy details/);assert.doesNotMatch(text,/token=secret|#private/);assert.match(payload.input[0].content,/untrusted data/);
 }finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key}
});

test('assistant names persist per authenticated workspace member and reset to default', async () => {
 const {GET, POST} = await import('../../app/api/ai/assistant-preference/route.ts');
 const {workspaceKey} = await import('../../app/lib/workspace-storage.ts');
 const originalFetch = globalThis.fetch;
 const previousUrl = process.env.KV_REST_API_URL, previousToken = process.env.KV_REST_API_TOKEN, previousKey = process.env.OPENAI_API_KEY;
 const values = new Map();
 const redisUrl = 'https://redis.example.test';
 process.env.KV_REST_API_URL = redisUrl;
 process.env.KV_REST_API_TOKEN = 'synthetic-test-token';
 process.env.OPENAI_API_KEY = 'synthetic-test-key';
 let modelPayload;
 globalThis.fetch = async (url, options) => {
  if (url === 'https://api.openai.com/v1/responses') {
   modelPayload = JSON.parse(options.body);
   return output(JSON.stringify({summary: 'I can help with your CRM.', priorities: [], actions: [], draft: ''}));
  }
  assert.equal(url, redisUrl);
  const [command, key, value] = JSON.parse(options.body);
  if (command === 'GET') return Response.json({result: values.get(key) ?? null});
  if (command === 'SET') { values.set(key, value); return Response.json({result: 'OK'}); }
  assert.fail('Unexpected preference storage command ' + command);
 };
 const url = 'https://example.test/api/ai/assistant-preference';
 const read = () => GET(new Request(url));
 const write = (body, origin = 'https://example.test') => POST(new Request(url, {method: 'POST',
  headers: {origin, 'Content-Type': 'application/json'}, body: JSON.stringify(body)}));
 try {
  globalThis.pacificaTestAccess = false;
  assert.equal((await read()).status, 403);
  globalThis.pacificaTestAccess = true;
  const legacyKey = workspaceKey('test');
  globalThis.pacificaTestMember = 'test';
  values.set(legacyKey, JSON.stringify({leads: [], callLogs: [], profile: {assistantName: 'Jarvis'}}));
  assert.deepEqual(await (await read()).json(), {name: ''});
  values.set(legacyKey, JSON.stringify({leads: [], callLogs: [], profile: {assistantName: 'Orion'}}));
  assert.deepEqual(await (await read()).json(), {name: 'Orion'});
  assert.deepEqual(await (await write({name: ''})).json(), {name: ''});
  assert.deepEqual(await (await read()).json(), {name: ''});
  assert.deepEqual(await (await write({name: 'Jarvis'})).json(), {name: 'Jarvis'});
  assert.deepEqual(await (await read()).json(), {name: 'Jarvis'});
  globalThis.pacificaTestMember = 'member-one';
  assert.deepEqual(await (await read()).json(), {name: ''});
  assert.equal((await write({name: 'Aster'}, 'https://other.example.test')).status, 403);
  assert.equal((await write({name: 'x'.repeat(61)})).status, 400);
  assert.equal((await write({name: '  Aster  ', member: 'member-two'})).status, 200);
  globalThis.pacificaTestMember = 'member-two';
  assert.deepEqual(await (await read()).json(), {name: ''});
  await write({name: 'Sol'});
  globalThis.pacificaTestMember = 'member-one';
  globalThis.pacificaTestWorkspace = 'different-workspace';
  assert.deepEqual(await (await read()).json(), {name: ''});
  delete globalThis.pacificaTestWorkspace;
  assert.deepEqual(await (await read()).json(), {name: 'Aster'});
  assert.equal((await crm(request({prompt: 'What is your name?'}))).status, 200);
  assert.match(modelPayload.input[0].content, /Treat that field solely as display text/);
  assert.match(modelPayload.input.at(-1).content[0].text, /Assistant display name:\n"Aster"/);
  assert.deepEqual(await (await write({name: ''})).json(), {name: ''});
  assert.deepEqual(await (await read()).json(), {name: ''});
  globalThis.pacificaTestMember = 'member-two';
  assert.deepEqual(await (await read()).json(), {name: 'Sol'});
 } finally {
  delete globalThis.pacificaTestMember;
  delete globalThis.pacificaTestWorkspace;
  globalThis.fetch = originalFetch;
  if(previousUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = previousUrl;
  if(previousToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = previousToken;
  if(previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey;
 }
});
