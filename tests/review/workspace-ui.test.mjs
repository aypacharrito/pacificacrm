import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {JSDOM}=createRequire(process.env.PACIFICA_UI_TEST_PACKAGE || new URL("../../package.json",import.meta.url))('jsdom');
import React,{act} from 'react';
import CRM from '../../app/CRMClient.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
import {appearanceBootstrap,appearanceCacheKey} from '../../app/lib/workspace-appearance.ts';
async function setup(fail,mode=defaultWorkspaceProfile.mode,preferences={}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',pretendToBeVisual:true,runScripts:'outside-only'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,localStorage:dom.window.localStorage,Element:dom.window.Element,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
 globalThis.MutationObserver=dom.window.MutationObserver;
 dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
 dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
 if(preferences.appearance)localStorage.setItem(appearanceCacheKey,JSON.stringify({appearance:preferences.appearance,displaySize:'large'}));
 if(preferences.collapsed)localStorage.setItem('pacifica:sidebar-collapsed','true');
 if(preferences.local){localStorage.setItem('pacifica:test-workspace:profile',JSON.stringify({...defaultWorkspaceProfile,onboardingCompleted:true}));localStorage.setItem('pacifica:test-workspace:tour-v1','done')}
 dom.window.eval(appearanceBootstrap);
 dom.window.HTMLElement.prototype.getClientRects=function(){return [{width:30,height:30}]};
 const requests=[];
 globalThis.fetch=async(url,options)=>{
  requests.push({url,options});
  if(url==='/api/crm/workspace'){
   if(typeof fail==='function'&&options?.method!=='PUT')return fail();
   if(fail&&options?.method!=='PUT')return new Response('{}',{status:503});
   return new Response(JSON.stringify({found:true,leads:[],callLogs:[],profile:{...defaultWorkspaceProfile,mode,serverAutomationEnabled:false}}));
  }
  return new Response(JSON.stringify({configured:false,phone:'',leads:[]}));
 };
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));
 await act(async()=>root.render(React.createElement(CRM,{clerkEnabled:!preferences.local,isOwner:true,workspaceId:'test-workspace',featureAccess:preferences.features})));
 await act(async()=>new Promise(resolve=>setTimeout(resolve,750)));
 return {dom,root,requests,cleanup:async()=>{await act(async()=>root.unmount());dom.window.close()}};
}
test('a failed initial cloud read never starts an empty workspace save',async()=>{
 const h=await setup(true);
 assert.match(document.querySelector('.workspace-load-card').textContent,/couldn’t load/);
 assert.equal(h.requests.filter(r=>r.options?.method==='PUT').length,0);
 assert.ok(document.querySelector('.workspace-load-card button'));
 await h.cleanup();
});
test('a successful cloud load unlocks the workspace and permits autosave',async()=>{
 const h=await setup(false);
 assert.equal(document.querySelector('.workspace-load-card'),null);
 assert.equal(h.requests.filter(r=>r.options?.method==='PUT').length,1);
 assert.equal(localStorage.getItem('pacifica:test-workspace:leads'),null,'cloud workspace must not synchronously serialize duplicate contacts into browser storage');
 await h.cleanup();
});
test('Retry recovers a failed cloud load in place without an empty save',async()=>{
 let available=false;
 const h=await setup(()=>available?Response.json({found:true,leads:[],callLogs:[],profile:defaultWorkspaceProfile}):Response.json({code:'STORAGE_UNAVAILABLE',requestId:'request-123'},{status:503}));
 try{
  assert.match(document.querySelector('.workspace-load-card').textContent,/STORAGE_UNAVAILABLE.*HTTP 503.*request-123/);
  assert.equal(h.requests.filter(r=>r.options?.method==='PUT').length,0);
  available=true;await act(async()=>document.querySelector('.workspace-load-card button').click());
  await act(async()=>new Promise(resolve=>setTimeout(resolve,650)));
  assert.equal(document.querySelector('.workspace-load-card'),null);
  assert.equal(h.requests.filter(r=>r.options?.method==='PUT').length,1);
 }finally{await h.cleanup()}
});
test('a transient startup failure retries automatically, then stops retrying after success',async()=>{
 let reads=0;
 const h=await setup(()=>++reads===1?new Response('{}',{status:503}):Response.json({found:true,leads:[],callLogs:[],profile:defaultWorkspaceProfile}));
 try{
  assert.equal(reads,1);
  await act(async()=>new Promise(resolve=>setTimeout(resolve,1500)));
  assert.equal(document.querySelector('.workspace-load-card'),null);assert.equal(reads,2);
  await act(async()=>window.dispatchEvent(new window.Event('online')));
  assert.equal(reads,2,'reconnecting must not replace an already loaded workspace');
 }finally{await h.cleanup()}
});
test('expired sign-in shows the sign-in action and never starts autosave',async()=>{
 const h=await setup(()=>new Response('{}',{status:401}));
 try{assert.equal(document.querySelector('.workspace-load-action').getAttribute('href'),'/login');assert.equal(document.querySelector('.workspace-load-card button'),null);assert.equal(h.requests.some(r=>r.options?.method==='PUT'),false)}finally{await h.cleanup()}
});
test('imported numeric fields load successfully and preserve contact details',async()=>{
 const contact={id:1,name:'Numeric import',phone:8185550100,source:123,vendorId:123,email:'',importedFields:{Drivers:2},notes:'Keep my note'};
 const h=await setup(()=>Response.json({found:true,leads:[contact,{...contact,id:2}],callLogs:[],profile:{...defaultWorkspaceProfile,serverAutomationEnabled:false}}));
 try{
  assert.equal(document.querySelector('.workspace-load-card'),null);
  const saves=h.requests.filter(r=>r.options?.method==='PUT');assert.equal(saves.length,1);
  const saved=JSON.parse(saves[0].options.body).leads[0];assert.equal(saved.phone,'8185550100');assert.equal(saved.notes,'Keep my note');assert.equal(saved.importedFields.Drivers,'2');
 }finally{await h.cleanup()}
});
test('dialer contact, keypad and queue are independently editable siblings',async()=>{
 const h=await setup(false);
 const nav=[...document.querySelectorAll('.sidebar nav button')].find(b=>b.getAttribute('aria-label')==='Dialer');
 await act(async()=>nav.click());
 await act(async()=>document.querySelector('[aria-controls="dialer-keypad"]').click());
 const primary=document.querySelector('[data-dialer-widget=contact]');const keypad=document.getElementById('dialer-keypad').closest('[data-dialer-widget]');
 assert.ok(primary.querySelector('.hero-call'));assert.ok(document.querySelector('[data-dialer-widget=queue] .queue-card'));assert.equal(keypad.parentElement,primary.parentElement);assert.equal(primary.contains(keypad),false);
 assert.equal(document.activeElement.id,'manual-dial-number');
 await h.cleanup();
});
test('video navigation merges quote preparation into Industry Tools and billing into Settings',async()=>{
 const h=await setup(false,'insurance',{features:{miner:false,industryTools:true}});
 try{
  const nav=label=>document.querySelector(`.sidebar nav button[aria-label="${label}"]`);
  assert.equal(nav('Quote desk'),null);assert.equal(nav('Plans & Billing'),null);
  assert.equal(nav('Miner'),null);assert.ok(nav('Pacifica AI').querySelector('svg'));
  await act(async()=>nav('Industry Tools').click());assert.match(document.body.textContent,/Quote preparation/);assert.match(document.body.textContent,/Scan license or policy/);assert.doesNotMatch(document.querySelector('.industry-tools').textContent,/COMING SOON/);
  await act(async()=>nav('Contacts').click());assert.ok([...document.querySelectorAll('button')].find(b=>/Export CSV/.test(b.textContent)));
  const settings=[...document.querySelectorAll('.sidebar button')].find(b=>b.getAttribute('aria-label')==='Owner settings');await act(async()=>settings.click());
  const billing=[...document.querySelectorAll('.settings-nav button')].find(b=>/Plans & Billing/.test(b.textContent));assert.ok(billing);await act(async()=>billing.click());assert.ok(document.querySelector('.settings-content .pricing-grid'));
 }finally{await h.cleanup()}
});

