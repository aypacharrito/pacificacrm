import test from 'node:test';
import assert from 'node:assert/strict';
import {callbackRequests,needsTodayMail} from '../../app/lib/connected/briefing.ts';
import {connectedIntent} from '../../app/lib/connected/assistant.ts';

const row=(subject,preview,overrides={})=>({subject,preview,sender:'Client',at:Date.parse('2026-11-25T10:00:00Z'),source:'signed-source',account:'member@example.test',unread:true,starred:true,sent:false,inbox:true,...overrides});

test('English and Spanish launcher questions select only read-only source-backed intents',()=>{
  assert.equal(connectedIntent('What needs me today?'),'needsToday');
  assert.equal(connectedIntent('¿Quién pidió que le llamara?'),'callback');
  assert.equal(connectedIntent('Send a text to everyone today'),undefined);
});

test('callback evidence requires a specific inbound request; account labels and sent mail do not count',()=>{
  const rows=[row('Please call me','When you can'),row('Por favor llámame','Gracias',{at:Date.parse('2026-11-26T10:00:00Z')}),
    row('I will call you','No request'),row('Call me','Sent',{sent:true}),row('Call me','Junk',{excluded:'junk'}),
    row('Need a quote','Please call me',{sender:'Another client',source:'other-signed-source'})];
  assert.deepEqual(callbackRequests(rows).map(value=>value.subject),['Por favor llámame','Please call me','Need a quote']);
  assert.deepEqual(callbackRequests([]),[]);
});

test('today mail only includes linked starred unread inbound messages',()=>{
  const rows=[row('Review this','Source'),row('Read already','Source',{unread:false}),row('Not starred','Source',{starred:false}),row('Sent','Source',{sent:true})];
  assert.deepEqual(needsTodayMail(rows).map(value=>value.source),['signed-source']);
});
