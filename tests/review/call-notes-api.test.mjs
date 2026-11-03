import test from 'node:test';import assert from 'node:assert/strict';
import {POST} from '../../app/api/crm/call-notes/route.ts';
const request=(body,origin='https://example.test')=>new Request('https://example.test/api/crm/call-notes',{method:'POST',headers:{Origin:origin},body:JSON.stringify(body)});
test('call note saves append-only in the signed-in workspace and failed or repeated requests cannot overwrite another contact',async()=>{
 globalThis.callNoteWorkspace={leads:[{id:1,notes:'Previous note'},{id:2,notes:'Other'}]};const body={leadId:1,key:'mobile:test-123',notes:'Appointment October 30 at 2 PM',outcome:'Appointment set',workspaceId:'attacker',stage:'Closed'};
 globalThis.callNoteAllowed=false;assert.equal((await POST(request(body))).status,403);globalThis.callNoteAllowed=true;
 assert.equal((await POST(request(body,'https://elsewhere.test'))).status,403);
 assert.equal((await POST(request({...body,leadId:99}))).status,400);
 assert.equal((await POST(request(body))).status,200);const saved=structuredClone(globalThis.callNoteWorkspace);assert.match(saved.leads[0].notes,/Previous note/);assert.equal(saved.leads[0].stage,undefined);assert.equal(saved.leads[1].notes,'Other');
 assert.equal((await POST(request(body))).status,200);assert.deepEqual(globalThis.callNoteWorkspace,saved);
});
