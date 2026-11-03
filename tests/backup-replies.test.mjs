import test from 'node:test';import assert from 'node:assert/strict';
import {backupReplyCandidate,backupReplyKey} from '../app/lib/backup-reply-policy.ts';
import {defaultWorkspaceProfile} from '../app/lib/workspace-profile.ts';
import {cleanWarming} from '../app/lib/lead-warming-policy.ts';
import {reserveBudget,budgetTotals,weekStart} from '../app/lib/sms-budget.ts';
import {cleanWorkspacePayload,mergeStoredWorkspace} from '../app/lib/workspace-storage.ts';
const now=new Date('2026-10-27T18:00:00Z');
const incoming={id:'reply',providerId:'SMreply',channel:'sms',direction:'inbound',body:'Could you explain the coverage?',status:'received',sentAt:'2026-10-27T16:30:00Z'};
const profile={...defaultWorkspaceProfile,automationTimezone:'America/Los_Angeles',leadWarming:{...cleanWarming({}),backupRepliesEnabled:true,backupReplyDelayMinutes:60,backupRepliesSince:'2026-10-26T18:00:00Z'}};
const lead=extra=>({id:1,name:'Test Person',phone:'8185550100',stage:'Follow-up',status:'Interested',outcome:'Interested',automationEnabled:false,smsConsent:true,communications:[incoming],...extra});
test('AI-off handoffs can receive only a delayed response to an actual new incoming SMS',()=>{
 assert.equal(backupReplyCandidate([lead()],profile,now)?.id,'reply');
 assert.equal(backupReplyCandidate([lead()],profile,new Date('2026-10-27T17:00:00Z')),null);
 assert.equal(backupReplyCandidate([lead({communications:[]})],profile,now),null);
 assert.equal(backupReplyCandidate([lead()],{...profile,leadWarming:{...profile.leadWarming,backupRepliesEnabled:false}},now),null);
 assert.equal(backupReplyCandidate([lead()],{...profile,leadWarming:{...profile.leadWarming,backupRepliesSince:now.toISOString()}},now),null);
 assert.equal(backupReplyCandidate([lead()],profile,new Date('2026-10-28T03:00:00Z')),null);
});
test('STOP, hard contact locks and a duplicate record opting out always block backup replies',()=>{
 for(const patch of [{doNotCall:true},{smsOptOut:true},{backupReplyDisabled:true},{stage:'Closed'},{outcome:'Wrong number'},{deletedAt:now.toISOString()},{communications:[{...incoming,body:'STOP'}]}])assert.equal(backupReplyCandidate([lead(patch)],profile,now),null);
 assert.equal(backupReplyCandidate([lead(),lead({id:2,smsOptOut:true})],profile,now),null);
});
test('a human response, pending outbound submission or newer inbound email prevents a redundant text',()=>{
 for(const message of [{id:'answer',channel:'sms',direction:'outbound',status:'queued',body:'I can help',sentAt:'2026-10-27T17:30:00Z'},{id:'mail',channel:'email',direction:'inbound',status:'received',body:'I replied by email',sentAt:'2026-10-27T17:30:00Z'}])assert.equal(backupReplyCandidate([lead({communications:[incoming,message]})],profile,now),null);
});
test('the transactional reservation validates the latest reply and cannot repeat a submitted operation',()=>{
 const w={profile,leads:[lead()],callLogs:[]},input={id:'one',key:backupReplyKey('8185550100',incoming),to:'8185550100',body:'What would you like to compare?',automated:true,purpose:'unanswered-reply',replyId:'SMreply'};
 const saved=reserveBudget(w,input,now);assert.equal(saved.smsLedger.claims.length,1);
 assert.throws(()=>reserveBudget(saved,{...input,id:'two'},now),/already/);
 assert.throws(()=>reserveBudget(w,{...input,replyId:'old'},now),/no longer/);
 const pending={...saved,smsLedger:{claims:saved.smsLedger.claims.map(c=>({...c,key:'manual-request'}))}};
 assert.throws(()=>reserveBudget(pending,{...input,id:'two'},now),/already being sent/);
});
test('a calendar-week cap spans month boundaries and resets on Monday without freeing unknown submissions',()=>{
 const w={profile:{...profile,leadWarming:{...profile.leadWarming,dailyBudgetCents:100,weeklyBudgetCents:6,monthlyBudgetCents:100}},leads:[],callLogs:[]};
 let saved=reserveBudget(w,{id:'one',to:'8185550100',body:'Hello'},new Date('2026-10-30T18:00:00Z'));
 saved=reserveBudget(saved,{id:'two',to:'8185550200',body:'Hello'},new Date('2026-11-01T19:00:00Z'));
 assert.equal(budgetTotals(saved.smsLedger,'2026-11-01').weekCents,6);assert.equal(budgetTotals(saved.smsLedger,'2026-11-01').monthCents,3);
 assert.throws(()=>reserveBudget(saved,{id:'three',to:'8185550300',body:'Hello'},new Date('2026-11-01T20:00:00Z')),/weekly/);
 assert.equal(reserveBudget(saved,{id:'four',to:'8185550400',body:'Hello'},new Date('2026-11-02T19:00:00Z')).smsLedger.claims.length,3);
 assert.equal(weekStart('2027-01-01'),'2026-12-28');
});
test('an old browser cannot erase the owner-approved backup permission or spending policy',()=>{
 const server={profile:{...profile,leadWarming:{...profile.leadWarming,policyUpdatedAt:now.toISOString()}},leads:[lead()],callLogs:[]};
 const stale=cleanWorkspacePayload({...server,profile:{...profile,leadWarming:{enabled:true,dailyBudgetCents:300,monthlyBudgetCents:5000}}});
 const merged=mergeStoredWorkspace(server,stale);assert.equal(merged.profile.leadWarming.backupRepliesEnabled,true);assert.equal(merged.profile.leadWarming.weeklyBudgetCents,1000);assert.equal(merged.profile.leadWarming.policyUpdatedAt,now.toISOString());
});
