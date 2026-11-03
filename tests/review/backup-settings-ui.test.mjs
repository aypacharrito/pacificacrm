import test from 'node:test';import assert from 'node:assert/strict';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';
import BackupReplySettings from '../../app/components/BackupReplySettings.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
test('the owner can explicitly enable delayed backups and apply the selected spending plan',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root'));let saved;
 function Settings(){const [profile,setProfile]=React.useState({...defaultWorkspaceProfile,leadWarming:{dailyBudgetCents:999,weeklyBudgetCents:9999,monthlyBudgetCents:99999}});return React.createElement(BackupReplySettings,{profile,onChange:p=>{saved=p;setProfile(p)}})}
 try{
  await act(async()=>root.render(React.createElement(Settings)));
  assert.equal(document.querySelector('input[type="checkbox"]').checked,false);
  await act(async()=>document.querySelector('input[type="checkbox"]').click());
  assert.equal(saved.leadWarming.backupRepliesEnabled,true);assert.equal(saved.leadWarming.backupReplyDelayMinutes,60);assert.ok(Date.parse(saved.leadWarming.backupRepliesSince));
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('$2/day')).click());
  for(const [key,value] of Object.entries({dailyBudgetCents:200,weeklyBudgetCents:1000,monthlyBudgetCents:3000,maxSegments:1,maxUnansweredTexts:2,gapHours:72}))assert.equal(saved.leadWarming[key],value);
  assert.equal(saved.leadWarming.backupRepliesEnabled,true);assert.ok(Date.parse(saved.leadWarming.policyUpdatedAt));
 }finally{await act(async()=>root.unmount());dom.window.close()}
});
