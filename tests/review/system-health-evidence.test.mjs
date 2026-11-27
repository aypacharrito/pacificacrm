import {test} from "node:test";
import assert from "node:assert/strict";
import {workspaceCapabilityEvidence} from "../../app/lib/system-health-evidence.ts";

test("configuration and queued or failed messages are not successful evidence",()=>{
  const evidence=workspaceCapabilityEvidence({leads:[{communications:[
    {channel:"sms",direction:"outbound",provider:"twilio",status:"queued",sentAt:"2026-01-01T00:00:00Z"},
    {channel:"sms",direction:"outbound",provider:"twilio",status:"failed",sentAt:"2026-01-02T00:00:00Z"},
    {channel:"email",direction:"outbound",provider:"pacifica",status:"task",sentAt:"2026-01-03T00:00:00Z"},
  ]}],callLogs:[{callSid:"CA000",detectionStatus:"ringing",startedAt:"2026-01-01T00:00:00Z"}]});
  assert.deepEqual(evidence,{sms:null,email:null,emailReplies:null,voice:null,recording:null});
});

test("only matching workspace outcomes count for their own capability",()=>{
  const evidence=workspaceCapabilityEvidence({leads:[{communications:[
    {channel:"sms",direction:"outbound",provider:"twilio",providerId:"test-message",status:"delivered",sentAt:"2026-01-02T00:00:00Z"},
    {channel:"sms",direction:"inbound",provider:"twilio",status:"delivered",sentAt:"2026-01-03T00:00:00Z"},
    {channel:"email",direction:"outbound",provider:"resend",providerId:"test-email",status:"sent",sentAt:"2026-01-04T00:00:00Z"},
  ]}],callLogs:[
    {callSid:"CA001",detectionStatus:"completed",detectionUpdatedAt:"2026-01-05T00:00:00Z",startedAt:"2026-01-01T00:00:00Z"},
    {callSid:"CA001",recordingSid:"RE001",recordingStatus:"completed",startedAt:"2026-01-06T00:00:00Z"},
  ]});
  assert.equal(evidence.sms?.at,"2026-01-02T00:00:00.000Z");
  assert.equal(evidence.email?.at,"2026-01-04T00:00:00.000Z");
  assert.equal(evidence.voice?.at,"2026-01-05T00:00:00.000Z");
  assert.equal(evidence.recording?.at,"2026-01-06T00:00:00.000Z");
  assert.deepEqual(workspaceCapabilityEvidence(null),{sms:null,email:null,emailReplies:null,voice:null,recording:null});
  const changedProvider=workspaceCapabilityEvidence({leads:[{communications:[
    {channel:"sms",direction:"outbound",provider:"twilio",providerId:"test-text",from:"+15550000001",status:"delivered",sentAt:"2026-01-01T00:00:00Z"},
    {channel:"email",direction:"outbound",provider:"resend",providerId:"test-email",status:"sent",sentAt:"2026-01-01T00:00:00Z"},
  ]}],callLogs:[]},{smsFrom:"+15550000002",emailProvider:"webhook"});
  assert.equal(changedProvider.sms,null);
  assert.equal(changedProvider.email,null);
});

test("a received agency email must match the configured workspace reply address",()=>{
  const received={channel:"email",direction:"inbound",provider:"resend",status:"received",to:"dealer-a@example.test",providerId:"receipt",sentAt:"2026-01-01T00:00:00Z"};
  const fixture={leads:[{communications:[received]}],callLogs:[]};
  assert.equal(workspaceCapabilityEvidence(fixture,{replyAddress:"dealer-a@example.test"}).emailReplies?.at,"2026-01-01T00:00:00.000Z");
  assert.equal(workspaceCapabilityEvidence(fixture,{replyAddress:"dealer-b@example.test"}).emailReplies,null);
});
test('health records each workspace and trigger separately and checks scheduler freshness', async t => {
  const {readHealthRuns, recordHealthRun} = await import('../../app/lib/workspace-health-runs.ts');
  const priorUrl = process.env.KV_REST_API_URL, priorToken = process.env.KV_REST_API_TOKEN;
  process.env.KV_REST_API_URL = 'https://health.test'; process.env.KV_REST_API_TOKEN = 'synthetic';
  t.after(() => {
    if (priorUrl === undefined) delete process.env.KV_REST_API_URL; else process.env.KV_REST_API_URL = priorUrl;
    if (priorToken === undefined) delete process.env.KV_REST_API_TOKEN; else process.env.KV_REST_API_TOKEN = priorToken;
  });
  const values = new Map();
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, 'https://health.test');
    const [op, ...args] = JSON.parse(init.body);
    if (op === 'SET') { values.set(args[0], args[1]); return Response.json({result: 'OK'}); }
    assert.equal(op, 'MGET'); return Response.json({result: args.map(k => values.get(k) ?? null)});
  });
  await recordHealthRun('dealer-a', 'manual');
  const manual = await readHealthRuns('dealer-a');
  assert.ok(manual.manual); assert.equal(manual.scheduledRecent, false);
  await recordHealthRun('dealer-a', 'scheduled'); await recordHealthRun('dealer-b', 'ai');
  assert.equal((await readHealthRuns('dealer-a')).scheduledRecent, true);
  assert.equal((await readHealthRuns('dealer-a', Date.now() + 15 * 60000)).scheduledRecent, false);
  assert.equal((await readHealthRuns('dealer-a')).ai, null);
  const other = await readHealthRuns('dealer-b'); assert.ok(other.ai); assert.equal(other.manual, null);
});
