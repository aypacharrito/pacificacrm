import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import MobileNavigation from '../../app/components/MobileNavigation.tsx';

async function setup(){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)});
 dom.window.HTMLElement.prototype.getClientRects=()=>[{width:44,height:44}];
 let resize;const query={matches:false,addEventListener:(_event,fn)=>{resize=fn},removeEventListener(){resize=undefined}};dom.window.matchMedia=()=>query;
 const items=['today','dialer','messages','leads','office','settings'].map(id=>({id,label:id,icon:React.createElement('span',null,'•')}));
 function Harness(){const [active,setActive]=useState('today');return React.createElement(React.Fragment,null,React.createElement(MobileNavigation,{items,active,onNavigate:setActive,unread:3,syncStatus:'Saved'}),React.createElement('output',null,active))}
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(Harness)));
 return {dom,query,resize:()=>resize?.(),close:async()=>{await act(async()=>root.unmount());dom.window.close()}};
}
const click=async element=>{assert.ok(element);await act(async()=>element.click())};
test('phone tabs change the actual active page and expose unread messages',async()=>{
 const h=await setup();try{
  await click(document.querySelector('.mobile-navigation [aria-label="messages, 3 unread"]'));
  assert.equal(document.querySelector('output').textContent,'messages');
  assert.equal(document.querySelector('.mobile-navigation [aria-current="page"]').getAttribute('aria-label'),'messages, 3 unread');
  assert.equal(document.querySelector('.mobile-brand small').textContent,'messages');
 }finally{await h.close()}
});
test('More traps focus, Escape restores it, and selecting Calendar closes the menu',async()=>{
 const h=await setup();try{
  const more=document.querySelector('[aria-label="More navigation"]');more.focus();await click(more);
  assert.ok(document.querySelector('[role="dialog"]').contains(document.activeElement));
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.activeElement,more);
  await click(more);await click([...document.querySelectorAll('.mobile-menu nav button')].find(b=>b.textContent.includes('office')));
  assert.equal(document.querySelector('output').textContent,'office');assert.equal(document.querySelector('[role="dialog"]'),null);
  assert.equal(more.getAttribute('aria-current'),'page');
 }finally{await h.close()}
});
test('rotating to desktop closes the phone sheet and releases the focus trap',async()=>{
 const h=await setup();try{
  await click(document.querySelector('[aria-label="More navigation"]'));h.query.matches=true;
  await act(async()=>h.resize());assert.equal(document.querySelector('[role="dialog"]'),null);assert.equal(document.body.style.overflow,'');
 }finally{await h.close()}
});

test('Android layout-and-visual keyboard resize hides phone chrome, restores it on close and leaves pinch zoom alone',async()=>{
 const dom=new JSDOM('<div id="root"></div><textarea></textarea>',{url:'https://example.test',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)});
 Object.defineProperty(window,'innerWidth',{value:390,writable:true});Object.defineProperty(window,'innerHeight',{value:844,writable:true});
 const viewport=Object.assign(new window.EventTarget(),{height:844,scale:1});Object.defineProperty(window,'visualViewport',{value:viewport});
 window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 const root=createRoot(document.getElementById('root'));
 const resize=()=>act(async()=>{viewport.dispatchEvent(new window.Event('resize'));await new Promise(resolve=>setTimeout(resolve,30))});
 try{
  await act(async()=>root.render(React.createElement(MobileNavigation,{items:[],active:'messages',onNavigate(){},syncStatus:'Saved'})));
  document.querySelector('textarea').focus();window.innerHeight=460;viewport.height=460;await resize();
  assert.equal(document.documentElement.dataset.phoneKeyboard,'true');assert.equal(document.documentElement.style.getPropertyValue('--crm-phone-height'),'460px');
  window.innerHeight=844;viewport.height=844;await resize();assert.equal(document.documentElement.dataset.phoneKeyboard,'false');
  viewport.scale=1.5;viewport.height=300;await resize();assert.equal(document.documentElement.style.getPropertyValue('--crm-phone-height'),'844px');
 }finally{await act(async()=>root.unmount());assert.equal(document.documentElement.dataset.phoneKeyboard,undefined);dom.window.close()}
});
