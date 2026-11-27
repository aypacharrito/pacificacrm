import test from 'node:test';
import assert from 'node:assert/strict';
import {claimReviewedSend,finishReviewedSend} from '../../app/lib/reviewed-send-claim.ts';

const base={workspaceId:'dealer-a',reviewId:'review-00000001',leadId:7,channel:'sms',recipient:'+18185550101',body:'Reviewed follow up'};
test('one dispatch claim survives concurrent requests and another employee retry',async()=>{
  const [first,second]=await Promise.all([claimReviewedSend(base),claimReviewedSend(base)]);
  assert.equal([first,second].filter(receipt=>receipt.claimed).length,1);
  assert.equal([first,second].find(receipt=>!receipt.claimed).receipt.state,'submitting');
  await finishReviewedSend(first.key,{state:'accepted',at:'2026-11-27T12:00:00.000Z',payloadHash:first.receipt.payloadHash,providerId:'synthetic-provider-id'},first.holdKey);
  const reopened=await claimReviewedSend(base);
  assert.equal(reopened.claimed,false);
  assert.equal(reopened.receipt.state,'accepted');
  assert.equal(reopened.receipt.providerId,'synthetic-provider-id');
});
test('uncertain submission remains blocked, including after a simulated timeout',async()=>{
  const input={...base,leadId:8,channel:'email',recipient:'lead@example.test',subject:'Follow up'};
  const first=await claimReviewedSend(input);
  await finishReviewedSend(first.key,{state:'uncertain',at:'2026-11-27T12:00:00.000Z',payloadHash:first.receipt.payloadHash,reason:'Provider response lost'},first.holdKey);
  const retry=await claimReviewedSend(input);
  assert.equal(retry.claimed,false);
  assert.equal(retry.receipt.state,'uncertain');
  await assert.rejects(()=>claimReviewedSend({...input,reviewId:'review-00000002'}),/pending reconciliation/);
});
test('tenant and contact isolate claims; editing the same review fails, but a new review can repeat content',async()=>{
  assert.equal((await claimReviewedSend({...base,workspaceId:'dealer-b'})).claimed,true);
  assert.equal((await claimReviewedSend({...base,leadId:9})).claimed,true);
  await assert.rejects(()=>claimReviewedSend({...base,body:'Edited follow up'}),/changed/);
  await assert.rejects(()=>claimReviewedSend({...base,channel:'email',recipient:'lead@example.test'}),/changed/);
  assert.equal((await claimReviewedSend({...base,reviewId:'review-00000002'})).claimed,true);
});
