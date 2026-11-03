import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {cloudAutomationHealth,cloudCheckIntervalMinutes} from '../app/lib/cloud-schedule.ts';
const now=Date.parse('2026-10-27T22:00:00Z');
const beat=(start=-4,previous=-9,extra={})=>({startedAt:new Date(now+start*60000).toISOString(),previousStartedAt:new Date(now+previous*60000).toISOString(),completedAt:new Date(now+start*60000+20000).toISOString(),ok:true,...extra});
test('five-minute cron remains healthy between checks and the declared interval matches hosting',()=>{
 assert.equal(cloudAutomationHealth(beat(),now).healthy,true);assert.equal(cloudAutomationHealth(beat(-7,-12),now).healthy,true);
 const config=JSON.parse(fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
 assert.equal(config.crons.find(c=>c.path==='/api/cron/follow-ups').schedule,`*/${cloudCheckIntervalMinutes} * * * *`);
});
test('failed, incomplete, stale, future and malformed heartbeats do not claim active automation',()=>{
 for(const value of [null,{},beat(-12,-17),beat(1,-4),beat(-4,-9,{ok:false}),beat(-4,-9,{completedAt:null}),beat(-4,-9,{alreadyRunning:true}),beat(-4,-30),beat(-4,-9,{previousStartedAt:'invalid'})])assert.equal(cloudAutomationHealth(value,now).healthy,false);
 assert.equal(cloudAutomationHealth(beat(-4,-9,{previousStartedAt:''}),now).healthy,true);
});
