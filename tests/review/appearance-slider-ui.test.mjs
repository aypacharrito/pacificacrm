import test from 'node:test';import assert from 'node:assert/strict';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';
import Settings from '../../app/components/WorkspaceAppearanceSettings.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';

test('the size slider changes a saved profile without changing its theme or other settings, and Reset returns compact size',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root'));let saved;
 function Form(){const [profile,setProfile]=React.useState({...defaultWorkspaceProfile,appearance:"dark",displayScale:125,businessName:'Keep me'});return React.createElement(Settings,{profile,onChange:p=>{saved=p;setProfile(p)}})}
 try{
  await act(async()=>root.render(React.createElement(Form)));
  const input=document.querySelector('input[type=range]');assert.equal(input.min,'80');assert.equal(input.max,'125');assert.equal(input.step,'5');assert.equal(document.querySelector(`label[for="${input.id}"]`).textContent,'Text & spacing');
  await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'80');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});
  assert.equal(saved.displayScale,80);assert.equal(saved.appearance,'dark');assert.equal(saved.businessName,'Keep me');assert.equal(document.querySelector('output').textContent,'80%');
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Reset').click());assert.equal(saved.displayScale,90);assert.equal(input.value,'90');
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Light').click());assert.equal(saved.appearance,'light');assert.equal(saved.displayScale,90);
 }finally{await act(async()=>root.unmount());dom.window.close()}
});
