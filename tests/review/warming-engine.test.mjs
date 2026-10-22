import test from 'node:test';import assert from 'node:assert/strict';
import {SmsBudgetError} from '../../app/lib/sms-budget.ts';
import {runLeadWarming} from '../../app/lib/lead-warming-engine.ts';import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
const OriginalDate=Date;let clock=Date.parse('2026-10-22T18:00:00Z');
class Clock extends OriginalDate{constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
function setup(lead={}){clock=Date.parse('2026-10-22T18:00:00Z');globalThis.Date=Clock;globalThis.warmingDeliveries=[];globalThis.warmingEmails=[];globalThis.warmingIntent=null;globalThis.warmingFail=false;globalThis.warmingError=null;globalThis.warmingWorkspace={leads:[{id:1,name:'Alex',phone:'8185550100',email:'alex@example.test',source:'Test',stage:'New lead',outcome:'Not contacted',smsConsent:true,emailConsent:true,importedAt:new Date(clock-600000).toISOString(),...lead}],callLogs:[],profile:{...defaultWorkspaceProfile,businessName:'Pacifica',agentName:'Alejandro',businessAddress:'123 Test St',serverAutomationEnabled:true}};}
function inbound(body,id='reply'){return {id,providerId:id,channel:'sms',direction:'inbound',body,status:'received',sentAt:new Date(clock-1000).toISOString(),provider:'twilio'}}
test('fresh lead receives a bounded text, a later touch, then useful email instead of endless SMS',async()=>{
 setup();try{await runLeadWarming();await runLeadWarming();assert.equal(warmingDeliveries.length,1);clock+=4*86400000;await runLeadWarming();assert.equal(warmingDeliveries.length,2);clock+=4*86400000;await runLeadWarming();assert.equal(warmingDeliveries.length,2);assert.equal(warmingEmails.length,1);assert.match(warmingEmails[0].text,/deductibles/);}finally{globalThis.Date=OriginalDate}
});
test('positive replies become Interested tasks while refusals suppress further outreach',async()=>{
 setup();warmingWorkspace.leads[0].communications=[inbound('yes please')];try{const r=await runLeadWarming();assert.equal(r.interested,1);assert.equal(warmingWorkspace.leads[0].outcome,'Interested');assert.ok(warmingWorkspace.leads[0].followUp);assert.equal(warmingDeliveries.length,0);
 setup();warmingWorkspace.leads[0].communications=[inbound('not interested')];await runLeadWarming();assert.equal(warmingWorkspace.leads[0].doNotCall,true);await runLeadWarming();assert.equal(warmingDeliveries.length,0);}finally{globalThis.Date=OriginalDate}
});
test('explicit renewal timing and a requested reconnect produce a saved snooze, not an immediate blast',async()=>{
 setup();warmingWorkspace.leads[0].communications=[inbound('My policy renews in June. Please call me before then.')];warmingIntent={intent:'later',confidence:.99,summary:'Requested a call before June renewal.',language:'en',renewalEvidence:'in June',reconnectPermission:true};
 try{await runLeadWarming();const n=warmingWorkspace.leads[0].nurture;assert.equal(n.phase,'snoozed');assert.equal(n.renewalDate,undefined);assert.equal(n.renewalMonth,'2027-06');assert.match(n.resumeAt,/2027-05-02/);await runLeadWarming();assert.equal(warmingDeliveries.length,0);}finally{globalThis.Date=OriginalDate}
});
test('an unknown provider outcome is retained for review and never blindly retried',async()=>{
 setup();warmingFail=true;try{await runLeadWarming();assert.equal(warmingDeliveries.length,1);assert.equal(warmingWorkspace.leads[0].nurture.phase,'review');clock+=4*86400000;await runLeadWarming();assert.equal(warmingDeliveries.length,1);}finally{globalThis.Date=OriginalDate}
});
test('disabled automation, old leads, missing consent, and DNC never trigger paid outreach',async()=>{
 try{for(const patch of [{doNotCall:true},{smsConsent:false,emailConsent:false},{importedAt:'2020-01-01T00:00:00Z'}]){setup(patch);await runLeadWarming();assert.equal(warmingDeliveries.length,0);assert.equal(warmingEmails.length,0);}setup();warmingWorkspace.profile.serverAutomationEnabled=false;await runLeadWarming();assert.equal(warmingDeliveries.length,0);}finally{globalThis.Date=OriginalDate}
});

test('a new high-confidence question gets one short response, and a stale question is not answered again',async()=>{
 setup();warmingWorkspace.leads[0].communications=[inbound('Who is this?')];warmingIntent={intent:'question',confidence:.99,summary:'Asked who is contacting them.',language:'en',renewalEvidence:'',reconnectPermission:false};
 try{await runLeadWarming();await runLeadWarming();assert.equal(warmingDeliveries.length,1);assert.equal(warmingDeliveries[0].replyId,'reply');assert.equal(warmingWorkspace.leads[0].nurture.phase,'review');}finally{globalThis.Date=OriginalDate}
});

test('known budget holds defer a cold text and can resume without treating it as an unknown delivery',async()=>{
 setup();warmingError=new SmsBudgetError('budget','Estimated SMS budget reached.');
 try{await runLeadWarming();assert.equal(warmingWorkspace.leads[0].nurture.phase,'waiting');assert.ok(warmingWorkspace.leads[0].nurture.smsRetryAt);assert.equal(Object.keys(warmingWorkspace.leads[0].nurture.actions).length,0);await runLeadWarming();assert.equal(warmingDeliveries.length,1);warmingError=null;clock+=4*86400000;await runLeadWarming();assert.equal(warmingDeliveries.length,2);}finally{globalThis.Date=OriginalDate}
});
