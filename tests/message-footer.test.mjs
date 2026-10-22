import test from 'node:test';
import assert from 'node:assert/strict';
import {emailWithComplianceFooter,automatedSmsBody} from '../app/lib/message-footer.ts';
test('an email containing the address still receives unsubscribe instructions',()=>{
 const text=emailWithComplianceFooter('Hello from 123 Main St',{businessAddress:'123 Main St',businessName:'Test Agency'});
 assert.match(text,/Reply UNSUBSCRIBE/);assert.equal(text.split('123 Main St').length,2);
});
test('long drafts preserve required email and SMS footers',()=>{
 const text=emailWithComplianceFooter('x'.repeat(12000),{businessAddress:'123 Main St',businessName:'Test Agency'});
 assert.ok(text.length<=10000);assert.match(text,/123 Main St/);assert.match(text,/UNSUBSCRIBE/);
 const sms=automatedSmsBody('x'.repeat(2000),'Test Agency');assert.equal(sms.length,1500);assert.match(sms,/^Test Agency:/);assert.match(sms,/Reply STOP to opt out\. Reply HELP for help\.$/);
});

test('automated SMS footer is idempotent and replaces costly typographic punctuation',()=>{
 const body='Hi Alex, I’m with Pacifica. Reply STOP to opt out. Reply STOP to opt out.';
 const once=automatedSmsBody(body,'Pacifica');
 assert.equal((once.match(/Reply STOP to opt out\./g)||[]).length,1);
 assert.equal((once.match(/Reply HELP for help\./g)||[]).length,1);
 assert.match(once,/I'm with Pacifica/);
 assert.equal(automatedSmsBody(once,'Pacifica'),once);
 const spanish=automatedSmsBody('Hola, ¿quieres una cotización para mañana?','Pacifica');
 assert.match(spanish,/cotización para mañana/);
 assert.match(automatedSmsBody('“Hello”—it’s me…','Pacifica'),/"Hello"-it's me\.\.\./);
});
