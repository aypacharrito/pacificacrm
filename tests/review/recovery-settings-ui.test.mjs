import test from 'node:test';import assert from 'node:assert/strict';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';
import LeadWarmingSettings from '../../app/components/LeadWarmingSettings.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
test('recovery and style controls save separately without changing the spending plan',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});const oldFetch=globalThis.fetch;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 globalThis.fetch=async()=>Response.json({usage:{dayCents:0,monthCents:0},sources:[],style:{samples:0,ready:false},recovery:{eligible:7}});
 const root=createRoot(document.getElementById('root'));let saved;
 function Settings(){const [profile,setProfile]=React.useState(defaultWorkspaceProfile);return React.createElement(LeadWarmingSettings,{profile,onChange:p=>{saved=p;setProfile(p)}})}
 try{await act(async()=>root.render(React.createElement(Settings)));
  const checkbox=text=>[...document.querySelectorAll('label')].find(l=>l.textContent.includes(text)).querySelector('input');
  assert.equal(checkbox('Recover overdue').checked,false);assert.equal(checkbox('Learn my').checked,true);
  await act(async()=>checkbox('Recover overdue').click());assert.equal(saved.leadWarming.recoverMissedFollowUps,true);assert.equal(saved.leadWarming.dailyBudgetCents,200);assert.equal(saved.leadWarming.weeklyBudgetCents,1000);assert.equal(saved.leadWarming.monthlyBudgetCents,3000);
  await act(async()=>checkbox('Learn my').click());assert.equal(saved.learnWritingStyle,false);assert.equal(saved.leadWarming.recoverMissedFollowUps,true);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Reset learned style').click());assert.ok(Date.parse(saved.writingStyleSince));assert.match(document.body.textContent,/7 currently qualify/);
 }finally{await act(async()=>root.unmount());dom.window.close();globalThis.fetch=oldFetch}
});
