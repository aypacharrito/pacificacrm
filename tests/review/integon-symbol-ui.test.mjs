import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){if(specifier.endsWith('/lib/integon-symbol-reference'))return {url:'data:text/javascript,export const lookupSelectedSymbolSheet=(...args)=>globalThis.symbolLookupStub(...args)',shortCircuit:true};return next(specifier,context)}});
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';

const {default:IntegonSymbolReference}=await import('../../app/components/IntegonSymbolReference.tsx');
const {default:OpportunityDesk}=await import('../../app/components/OpportunityDesk.tsx');
function setup(){const dom=new JSDOM('<div id="root"></div>',{url:'https://crm.test/dashboard',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById('root'));return {dom,root,close:async()=>{await act(async()=>root.unmount());dom.window.close()}}}
async function change(input,value){await act(async()=>{const setter=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})}
const button=label=>[...document.querySelectorAll('button')].find(item=>item.textContent===label);

test('local selection masks VIN and cancels stale lookup without revealing its result',async()=>{
 const h=setup(),calls=[],originalFetch=globalThis.fetch;let finish;globalThis.fetch=()=>{throw Error('Local symbol reference must not use fetch')};globalThis.symbolLookupStub=(file,key,year,options)=>{calls.push({file,key,year,options});return new Promise(resolve=>{finish=resolve})};
 try{await act(async()=>h.root.render(React.createElement(IntegonSymbolReference)));
  const input=document.querySelector('input[type=file]'),file=new window.File(['%PDF-1.7 fixture'], 'ss5-fixture.pdf',{type:'application/pdf'});
  await act(async()=>{Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new Event('change',{bubbles:true}))});
  const mask=document.querySelector('input[maxlength="10"]'),year=document.querySelector('input[inputmode="numeric"]');
  await change(mask,'ABC1234567');await change(year,'2025');assert.equal(button('Find filed reference locally').disabled,true);
  await change(mask,'3FT&X21L*Y');assert.equal(button('Find filed reference locally').disabled,false);
  await act(async()=>button('Find filed reference locally').click());assert.equal(calls.length,1);assert.equal(calls[0].file,file);assert.equal(calls[0].key,'3FT&X21L*Y');assert.equal(calls[0].year,2025);assert.equal(calls[0].options.signal.aborted,false);
  await change(mask,'XYZ*234567');assert.equal(calls[0].options.signal.aborted,true);
  await act(async()=>finish({state:'matched',sourceFile:'ss5-fixture.pdf',page:12,make:'Old',model:'Stale',symbolSet5:'99',filing:'GMMX-134286985',stateTracking:'24-2128'}));
  assert.doesNotMatch(document.body.textContent,/Old Stale|SymbolSet5: 99/);
  await act(async()=>button('Find filed reference locally').click());await act(async()=>button('Cancel lookup').click());assert.equal(calls[1].options.signal.aborted,true);
  await act(async()=>finish({state:'matched',sourceFile:'ss5-fixture.pdf',page:12,make:'Old',model:'Stale',symbolSet5:'99',filing:'GMMX-134286985',stateTracking:'24-2128'}));assert.doesNotMatch(document.body.textContent,/Old Stale/);
 }finally{await h.close();delete globalThis.symbolLookupStub;globalThis.fetch=originalFetch}
});
test('agency evidence gate hides the local reference from other members',async()=>{
 const h=setup();let owner=false;globalThis.fetch=async url=>Response.json(String(url).includes('vehicle-partner')?{partnerships:[],workspaceId:'fixture'}:{submissions:[],links:[],canRecordEvidence:owner});
 try{await act(async()=>{h.root.render(React.createElement(OpportunityDesk,{leads:[],onOpen(){},onRefresh:async()=>{}}));await new Promise(resolve=>setTimeout(resolve,10))});assert.equal(document.querySelector('[aria-label="Integon filed vehicle symbol reference"]'),null);
  owner=true;await act(async()=>{h.root.unmount()});const root=createRoot(document.getElementById('root'));await act(async()=>{root.render(React.createElement(OpportunityDesk,{leads:[],onOpen(){},onRefresh:async()=>{}}));await new Promise(resolve=>setTimeout(resolve,10))});assert.ok(document.querySelector('[aria-label="Integon filed vehicle symbol reference"]'));await act(async()=>root.unmount());
 }finally{h.dom.window.close();delete globalThis.fetch}
});
