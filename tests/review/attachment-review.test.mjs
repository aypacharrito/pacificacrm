import test from 'node:test';import assert from 'node:assert/strict';
import {POST} from '../../app/api/crm/review-attachment/route.ts';
const request=(body,origin='https://crm.test')=>new Request('https://crm.test/api/crm/review-attachment',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
const body={leadId:1,image:'data:image/png;base64,aGVsbG8=',documentKind:'policy',aiConsent:true};
test('file review saves document context without creating field-by-field tasks; retries do not duplicate or rescan',async()=>{
 globalThis.attachmentAllowed=true;globalThis.attachmentCalls=0;globalThis.attachmentWorkspace={leads:[{id:1,name:'Original',notes:'Never overwrite',stage:'Closed',smsConsent:false}]};
 const original=structuredClone(attachmentWorkspace.leads);
 assert.equal((await POST(request(body))).status,200);assert.deepEqual(attachmentWorkspace.leads,original);assert.equal(attachmentWorkspace.documentInsights.length,1);assert.equal(attachmentCalls,1);assert.equal(attachmentWorkspace.noteReminders,undefined);assert.match(attachmentWorkspace.documentInsights[0].text,/Original|Policy|Carrier|Name|name/i);
 const again=await (await POST(request(body))).json();assert.equal(again.alreadyReviewed,true);assert.equal(attachmentCalls,1);assert.equal(attachmentWorkspace.documentInsights.length,1);
});
test('file review checks workspace, origin, source ownership and rejects external URLs',async()=>{
 globalThis.attachmentAllowed=false;assert.equal((await POST(request(body))).status,403);attachmentAllowed=true;
 assert.equal((await POST(request(body,'https://other.test'))).status,403);
 assert.equal((await POST(request({...body,leadId:99}))).status,404);
 assert.equal((await POST(request({leadId:1,messageId:'missing',index:0}))).status,400);
 assert.equal((await POST(request({...body,image:undefined,messageId:'missing',index:0}))).status,404);
 attachmentWorkspace.leads[0].communications=[{id:'m1',attachments:[{url:'https://127.0.0.1/private',type:'image/png'}]}];
 assert.equal((await POST(request({...body,image:undefined,messageId:'m1',index:0}))).status,400);assert.equal(attachmentCalls,1);
 assert.equal((await POST(request({...body,aiConsent:false}))).status,400);assert.equal(attachmentCalls,1);
});
