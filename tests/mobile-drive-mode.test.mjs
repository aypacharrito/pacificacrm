import assert from "node:assert/strict";
import test from "node:test";
import * as driveSessionModule from "../mobile/src/drive-session.ts";
// Expo owns a CommonJS package; Node 22 exposes its TS exports under default.
const {beginDriveCall,createDriveSession,currentDriveLead,finishDriveCall,openDriveCall,pauseDriveSession,resumeDriveSession,saveDriveDisposition,startDriveSession}=driveSessionModule.default||driveSessionModule;
import {createCallStartGate,dialDigits,findDialedContact} from "../app/lib/call-start-gate.ts";

const queue=[
  {id:1,name:"First",phone:"8185550101",product:"Auto",source:"Website",priorityReason:"New"},
  {id:2,name:"Second",phone:"8185550102",product:"Home",source:"Referral",priorityReason:"Interested"},
];

test("drive mode advances through connected calls with saved outcomes",()=>{
  let session=startDriveSession(createDriveSession(queue));
  assert.equal(session.phase,"briefing");
  session=beginDriveCall(session);
  session=finishDriveCall(session,true);
  assert.equal(session.phase,"wrap-up");
  session=saveDriveDisposition(session,"Interested");
  assert.equal(session.phase,"briefing");
  assert.equal(session.completed,1);
  assert.equal(currentDriveLead(session)?.id,2);
});

test("an unanswered call advances without asking for a disposition",()=>{
  let session=beginDriveCall(startDriveSession(createDriveSession(queue)));
  session=finishDriveCall(session,false);
  assert.equal(session.phase,"briefing");
  assert.equal(session.completed,1);
  assert.equal(session.lastDisposition,"No answer");
});

test("the phone handoff must succeed before Drive Mode changes phase",async()=>{
  const briefing=startDriveSession(createDriveSession(queue));
  let resolveOpen;
  const handoff=openDriveCall(briefing,()=>new Promise(resolve=>{resolveOpen=resolve}));
  assert.equal(briefing.phase,"briefing");
  resolveOpen();
  assert.equal((await handoff).phase,"calling");
  await assert.rejects(()=>openDriveCall(briefing,()=>Promise.reject(new Error("No phone app"))),/No phone app/);
  assert.equal(briefing.phase,"briefing");
  assert.equal(currentDriveLead(briefing)?.id,1);
});

test("pause and resume never lose the current lead",()=>{
  const started=startDriveSession(createDriveSession(queue));
  const paused=pauseDriveSession(started);
  assert.equal(paused.phase,"paused");
  const resumed=resumeDriveSession(paused);
  assert.equal(resumed.phase,"briefing");
  assert.equal(currentDriveLead(resumed)?.id,1);
});

test("the session finishes after the final lead",()=>{
  let session=beginDriveCall(startDriveSession(createDriveSession(queue.slice(0,1))));
  session=finishDriveCall(session,true);
  session=saveDriveDisposition(session,"Appointment set");
  assert.equal(session.phase,"finished");
  assert.equal(session.completed,1);
  assert.equal(currentDriveLead(session),null);
});

test("the browser dialer accepts one start while setup is still running",()=>{
  const gate=createCallStartGate();
  assert.equal(gate.tryStart(),true);
  assert.equal(gate.tryStart(),false);
  assert.equal(gate.isStarting(),true);
  gate.finish();
  assert.equal(gate.tryStart(),true);
});

test("manual dialing opens the matching CRM contact across phone formats",()=>{
  const contacts=[{id:1,phone:"+1 (818) 555-0101"},{id:2,phone:"424-555-0199"}];
  assert.equal(dialDigits("1-818-555-0101"),"8185550101");
  assert.equal(findDialedContact(contacts,"8185550101")?.id,1);
  assert.equal(findDialedContact(contacts,"555")?.id,undefined);
});
