import test from 'node:test';import assert from 'node:assert/strict';import {POST} from '../../app/api/ai/proofread/route.ts';
const request=text=>new Request('https://example.test/api/ai/proofread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,language:'en'})});
test('grammar correction requires access and rejects altered exact details',async()=>{
 globalThis.proofAccess=false;assert.equal((await POST(request('teh quote is $200'))).status,403);
 globalThis.proofAccess=true;globalThis.proofText='The quote is $201';assert.equal((await POST(request('teh quote is $200'))).status,422);
 globalThis.proofText='Call on November 22';assert.equal((await POST(request('Call on October 22'))).status,422);
 globalThis.proofText='The quote is $200';const response=await POST(request('teh quote is $200'));assert.equal(response.status,200);assert.equal((await response.json()).text,'The quote is $200');assert.equal((await POST(request('x'.repeat(5001)))).status,400);
});
