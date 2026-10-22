import test from 'node:test';
import assert from 'node:assert/strict';
import {conversationInboxStatus,stoppedSmsPhones,matchesConversationFilter} from '../app/lib/message-inbox.ts';
const lead=(id,extra={})=>({id,phone:'8185550100',email:'client@example.test',stage:'Follow-up',doNotCall:false,...extra});
test('STOP is conversation-wide, including duplicate contacts and stale stage values',()=>{
 const status=conversationInboxStatus([lead(1,{smsOptOut:true}),lead(2,{phone:'+1 (818) 555-0100'}),lead(3,{phone:'8185550200'})],'sms',new Set());
 assert.equal(status.get(1).closed,true);assert.equal(status.get(2).closed,true);assert.equal(status.get(2).optedOut,true);assert.equal(status.get(3).closed,false);
});
test('only inbound opt-out commands close SMS; the latest command wins regardless of message order',()=>{
 const sms=(body,sentAt,direction='inbound')=>({body,sentAt,direction,from:'+18185550100'});
 const stopped=sms('STOP!','2026-09-30T10:00:00Z');
 assert.equal(stoppedSmsPhones([sms('Reply STOP to opt out.','2026-09-30T09:00:00Z','outbound')]).size,0);
 assert.equal(stoppedSmsPhones([stopped]).has('8185550100'),true);
 assert.equal(stoppedSmsPhones([sms('START','2026-09-30T11:00:00Z'),stopped]).size,0);
 assert.equal(stoppedSmsPhones([stopped,sms('Please stop by tomorrow','2026-09-30T12:00:00Z')]).size,1);
});
test('email opt-outs are channel-specific and blank addresses do not combine unrelated people',()=>{
 const leads=[lead(1,{emailOptOut:true}),lead(2,{email:'CLIENT@example.test'}),lead(3,{email:'',phone:'',smsOptOut:true}),lead(4,{email:'',phone:''})];
 assert.equal(conversationInboxStatus(leads,'email',new Set()).get(2).closed,true);
 assert.equal(conversationInboxStatus(leads,'sms',new Set()).get(2).closed,false);
 assert.equal(conversationInboxStatus(leads,'sms',new Set()).get(4).closed,false);
});
test('manual closure and DNC still use Closed without inventing an opt-out',()=>{
 const status=conversationInboxStatus([lead(1,{stage:'Closed'}),lead(2,{phone:'8185550200',doNotCall:true})],'sms',new Set());
 assert.equal(status.get(1).closed,true);assert.equal(status.get(1).optedOut,false);assert.equal(status.get(2).closed,true);
});

test('SMS Reply includes only explicitly Interested contacts, regardless of later outgoing traffic',()=>{
 const inbound={direction:'inbound'},outbound={direction:'outbound'};
 for(const field of ['stage','status','outcome']) {
  assert.equal(matchesConversationFilter({[field]:'Interested'},'sms','replies',false,[inbound,outbound]),true);
  assert.equal(matchesConversationFilter({[field]:'Interested'},'sms','replies',false,[]),true);
 }
 for(const lead of [{},{status:'replied'},{outcome:'Not interested'},{automationStatus:'replied'},{sourceDisposition:'Interested - Working'}])
  assert.equal(matchesConversationFilter(lead,'sms','replies',false,[inbound,outbound]),false);
 assert.equal(matchesConversationFilter({outcome:'Interested'},'sms','replies',true,[inbound]),false);
 assert.equal(matchesConversationFilter({outcome:'Interested'},'sms','closed',true,[inbound]),true);
 assert.equal(matchesConversationFilter({outcome:'Interested'},'sms','all',false,[outbound]),true);
 assert.equal(matchesConversationFilter({},'sms','sent',false,[outbound]),true);
 assert.equal(matchesConversationFilter({},'sms','sent',false,[inbound]),false);
 assert.equal(matchesConversationFilter({},'email','replies',false,[inbound]),true);
 assert.equal(matchesConversationFilter({outcome:'Interested'},'email','replies',false,[outbound]),false);
});
