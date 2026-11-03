import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import WorkspaceProfileSettings from '../../app/components/WorkspaceProfileSettings.tsx';
import WorkspaceTour from '../../app/components/WorkspaceTour.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';

test('each default scene clears only its own saved custom background',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root')),changes=[];
 const profile={...defaultWorkspaceProfile,dialerLightBackdropUrl:'https://example.test/light.gif',dialerDarkBackdropUrl:'https://example.test/dark.gif'};
 try{
  await act(async()=>root.render(React.createElement(WorkspaceProfileSettings,{profile,onChange:value=>changes.push(value)})));
  const defaults=[...document.querySelectorAll('.dialer-scene-previews button')];
  await act(async()=>defaults[0].click());assert.equal(changes.at(-1).dialerLightBackdropUrl,'');assert.equal(changes.at(-1).dialerDarkBackdropUrl,profile.dialerDarkBackdropUrl);
  await act(async()=>defaults[1].click());assert.equal(changes.at(-1).dialerDarkBackdropUrl,'');assert.equal(changes.at(-1).dialerLightBackdropUrl,profile.dialerLightBackdropUrl);
  assert.equal(document.querySelectorAll('.dialer-native-preview canvas').length,0);
  assert.equal(document.querySelectorAll('.dialer-scene-plain[role="img"]').length,1);
  assert.equal(document.querySelectorAll('.dialer-scene-previews img').length,0);
 }finally{await act(async()=>root.unmount());dom.window.close()}
});

test('the agent walkthrough never opens owner-only appearance settings',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,MutationObserver:dom.window.MutationObserver,IS_REACT_ACT_ENVIRONMENT:true});
 const root=createRoot(document.getElementById('root')),views=[];
 try{
  await act(async()=>root.render(React.createElement(WorkspaceTour,{workspaceId:'agent-tour',canManageAppearance:false,onNavigate:view=>views.push(view)})));
  const steps=[...document.querySelectorAll('.workspace-tour nav button')];assert.equal(steps.length,10);
  await act(async()=>steps.at(-1).click());assert.equal(views.at(-1),'clients');assert.equal(views.includes('settings'),false);
 }finally{await act(async()=>root.unmount());dom.window.close()}
});
