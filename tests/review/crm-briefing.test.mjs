import test from 'node:test';
import assert from 'node:assert/strict';
import {crmBriefing} from '../../app/lib/connected/crm-briefing.ts';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';

const now=Date.parse('2026-11-27T16:00:00Z');
const profile={...defaultWorkspaceProfile,teamRoster:[
  {userId:'dealer-a',email:'a@example.test',name:'Dealer A',role:'agent',active:true},
  {userId:'dealer-b',email:'b@example.test',name:'Dealer B',role:'agent',active:true},
]};
const message=(id,body,at='2026-11-26T16:00:00Z')=>({id,channel:'sms',direction:'inbound',provider:'twilio',body,sentAt:at,status:'received'});
const lead=(id,name,assignedTo,communications=[],followUp='')=>({id,name,assignedTo,stage:'Follow-up',communications,followUp});
const workspace={profile,callLogs:[],officeItems:[{id:'appointment-a',kind:'appointment',status:'open',leadId:1,title:'Review with Ana',dueAt:'2026-11-27T18:00:00Z'}],leads:[
  lead(1,'Ana','Dealer A',[message('sms-es','Sí, me interesa. Llámame el martes a las dos.')],'2026-11-27T17:00:00Z'),
  lead(2,'Ben','Dealer B',[message('sms-b','Call me today')],'2026-11-27T17:30:00Z'),
  {...lead(3,'Deleted','Dealer A',[message('sms-deleted','Call me')]),deletedAt:'2026-11-26T00:00:00Z'},
  lead(4,'Old','Dealer A',[message('sms-old','Call me','2026-09-01T00:00:00Z')],'2026-09-01T00:00:00Z'),
  lead(5,'Answered','Dealer A',[message('sms-answered','Call me'),{id:'reply',channel:'sms',direction:'outbound',sentAt:'2026-11-27T08:00:00Z'}]),
]};

test('two dealer members see only their own exact CRM SMS source, including Spanish phrasing',()=>{
  const a=crmBriefing(workspace,{id:'dealer-a',role:'agent'},'callback',0,0,now);
  const b=crmBriefing(workspace,{id:'dealer-b',role:'agent'},'callback',0,0,now);
  assert.deepEqual(a.map(source=>source.href),['/dashboard?crmLead=1&crmMessage=sms-es']);
  assert.deepEqual(b.map(source=>source.href),['/dashboard?crmLead=2&crmMessage=sms-b']);
  assert.equal(a[0].label,'Ana');
  assert.deepEqual(crmBriefing(workspace,{id:'missing-roster-member',role:'agent'},'callback',0,0,now),[]);
  assert.deepEqual(crmBriefing(null,{id:'dealer-a',role:'agent'},'callback',0,0,now),[]);
  const sameName={...workspace,profile:{...profile,teamRoster:profile.teamRoster.map(person=>({...person,name:'Dealer A'}))}};
  assert.deepEqual(crmBriefing(sameName,{id:'dealer-a',role:'agent'},'callback',0,0,now),[]);
  assert.deepEqual(crmBriefing(sameName,{id:'dealer-b',role:'agent'},'callback',0,0,now),[]);
});

test('workspace boundary, due callbacks and exact appointment links exclude stale and other-member records',()=>{
  const otherWorkspace={...workspace,leads:[lead(1,'Other dealer','Dealer A',[message('other-sms','Call me')])],officeItems:[]};
  assert.deepEqual(crmBriefing(otherWorkspace,{id:'dealer-a',role:'agent'},'callback',0,0,now).map(source=>source.label),['Other dealer']);
  const due=crmBriefing(workspace,{id:'dealer-a',role:'agent'},'needsToday',Date.parse('2026-11-27T08:00:00Z'),Date.parse('2026-11-28T08:00:00Z'),now);
  assert.deepEqual(due.map(source=>source.href),['/dashboard?crmLead=1','/dashboard?calendar=1&day=2026-11-27&appointment=appointment-a']);
  assert.equal(due.some(source=>source.label==='Ben'||source.label==='Old'||source.label==='Deleted'),false);
});
