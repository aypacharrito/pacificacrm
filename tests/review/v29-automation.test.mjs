import test from 'node:test';import assert from 'node:assert/strict';
import {dailyCandidates,claimDailyOutreach,runDailyOutreach,localOutreachDay} from '../../app/lib/daily-outreach.ts';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
import {defaultRule} from '../../app/lib/ai-control.ts';
const lead=(id)=>({id,name:'Person '+id,phone:'8185550'+String(99+id),stage:'Follow-up',outcome:'Completed',smsConsent:true,automationEnabled:true,automationStatus:'complete',communications:[]});
const fixture=()=>({leads:[lead(1),lead(2),lead(3)],callLogs:[],profile:{...defaultWorkspaceProfile,leadWarming:{...defaultWorkspaceProfile.leadWarming,enabled:false}},aiControl:{revision:1,salesEnabled:true,receipts:[],rules:{sms:{...defaultRule(),dailyAt:'09:30',audience:'follow-ups'}}}});
test('daily rules repeat after completed sequences, at local time across DST',()=>{
 const w=fixture();assert.equal(dailyCandidates(w,'sms',new Date('2026-10-01T16:29:00Z')).length,0);
 assert.equal(dailyCandidates(w,'sms',new Date('2026-10-01T16:30:00Z')).length,3);
 assert.equal(dailyCandidates(w,'sms',new Date('2026-12-01T17:30:00Z')).length,3);
 assert.equal(dailyCandidates(w,'sms',new Date('2026-10-01T17:30:00Z')).length,0);
 assert.equal(localOutreachDay(new Date('2026-10-02T01:00:00Z'),'America/Los_Angeles'),'2026-10-01');
});
test('claims stop duplicate sends in the same day but allow the next day; manual locks win',()=>{
 const now=new Date('2026-10-01T16:30:00Z'),w=fixture();w.leads.push({...w.leads[0],id:4});
 const claimed=claimDailyOutreach(w,1,'sms','claim1',now);
 assert.equal(dailyCandidates(claimed,'sms',now).length,2);assert.equal(claimed.leads[3].dailyOutreach.sms.claim,'claim1');
 assert.equal(claimDailyOutreach(claimed,1,'sms','claim2',now),claimed);
 assert.equal(dailyCandidates(claimed,'sms',new Date('2026-10-02T16:30:00Z')).length,3);
 for(const patch of [{outcome:'Interested'},{stage:'Closed'},{smsOptOut:true},{doNotCall:true},{automationEnabled:false},{deletedAt:'2026-10-01'}]){const blocked=fixture();blocked.leads[0]={...blocked.leads[0],...patch};assert.equal(dailyCandidates(blocked,'sms',now).length,2);}
});
test('cloud sending skips failed numbers, persists every result, and concurrent runs cannot double send',async()=>{
 globalThis.testWorkspace=fixture();const now=new Date(),parts=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);testWorkspace.aiControl.rules.sms={...defaultRule(),dailyAt:parts,timeZone:'UTC'};
 globalThis.testDeliveries=[];
 const results=await Promise.all([runDailyOutreach(),runDailyOutreach()]);
 assert.equal(testDeliveries.length,3);assert.equal(results.reduce((n,r)=>n+r.sent,0),2);
 assert.equal(testWorkspace.leads[0].dailyOutreach.sms.state,'review');assert.equal(testWorkspace.leads[1].dailyOutreach.sms.state,'sent');
 await runDailyOutreach();assert.equal(testDeliveries.length,3);
});

test('reply-interest route validates origin and refuses invented inbound messages',async()=>{
 const {POST}=await import('../../app/api/crm/reply-interest/route.ts');
 globalThis.testWorkspace=fixture();testWorkspace.leads[0].communications=[{id:'reply1',channel:'sms',direction:'inbound',body:'Yes',status:'received',provider:'twilio',sentAt:'2026-10-01T16:00:00Z'}];
 const body={leadId:1,replyId:'reply1',channel:'sms',interested:true};
 const request=(origin,data=body)=>new Request('https://example.test/api/crm/reply-interest',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(data)});
 assert.equal((await POST(request('https://elsewhere.test'))).status,403);
 assert.equal((await POST(request('https://example.test',{...body,replyId:'made-up'}))).status,400);
 const response=await POST(request('https://example.test'));assert.equal(response.status,200);assert.equal(testWorkspace.leads[0].outcome,'Interested');assert.equal(testWorkspace.leads[0].automationEnabled,false);
 assert.equal((await response.json()).patches.length,1);
});

test('smart lead warming disables the legacy recurring daily blast path',()=>{const w=fixture();w.profile.leadWarming.enabled=true;assert.equal(dailyCandidates(w,'sms',new Date('2026-10-01T16:30:00Z')).length,0)});
