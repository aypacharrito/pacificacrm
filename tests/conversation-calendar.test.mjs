import test from 'node:test';import assert from 'node:assert/strict';
import {applyCandidates} from '../app/lib/conversation-calendar.ts';
const now=Date.parse('2026-09-26T16:00:00Z'),dueAt='2026-09-27T17:00:00Z';
const lead={id:1,name:'Test Person',phone:'8185550100',communications:[{id:'in',channel:'sms',direction:'inbound',body:'Yes interested in insurance',sentAt:'2026-09-26T14:00:00Z',status:'received'},{id:'out',channel:'sms',direction:'outbound',body:'I will call Sunday at 10 AM',sentAt:'2026-09-26T15:00:00Z',status:'sent'}]};
const c={leadId:1,dueAt,interestId:'in',interestQuote:'interested in insurance',scheduleId:'out',scheduleQuote:'Sunday at 10 AM'};
test('text appointment creates once, remembers deletion, and matches manual events across duplicate contacts',()=>{const first=applyCandidates([lead],[],[c],[],now);assert.equal(first.added,1);assert.equal(first.items[0].reminderState,'off');assert.equal(applyCandidates([lead],[],[c],first.remembered,now).added,0);const manual={...first.items[0],id:'manual',leadId:2};assert.equal(applyCandidates([lead,{...lead,id:2}], [manual],[c],[],now).added,0)});
test('rejects invented evidence, failed outbound texts, cold closed contacts and uncertain dates',()=>{for(const candidate of [{...c,interestQuote:'invented'},{...c,dueAt:'tomorrow'},{...c,dueAt:'2026-01-01T00:00:00Z'}])assert.equal(applyCandidates([lead],[],[candidate],[],now).added,0);assert.equal(applyCandidates([{...lead,stage:'Closed'}],[],[c],[],now).added,0);assert.equal(applyCandidates([{...lead,communications:lead.communications.map(m=>({...m,status:'failed'}))}],[],[c],[],now).added,0)});

test('accepts an interested customer requesting a definite callback and confirmation after an agent proposal',()=>{
 const customer={...lead,communications:[{...lead.communications[0],body:'Yes interested in insurance. Call Sunday at 10 AM'}]};
 assert.equal(applyCandidates([customer],[],[{...c,scheduleId:'in',scheduleQuote:'Sunday at 10 AM'}],[],now).added,1);
 const confirmed={...lead,communications:lead.communications.map(m=>m.id==='in'?{...m,sentAt:'2026-09-26T15:30:00Z'}:m)};
 assert.equal(applyCandidates([confirmed],[],[c],[],now).added,1);
});

import {pendingConversationThreads,conversationBatch,hash} from '../app/lib/conversation-calendar.ts';
test('backlog drains without rescanning unchanged conversations and includes inbound-only requests',()=>{
 const leads=Array.from({length:45},(_,i)=>({...lead,id:i+1,communications:[lead.communications[0]]}));
 let checked={};const sizes=[];
 for(let i=0;i<3;i++){const batch=conversationBatch(pendingConversationThreads(leads,checked,now));sizes.push(batch.length);checked={...checked,...Object.fromEntries(batch.map(t=>[t.leadId,'v4:'+hash(t.messages)]))}}
 assert.deepEqual(sizes,[20,20,5]);assert.equal(pendingConversationThreads(leads,checked,now).length,0);
});
