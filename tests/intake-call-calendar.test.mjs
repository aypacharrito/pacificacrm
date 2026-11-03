import test from 'node:test';import assert from 'node:assert/strict';
import {contactIntakeDetails,contactIntakeCanSave} from '../app/lib/contact-intake.ts';
import {appendMobileCallNote} from '../app/lib/mobile-call-note.ts';
import {thread,applyCandidates,pendingConversationThreads,calendarReviewVersion,hash} from '../app/lib/conversation-calendar.ts';
test('ID fields move into dedicated contact fields without inventing phone or dates',()=>{
 const draft={name:'Sample Person',otherFields:[{label:'Driver license number',value:'A0123456'},{label:'DOB',value:'06/19/1992'},{label:'Street address',value:'123 Example Ave Apt 3'},{label:'ZIP',value:'91335'},{label:'Driver license expiration',value:'02/31/2030'}]};
 const fields=contactIntakeDetails(draft);assert.equal(fields.licenseNumber,'A0123456');assert.equal(fields.dateOfBirth,'1992-06-19');assert.equal(fields.address,'123 Example Ave Apt 3');assert.equal(fields.licenseExpiration,'');assert.equal(contactIntakeCanSave(draft),true);assert.equal(contactIntakeCanSave({name:'Unknown'}),false);
});
test('phone call notes append atomically and retries cannot duplicate them',()=>{
 const before=[{id:1,name:'Sample',notes:'Keep existing notes'},{id:2,notes:'Other contact'}],input={leadId:1,key:'mobile:test-call',notes:'Appointment booked October 30 at 2 PM.',outcome:'Appointment set'};
 const first=appendMobileCallNote(before,input,'2026-10-28T22:00:00Z');assert.match(first[0].notes,/Keep existing notes/);assert.match(first[0].notes,/October 30/);assert.deepEqual(appendMobileCallNote(first,input),first);assert.deepEqual(first[1],before[1]);assert.throws(()=>appendMobileCallNote(before,{...input,leadId:3}));
});
test('saved notes create dated all-day or timed appointments once; ambiguous, old or invented evidence is rejected',()=>{
 const now=Date.parse('2026-10-29T01:00:00Z'),notes='His policy lapses on the 29th of October. Quote and bind on the 30th. Appointment—get this on my calendar too.',lead={id:1,name:'Sample',phone:'8185550100',notes,notesUpdatedAt:'2026-10-28T22:32:56Z'};
 const source=thread(lead,now)[0],candidate={leadId:1,dueAt:'2026-10-30',interestId:source.id,interestQuote:notes,scheduleId:source.id,scheduleQuote:notes};
 const result=applyCandidates([lead],[],[candidate],[],now);assert.equal(result.added,1);assert.equal(result.items[0].allDayDate,'2026-10-30');assert.equal(result.items[0].staffReminderMinutes,-1);assert.equal(applyCandidates([lead],result.items,[candidate],[],now).added,0);
 assert.equal(applyCandidates([lead],[],[{...candidate,scheduleQuote:'invented appointment October 30'}],[],now).added,0);
 assert.equal(applyCandidates([lead],[],[{...candidate,dueAt:'2026-10-15'}],[],now).added,0);
 const unclear={...lead,notes:'Maybe appointment sometime next month'};const id=thread(unclear,now)[0].id;assert.equal(applyCandidates([unclear],[],[{...candidate,interestId:id,scheduleId:id,interestQuote:unclear.notes,scheduleQuote:unclear.notes}],[],now).added,0);
 const pending=pendingConversationThreads([lead],{},now);assert.equal(pending.length,1);assert.equal(pendingConversationThreads([lead],{1:calendarReviewVersion+hash(pending[0].messages)},now).length,0);
});
