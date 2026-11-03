import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {POST as inbound} from '../app/api/twilio/inbound/route.ts';
import {POST as delivery} from '../app/api/twilio/messages/status/route.ts';
process.env.TWILIO_AUTH_TOKEN='test-secret';
process.env.TWILIO_WEBHOOK_BASE_URL='https://pacificacrm.com';

function request(path,fields){
  const url='https://pacificacrm.com'+path;
  const payload=Object.keys(fields).sort().reduce((text,key)=>text+key+fields[key],url);
  return new Request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Twilio-Signature':createHmac('sha1','test-secret').update(payload).digest('base64')},body:new URLSearchParams(fields)});
}

test('a signed STOP closes every duplicate contact and a retry appends nothing',async()=>{
  globalThis.testWorkspace={leads:[1,2].map(id=>({id,phone:'8185550100',stage:'New lead',communications:[]})),callLogs:[],profile:{}};
  const fields={MessageSid:'SM-one',From:'+18185550100',To:'+18185550199',Body:'STOP'};
  assert.equal((await inbound(request('/api/twilio/inbound',fields))).status,200);
  assert.equal((await inbound(request('/api/twilio/inbound',fields))).status,200);
  for(const lead of globalThis.testWorkspace.leads){assert.equal(lead.smsOptOut,true);assert.equal(lead.doNotCall,true);assert.equal(lead.automationEnabled,false);assert.equal(lead.communications.length,1);}
});

test('delivery callbacks preserve delivered status and queue overflow does not opt contacts out',async()=>{
  globalThis.testWorkspace={leads:[{id:1,communications:[{id:'message',providerId:'SM-one',status:'delivered'}]}],callLogs:[],profile:{}};
  const fields={MessageSid:'SM-one',MessageStatus:'queued'};
  assert.equal((await delivery(request('/api/twilio/messages/status?workspace=test',fields))).status,200);
  assert.equal(globalThis.testWorkspace.leads[0].communications[0].status,'delivered');
  await delivery(request('/api/twilio/messages/status?workspace=test',{...fields,MessageStatus:'failed',ErrorCode:'21611'}));
  assert.equal(globalThis.testWorkspace.leads[0].smsOptOut,undefined);
  await delivery(request('/api/twilio/messages/status?workspace=test',{...fields,MessageStatus:'failed',ErrorCode:'21610'}));
  assert.equal(globalThis.testWorkspace.leads[0].smsOptOut,true);
});
test('HELP identifies the business and Advanced Opt-Out is not answered twice',async()=>{
 globalThis.testWorkspace={leads:[],callLogs:[],profile:{businessName:'David & Co',callbackNumber:'8185550199'}};
 const fields={MessageSid:'SM-help',From:'+18185550100',To:'+18185550199',Body:'HELP'};
 const response=await inbound(request('/api/twilio/inbound',fields));assert.match(await response.text(),/David &amp; Co.*8185550199.*Reply STOP/);
 assert.equal(globalThis.testWorkspace.leads[0].smsConsent,false);
 const advanced=await inbound(request('/api/twilio/inbound',{...fields,MessageSid:'SM-help-2',OptOutType:'HELP'}));assert.doesNotMatch(await advanced.text(),/<Message>/);
 const stop=await inbound(request('/api/twilio/inbound',{...fields,MessageSid:'SM-stop-localized',Body:'BAJA',OptOutType:'STOP'}));assert.equal(stop.status,200);assert.equal(globalThis.testWorkspace.leads[0].smsOptOut,true);
});

test('an inbound text queues one tracked phone alert after acknowledgement and duplicate callbacks do not repeat it',async()=>{
 const originalFetch=globalThis.fetch,requests=[];globalThis.testAfterResponseJobs=[];
 globalThis.testWorkspace={leads:[{id:1,phone:'8185550100',communications:[]}],callLogs:[],profile:{expoPushToken:'ExpoPushToken[test-device]'}};
 globalThis.fetch=async(url,init)=>{requests.push({url,init});return Response.json({data:{status:'ok'}})};
 try{
  const fields={MessageSid:'SM-phone-alert',From:'+18185550100',To:'+18185550199',Body:'Could you call me tomorrow?'};
  const response=await inbound(request('/api/twilio/inbound',fields));assert.equal(response.status,200);assert.equal(requests.length,0);assert.equal(testAfterResponseJobs.length,1);
  await testAfterResponseJobs.shift()();assert.equal(requests.length,1);assert.equal(requests[0].url,'https://exp.host/--/api/v2/push/send');
  const payload=JSON.parse(requests[0].init.body);assert.equal(payload.to,'ExpoPushToken[test-device]');assert.equal(payload.body,fields.Body);assert.equal(payload.channelId,'pacifica');assert.ok(requests[0].init.signal instanceof AbortSignal);
  assert.equal((await inbound(request('/api/twilio/inbound',fields))).status,200);assert.equal(testAfterResponseJobs.length,0);assert.equal(testWorkspace.leads[0].communications.length,1);
 }finally{globalThis.fetch=originalFetch;globalThis.testAfterResponseJobs=[]}
});

test('phone notification failure cannot undo a saved customer message or fail the webhook',async()=>{
 const originalFetch=globalThis.fetch;globalThis.testAfterResponseJobs=[];
 globalThis.testWorkspace={leads:[],callLogs:[],profile:{expoPushToken:'ExponentPushToken[test-device]'}};
 globalThis.fetch=async()=>{throw Error('Simulated push-provider outage')};
 try{
  const response=await inbound(request('/api/twilio/inbound',{MessageSid:'SM-push-offline',From:'+18185550100',To:'+18185550199',Body:'A new message'}));
  assert.equal(response.status,200);assert.equal(testAfterResponseJobs.length,1);await assert.doesNotReject(testAfterResponseJobs.shift()());assert.equal(testWorkspace.leads[0].communications.length,1);
 }finally{globalThis.fetch=originalFetch;globalThis.testAfterResponseJobs=[]}
});
