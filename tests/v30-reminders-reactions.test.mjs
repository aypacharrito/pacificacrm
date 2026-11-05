import test from 'node:test';import assert from 'node:assert/strict';
import {applyNoteCandidates,visibleNoteReminders} from '../app/lib/note-reminders.ts';
import {smsReactionBody} from '../app/lib/message-reactions.ts';
import {mergeStoredWorkspace} from '../app/lib/workspace-storage.ts';
import {defaultWorkspaceProfile,cleanWorkspaceProfile} from '../app/lib/workspace-profile.ts';
import {pacificaPlans,planAmountInCents} from '../app/lib/plans.ts';
import * as captureModule from '../mobile/src/lib/contact-capture.ts';
const {capturedContact,cleanContactDraft}=captureModule.default||captureModule;
const now='2026-10-02T16:00:00Z',lead={id:1,notes:'Please send the declaration page.'},candidate={leadId:1,title:'Get declaration page',evidence:lead.notes,dueAt:''};
test('reminders require source evidence and reject invented or deleted contacts',()=>{
 const items=applyNoteCandidates([],[candidate,{...candidate,leadId:2},{...candidate,evidence:'Invented task text'},{...candidate,leadId:3}],[lead,{...lead,id:3,deletedAt:now}],now);assert.equal(items.length,1);
});
test('completed reminders survive rescans and stale workspace saves',()=>{
 const [item]=applyNoteCandidates([],[candidate],[lead],now),done={...item,status:'done'};assert.deepEqual(applyNoteCandidates([done],[candidate],[lead],now),[done]);
 const base={leads:[lead],callLogs:[],profile:defaultWorkspaceProfile};assert.deepEqual(mergeStoredWorkspace({...base,noteReminders:[done]},{...base,noteReminders:[item]}).noteReminders,[done]);assert.equal(visibleNoteReminders([done],Date.parse(now)).length,0);
});
test('snooze respects time and ambiguous date-only AI output is due for review',()=>{
 const [item]=applyNoteCandidates([],[{...candidate,dueAt:'2026-10-03'}],[lead],now);assert.equal(item.dueAt,'');assert.equal(visibleNoteReminders([item],Date.parse(now)).length,1);
 const later={...item,snoozedUntil:'2026-10-03T16:00:00Z'};assert.equal(visibleNoteReminders([later],Date.parse(now)).length,0);assert.equal(visibleNoteReminders([later],Date.parse(later.snoozedUntil)).length,1);
});
test('mobile scan retains document fields and term premium without inventing consent or annualizing',()=>{
 const saved=capturedContact(cleanContactDraft({name:'Sample',phone:'8185550100',dateOfBirth:'1991-02-03',address:'1 Sample Rd',licenseNumber:'D1234567',vin:'1TEST123456789012',carrier:'Carrier',policyPremium:'$1,234.56',policyTermMonths:'6',notes:'Additional driver: Sample'}),1);
 assert.equal(saved.dateOfBirth,'1991-02-03');assert.equal(saved.licenseNumber,'D1234567');assert.equal(saved.vin,'1TEST123456789012');assert.equal(saved.policyPremium,1234.56);assert.equal(saved.policyTermMonths,6);assert.equal(saved.smsConsent,false);assert.equal(saved.importedFields.policyPremium,'$1,234.56');
});
test('roster supports more than 50 people and pricing matches requested allowances',()=>{
 const teamRoster=Array.from({length:75},(_,i)=>({userId:`user_${i}`,name:`Agent ${i}`,email:`agent${i}@example.test`,role:'agent',active:true}));const profile=cleanWorkspaceProfile({...defaultWorkspaceProfile,teamRoster,teamMembers:teamRoster.map(t=>t.name)});assert.equal(profile.teamRoster.length,75);assert.equal(profile.teamMembers.length,75);assert.equal(planAmountInCents('solo'),2500);assert.equal(planAmountInCents('team'),10000);assert.equal(planAmountInCents('agency'),20000);assert.match(pacificaPlans.agency.seats,/Up to 10 users/);
});
test('SMS reaction identifies media or text and bounds Unicode quotes',()=>{
 assert.equal(smsReactionBody({body:'Yes,  please\ncall tomorrow'},'❤️'),'❤️ to “Yes, please call tomorrow”');assert.equal(smsReactionBody({body:'',attachments:[{type:'application/pdf'}]},'👍'),'👍 to your PDF');assert.equal(smsReactionBody({body:'',mediaCount:2},'👍'),'👍 to your attachments');assert.equal(smsReactionBody({body:'😀'.repeat(110)},'😂'),'😂 to “'+'😀'.repeat(100)+'…”');
});