test('optional discovery and industry tools are hidden unless enabled in developer settings',async()=>{
 const h=await setup(false,'insurance');try{for(const name of ['Miner','Industry Tools'])assert.equal(document.querySelector(`.sidebar nav button[aria-label="${name}"]`),null);assert.ok(document.querySelector('.sidebar nav button[aria-label="Contacts"]'))}finally{await h.cleanup()}
});
test('PDF drops in a message conversation never activate the global lead scanner',async()=>{
 const h=await setup(false);globalThis.Element=h.dom.window.Element;
 try{const thread=document.createElement('section');thread.className='message-thread';thread.innerHTML='<footer><textarea></textarea></footer>';document.querySelector('.app-shell').appendChild(thread);
 for(const type of ['dragenter','drop']){const event=new window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{types:['Files'],files:[new window.File(['%PDF-1.4'],'quote.pdf',{type:'application/pdf'})]}});await act(async()=>thread.querySelector('textarea').dispatchEvent(event))}
 assert.equal(document.querySelector('.file-drop-overlay'),null);assert.equal(document.querySelector('.new-lead-modal'),null);assert.equal(h.requests.some(r=>String(r.url).includes('scan')),false);
 }finally{await h.cleanup()}
});

test('a failed cloud read retains the cached light theme instead of flashing the default',async()=>{
 const h=await setup(true,'sales',{appearance:'light'});
 try{assert.equal(document.documentElement.dataset.theme,'light');assert.equal(JSON.parse(localStorage.getItem(appearanceCacheKey)).appearance,'light')}finally{await h.cleanup()}
});
test('the collapsed sidebar removes language controls and restores them on expansion',async()=>{
 const h=await setup(false,'sales',{collapsed:true});
 try{
  assert.equal(document.querySelector('.language-select'),null);assert.ok(document.querySelector('.app-shell.sidebar-collapsed'));
  await act(async()=>document.querySelector('[aria-label="Expand sidebar"]').click());
  assert.ok(document.querySelector('.language-select select'));assert.equal(document.documentElement.dataset.sidebarCollapsed,'false');assert.equal(localStorage.getItem('pacifica:sidebar-collapsed'),'false');
  await act(async()=>document.querySelector('[aria-label="Collapse sidebar"]').click());assert.equal(document.querySelector('.language-select'),null);
 }finally{await h.cleanup()}
});
test('5,000 contacts use bounded pages, search all records, and export every matching record',async()=>{
 const contacts=Array.from({length:5000},(_,i)=>({id:i+1,name:i===4999?'Offscreen target':`Contact ${String(i+1).padStart(4,'0')}`,phone:String(8185500000+i),email:'',line:'home-auto',importedAt:new Date(Date.UTC(2026,8,1)-i*1000).toISOString(),source:'Import',notes:'',stage:'New lead'}));
 const h=await setup(()=>Response.json({found:true,leads:contacts,callLogs:[],profile:{...defaultWorkspaceProfile,onboardingCompleted:true}}));
 const nav=label=>document.querySelector(`.sidebar nav button[aria-label="${label}"]`);
 const beforeCreate=URL.createObjectURL,beforeRevoke=URL.revokeObjectURL;let csv;
 URL.createObjectURL=blob=>{csv=blob;return 'blob:test-export'};URL.revokeObjectURL=()=>{};
 h.dom.window.HTMLAnchorElement.prototype.click=()=>{};
 try{
  assert.equal(document.querySelectorAll('.crm-table .table-row').length,0);
  await act(async()=>nav('Contacts').click());assert.equal(document.querySelectorAll('.crm-table .table-row').length,100);assert.doesNotMatch(document.querySelector('.crm-table').textContent,/Offscreen target/);
  const exportButton=[...document.querySelectorAll('.module-bar button')].find(b=>/Export CSV/.test(b.textContent));assert.match(exportButton.textContent,/5000/);
  await act(async()=>exportButton.click());assert.equal((await csv.text()).trim().split('\n').length,5001);
  await act(async()=>document.querySelector('[aria-label="Next contacts"]').click());assert.equal(document.querySelectorAll('.crm-table .table-row').length,100);assert.match(document.querySelector('.contact-pagination').textContent,/101–200 of 5000/);
  const search=document.querySelector('[aria-label="Search contacts"]');
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(search,'Offscreen target');search.dispatchEvent(new window.Event('input',{bubbles:true}))});
  assert.equal(document.querySelectorAll('.crm-table .table-row').length,1);assert.match(document.querySelector('.crm-table').textContent,/Offscreen target/);assert.equal(document.querySelector('.contact-pagination'),null);
  await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(search,'');search.dispatchEvent(new window.Event('input',{bubbles:true}))});assert.match(document.querySelector('.contact-pagination').textContent,/1–100 of 5000/);
  await act(async()=>nav('Messages').click());assert.equal(document.querySelector('.crm-table'),null);
  assert.equal(h.requests.some(r=>String(r.url).includes('/api/ai/')&&r.options?.method==='POST'),false);
 }finally{URL.createObjectURL=beforeCreate;URL.revokeObjectURL=beforeRevoke;await h.cleanup()}
});

test('local appearance changes paint immediately and pending saves flush on page hide and unmount',async()=>{
 const h=await setup(false,'sales',{local:true});let closed=false;
 try{
  await act(async()=>document.querySelector('[aria-label="Owner settings"]').click());
  assert.equal(document.querySelector(".workspace-appearance-controls"),null);
  await act(async()=>[...document.querySelectorAll(".settings-sections button,.settings-nav button,.settings-menu button,.settings-layout button")].find(b=>b.textContent==="Appearance").click());
  const pick=theme=>[...document.querySelectorAll('.appearance-picker button')].find(b=>b.textContent.includes(theme));
  await act(async()=>pick('Light').click());assert.equal(document.documentElement.dataset.theme,'light');
  await act(async()=>window.dispatchEvent(new window.Event('pagehide')));
  assert.equal(JSON.parse(localStorage.getItem('pacifica:test-workspace:profile')).appearance,'light');
  await act(async()=>pick('Dark').click());assert.equal(document.documentElement.dataset.theme,'dark');
  await act(async()=>h.root.unmount());closed=true;
  assert.equal(JSON.parse(localStorage.getItem('pacifica:test-workspace:profile')).appearance,'dark');
 }finally{if(closed)h.dom.window.close();else await h.cleanup()}
});
