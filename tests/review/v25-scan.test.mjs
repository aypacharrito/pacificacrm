import test from 'node:test';import assert from 'node:assert/strict';
import {POST} from '../../app/api/ai/document-lead/route.ts';
test('license images remain local-only even when payload claims user and pilot approval',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-only';process.env.OPENAI_VISION_MODEL='openai/gpt-5.4';globalThis.scanCalls=[];
 process.env.PACIFICA_ID_AI_PILOT_ENABLED='true';
 const image='data:image/jpeg;base64,YWJj';const upload=body=>POST(new Request('http://localhost/api/ai/document-lead',{method:'POST',body:JSON.stringify(body)}));
 assert.equal((await upload({images:[image,image]})).status,400);
 assert.equal((await upload({images:[image,image],documentKind:'license',aiConsent:true,idAiConsent:true,pilotIdProcessingEnabled:true})).status,403);
 assert.equal(globalThis.scanCalls.length,0);delete process.env.PACIFICA_ID_AI_PILOT_ENABLED;delete process.env.AI_GATEWAY_API_KEY;delete process.env.OPENAI_VISION_MODEL;
});
test('non-ID policy scans keep the existing two-image enrichment path',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-only';process.env.OPENAI_VISION_MODEL='openai/gpt-5.4';globalThis.scanCalls=[];
 const policy={documentType:'Policy declaration',fullName:'Example Person',address:'10 Sample St',city:'Example',state:'CA',zip:'90000',policyNumber:'POLICY123',carrier:'Example Insurance',policyExpirationDate:'2030-01-01',vin:'1HGCM82633A004352'};globalThis.scanReads=[policy];
 const image='data:image/jpeg;base64,YWJj';const response=await POST(new Request('http://localhost/api/ai/document-lead',{method:'POST',body:JSON.stringify({images:[image,image],documentKind:'policy',aiConsent:true})}));const data=await response.json();
 assert.equal(response.status,200);assert.equal(data.extraction.policyNumber,'POLICY123');assert.equal(globalThis.scanCalls.length,1);assert.equal(globalThis.scanOptions.baseURL,'https://ai-gateway.vercel.sh/v1');assert.equal(globalThis.scanCalls[0].store,false);assert.equal(globalThis.scanCalls[0].input[0].content.filter(part=>part.type==='input_image'&&part.detail==='high').length,2);delete process.env.AI_GATEWAY_API_KEY;delete process.env.OPENAI_VISION_MODEL;
});
