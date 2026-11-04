import test from 'node:test';
import assert from 'node:assert/strict';
import {sealCalendar,openCalendar} from '../app/lib/calendar-vault.ts';
import {googleOfficeEvent} from '../app/lib/google-calendar.ts';
import {officeStaffReminderAt} from '../app/lib/office-schedule.ts';
import * as calendarReminders from '../mobile/src/lib/calendar-reminders.ts';
// Expo is CommonJS; Node 22 exposes these TypeScript exports under default.
const {calendarNotificationPlan,reconcileCalendarNotifications}=calendarReminders.default||calendarReminders;
const item={id:'a1',leadId:1,title:'Consultation',kind:'appointment',dueAt:'2027-02-01T18:00:00Z',amount:0,status:'open',reminderState:'off',staffReminderMinutes:15,durationMinutes:45};
test('calendar vault encrypts tokens and binds ciphertext to its workspace',()=>{
 const previous=process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY;process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY='ab'.repeat(32);
 try{const encrypted=sealCalendar({refreshToken:'secret-refresh'},'workspace-a');assert.ok(!encrypted.includes('secret-refresh'));assert.deepEqual(openCalendar(encrypted,'workspace-a'),{refreshToken:'secret-refresh'});assert.throws(()=>openCalendar(encrypted,'workspace-b'));const raw=Buffer.from(encrypted,'base64url');raw[30]^=1;assert.throws(()=>openCalendar(raw.toString('base64url'),'workspace-a'))}finally{if(previous)process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY=previous;else delete process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY}
});
test('Google events keep stable tenant-specific IDs and omit contact-sensitive fields',()=>{
 const event=googleOfficeEvent({...item,phone:'8185550101',dateOfBirth:'1990-01-01',notes:'Private notes'},'workspace-a');
 assert.equal(event.end.dateTime,'2027-02-01T18:45:00.000Z');assert.deepEqual(event.reminders.overrides,[{method:'popup',minutes:15}]);assert.equal(event.visibility,'private');assert.equal(event.attendees,undefined);assert.ok(!JSON.stringify(event).includes('Private notes'));assert.equal(event.id,googleOfficeEvent({...item,title:'Changed'},'workspace-a').id);assert.notEqual(event.id,googleOfficeEvent(item,'workspace-b').id);assert.deepEqual(googleOfficeEvent({...item,staffReminderMinutes:-1},'workspace-a').reminders.overrides,[]);
});
test('personal reminders are independent of customer SMS state and disabled on completed items',()=>{
 assert.equal(officeStaffReminderAt(item),Date.parse(item.dueAt)-900000);assert.equal(officeStaffReminderAt({...item,status:'done'}),0);assert.equal(officeStaffReminderAt({...item,staffReminderMinutes:-1}),0);assert.equal(officeStaffReminderAt({...item,staffReminderMinutes:0}),Date.parse(item.dueAt));
});
test('mobile reminder plan excludes completed, disabled and past reminders and caps the nearest 60',()=>{
 const now=Date.parse('2027-02-01T17:00:00Z');const items=[{...item,status:'done'},{...item,staffReminderMinutes:-1},{...item,dueAt:'2020-01-01'},...Array.from({length:70},(_,i)=>({...item,id:String(i),dueAt:new Date(now+3600000+i*60000).toISOString()}))];
 const plan=calendarNotificationPlan(items,'account-a',now);assert.equal(plan.length,60);assert.equal(plan[0].identifier,'pacifica-calendar:account-a:0');assert.equal(plan[59].identifier,'pacifica-calendar:account-a:59');
});
test('mobile reconciliation cancels removed, changed and other-account reminders without duplicating unchanged events',async()=>{
 const plan=calendarNotificationPlan([item],'account-a',Date.parse('2027-02-01'));
 const canceled=[],scheduled=[];let existing=[{identifier:plan[0].identifier,content:{data:{fingerprint:'old'}}},{identifier:'pacifica-calendar:account-b:other',content:{}},{identifier:'message:1',content:{}}];
 const io={list:async()=>existing,cancel:async id=>canceled.push(id),schedule:async value=>scheduled.push(value)};
 await reconcileCalendarNotifications(plan,io);assert.deepEqual(canceled,[plan[0].identifier,'pacifica-calendar:account-b:other']);assert.equal(scheduled.length,1);
 existing=[{identifier:plan[0].identifier,content:{data:{fingerprint:JSON.stringify([plan[0].at,plan[0].title,plan[0].body])}}}];canceled.length=0;scheduled.length=0;
 await reconcileCalendarNotifications(plan,io);assert.equal(canceled.length,0);assert.equal(scheduled.length,0);
 await reconcileCalendarNotifications([],io,'account-b');assert.equal(canceled.length,0);
 await reconcileCalendarNotifications([],io,'account-a');assert.deepEqual(canceled,[plan[0].identifier]);
});
