import test from 'node:test';import assert from 'node:assert/strict';
import React,{act} from 'react';import {JSDOM} from 'jsdom';
import VoiceDictation from '../../app/components/VoiceDictation.tsx';
import AiCommandCenter from '../../app/components/AiCommandCenter.tsx';
import NoteReminders from '../../app/components/NoteReminders.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
async function mount(component){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true});
 dom.window.HTMLElement.prototype.attachEvent=()=>{};dom.window.HTMLElement.prototype.detachEvent=()=>{};
 Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
 const {createRoot}=await import('react-dom/client');const root=createRoot(document.getElementById('root'));await act(async()=>root.render(component));
 return {dom,root,close:async()=>{await act(async()=>root.unmount());dom.window.close()}};
}
const click=async(selector)=>{const element=typeof selector==='string'?document.querySelector(selector):selector;assert.ok(element,'Expected UI control');await act(async()=>element.click())};
function microphone(){let permissions=0,stops=0;const stream={getTracks:()=>[{stop:()=>stops++}]};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{permissions++;return stream}}});
 globalThis.MediaRecorder=class{static isTypeSupported(){return true}mimeType='audio/webm';state='inactive';start(){this.state='recording'}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'],{type:'audio/webm'})});void this.onstop?.()}};
 return {get permissions(){return permissions},get stops(){return stops},stream};
}
test('Doxa voice adds editable words, blocks sending during recording, and never sends automatically',async()=>{
 const original=globalThis.fetch,posts=[];globalThis.fetch=async(url,options)=>{if(options?.method==='POST')posts.push(String(url));if(String(url)==='/api/ai/transcribe')return Response.json({text:'Check today’s unfinished requests.'});return Response.json({providerConfigured:true,configured:true,rules:[]})};
 const h=await mount(React.createElement(AiCommandCenter,{visible:true,workspaceId:'test',profile:defaultWorkspaceProfile,leads:[],recentCalls:[],onActivity(){},onApply(){},onCreateLead(){},onOpen(){},onCall(){}}));const mic=microphone();
 try{assert.equal(mic.permissions,0);await click('[aria-label="Voice input"]');assert.equal(mic.permissions,1);assert.equal(document.querySelector('[aria-label="Send to Doxa"]').disabled,true);await click('[aria-label="Finish recording"]');assert.equal(document.querySelector('textarea').value,'Check today’s unfinished requests.');assert.deepEqual(posts,['/api/ai/transcribe']);assert.equal(document.querySelector('[aria-label="Send to Doxa"]').disabled,false);assert.ok(mic.stops>0)}finally{await h.close();globalThis.fetch=original;delete globalThis.MediaRecorder}
});
test('cancelled transcription cannot append late words and releases the microphone',async()=>{
 const original=globalThis.fetch,words=[];let finish,signal;globalThis.fetch=async(_url,options)=>{signal=options.signal;return new Promise(resolve=>{finish=resolve})};
 const h=await mount(React.createElement(VoiceDictation,{disabled:false,onText:text=>words.push(text)})),mic=microphone();
 try{await click('[aria-label="Voice input"]');await click('[aria-label="Finish recording"]');await click('[aria-label="Cancel voice input"]');assert.equal(signal.aborted,true);await act(async()=>finish(Response.json({text:'Late result'})));assert.deepEqual(words,[]);assert.ok(mic.stops>0);assert.ok(document.querySelector('[aria-label="Voice input"]'))}finally{await h.close();globalThis.fetch=original;delete globalThis.MediaRecorder}
});
test('leaving while microphone permission is pending stops the eventual stream',async()=>{
 const h=await mount(React.createElement(VoiceDictation,{disabled:false,onText:()=>assert.fail('No transcript after unmount')}));const mic=microphone();let permit;
 navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{permit=resolve});await click('[aria-label="Voice input"]');await h.close();await act(async()=>permit(mic.stream));assert.equal(mic.stops,1);delete globalThis.MediaRecorder;
});
test('Today allows completion during an AI review and ignores an older review response',async()=>{
 const original=globalThis.fetch;let reviewResponse;let item={id:'t1',leadId:1,title:'Send revised quote',evidence:'Please send the updated quote.',status:'open',dueAt:'',snoozedUntil:'',createdAt:'2026-10-05T12:00:00Z',updatedAt:'2026-10-05T12:00:00Z'};const old=structuredClone(item);
 globalThis.fetch=async(_url,options)=>{const action=options?.body?JSON.parse(options.body).action:'';if(action==='review')return new Promise(resolve=>{reviewResponse=resolve});if(action==='done')item={...item,status:'done'};return Response.json({items:[item],configured:true,pending:0})};
 const h=await mount(React.createElement(NoteReminders,{leads:[{id:1,name:'Sample'}],onOpen(){}}));
 try{await act(async()=>new Promise(r=>setTimeout(r,15)));assert.equal(typeof reviewResponse,'function');assert.equal(document.querySelector('[aria-label="Mark Send revised quote done"]').disabled,false);await click('[aria-label="Mark Send revised quote done"]');assert.equal(document.querySelector('.today-task'),null);await act(async()=>reviewResponse(Response.json({items:[old],configured:true})));assert.equal(document.querySelector('.today-task'),null);await click([...document.querySelectorAll('.note-reminder-tabs button')].find(b=>b.textContent==='Done'));assert.match(document.querySelector('.today-task').textContent,/Send revised quote/)}finally{await h.close();globalThis.fetch=original}
});

test('AI revisions preserve the selected audience and channel when the provider fails',async()=>{
 const original=globalThis.fetch;let fail=false;
 const leads=[1,2,3].map(id=>({id,name:`Contact ${id}`,phone:`818555010${id}`,email:`contact${id}@example.test`,stage:'Follow-up',outcome:'Call back later',smsConsent:true,emailConsent:true}));
 globalThis.fetch=async(url,options)=>{
  if(String(url)==='/api/ai/crm'&&options?.method==='POST')return fail?Response.json({error:'AI is temporarily unavailable.'},{status:503}):Response.json({summary:'Draft ready.',priorities:[],actions:[],draft:'Hi, would Friday work for a quick call?',recipientIds:[],mode:'ai'});
  return Response.json({providerConfigured:true,configured:true,rules:[]});
 };
 const h=await mount(React.createElement(AiCommandCenter,{visible:true,workspaceId:'test',profile:defaultWorkspaceProfile,leads,recentCalls:[],onActivity(){},onApply(){},onCreateLead(){},onOpen(){},onCall(){}}));
 async function ask(value){const input=document.querySelector('[aria-label="Message Doxa"]');await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}))});await click('[aria-label="Send to Doxa"]')}
 try{
  await ask('Write texts for all followups');assert.match(document.querySelector('.ai-selection-heading').textContent,/3 selected/);
  await click('.ai-recipient-list input');assert.match(document.querySelector('.ai-selection-heading').textContent,/2 selected/);
  await click(document.querySelector('.ai-channel-choice button'));assert.match(document.querySelector('.ai-selection-heading').textContent,/2 selected/);
  fail=true;await ask('Make that an email');assert.match(document.querySelector('[role="alert"]').textContent,/temporarily unavailable/);assert.match(document.querySelector('.ai-selection-heading').textContent,/2 selected/);
  assert.equal(document.querySelector('.ai-channel-choice button[aria-pressed="true"]').textContent,'Text');assert.match(document.querySelector('[aria-label="Review message before sending"]').value,/would Friday work/);
 }finally{await h.close();globalThis.fetch=original}
});
test('Autopilot enables Start after loading eligible contacts without a permission form',async()=>{
 const {default:AiVoicePilot}=await import('../../app/components/AiVoicePilot.tsx');const original=globalThis.fetch,requests=[];
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);assert.equal(body.action,'queue');return Response.json({queue:[{id:1,name:'Driver',phone:'+18185550101'},{id:2,name:'Stale contact',phone:'+18185550102'}],excluded:2,history:[]})};
 const h=await mount(React.createElement(AiVoicePilot,{leads:[{id:1,name:'Driver',phone:'8185550101'}],busy:false,onActive(){},onClose(){}}));
 const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 try{
  assert.equal(requests.length,0);assert.equal(button('Start Autopilot').disabled,true);await click(button('Load queue'));assert.equal(requests.length,1);assert.equal(button('Start Autopilot').disabled,false);
  assert.match(document.querySelector('.ai-voice-pilot > [role="status"]').textContent,/1 ready · 3 skipped/);
  assert.equal(document.querySelector('[aria-label="AI call permission evidence"]'),null);assert.equal(document.querySelector('input[type="checkbox"]'),null);assert.equal(document.querySelector('#voice-start-help'),null);
  const select=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='home'));await act(async()=>{select.value='home';select.dispatchEvent(new window.Event('change',{bubbles:true}))});assert.equal(button('Start Autopilot').disabled,true);assert.equal(requests.length,1);assert.equal(button('Start Autopilot').title,'Load queue');assert.equal(document.querySelector('.ai-voice-pilot > [role="status"]').textContent,'');
  await click(button('Load queue'));assert.equal(requests[1].kind,'home');assert.equal(button('Start Autopilot').disabled,false);
 }finally{await h.close();globalThis.fetch=original}
});

test('Autopilot explains an empty queue and clears stale contacts after a failed reload',async()=>{
 const {default:AiVoicePilot}=await import('../../app/components/AiVoicePilot.tsx');const original=globalThis.fetch;let load=0;
 globalThis.fetch=async()=>++load===1?Response.json({queue:[],excluded:3,history:[]}):load===2?Response.json({queue:[{id:1,name:'Driver',phone:'+18185550101'}],excluded:2,history:[]}):Response.json({error:'Workspace temporarily unavailable.'},{status:503});
 const h=await mount(React.createElement(AiVoicePilot,{leads:[{id:1,name:'Driver',phone:'8185550101'}],busy:false,onActive(){},onClose(){}}));const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 try{
  await click(button('Load queue'));assert.match(document.querySelector('.ai-voice-pilot > [role="status"]').textContent,/No eligible contacts/);assert.equal(button('Start Autopilot').disabled,true);
  await click(button('Load queue'));assert.match(document.querySelector('.ai-voice-pilot > [role="status"]').textContent,/1 ready/);
  await click(button('Load queue'));assert.match(document.querySelector('.ai-voice-pilot > [role="status"]').textContent,/Workspace temporarily unavailable/);assert.equal(button('Start Autopilot').disabled,true);assert.equal(button('Start Autopilot').title,'Load queue');
 }finally{await h.close();globalThis.fetch=original}
});

test('Autopilot Start reaches microphone setup directly and Stop cancels pending setup',async()=>{
 const {default:AiVoicePilot}=await import('../../app/components/AiVoicePilot.tsx');const original=globalThis.fetch,active=[];let permit,stopped=0,micRequests=0;
 globalThis.fetch=async(_url,options)=>{assert.equal(JSON.parse(options.body).action,'queue');return Response.json({queue:[{id:1,name:'Driver',phone:'+18185550101'}],excluded:0,history:[]})};
 const h=await mount(React.createElement(AiVoicePilot,{leads:[{id:1,name:'Driver',phone:'8185550101'}],busy:false,onActive:value=>active.push(value),onClose(){}}));const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>{micRequests++;return new Promise(resolve=>permit=resolve)}}});
 try{
  await click(button('Load queue'));await click(button('Start Autopilot'));assert.equal(micRequests,1);assert.deepEqual(active,[true]);assert.ok(button('Stop Autopilot'));
  await click(button('Stop Autopilot'));await act(async()=>permit({getTracks:()=>[{stop:()=>stopped++}]}));assert.equal(stopped,1);assert.deepEqual(active,[true,false]);assert.ok(button('Start Autopilot'));
 }finally{await h.close();globalThis.fetch=original}
});

test('minimizing Ava keeps its queue mounted across page navigation',async()=>{
 const {default:AiVoicePilot}=await import('../../app/components/AiVoicePilot.tsx');const original=globalThis.fetch,active=[];let permit,stopped=0;
 globalThis.fetch=async()=>Response.json({queue:[{id:1,name:'Driver',phone:'+18185550101'}],excluded:0,history:[]});
 function App(){const [open,setOpen]=React.useState(true);return React.createElement(AiVoicePilot,{expanded:open,onOpen:()=>setOpen(true),onClose:()=>setOpen(false),leads:[{id:1,name:'Driver',phone:'8185550101'}],busy:false,onActive:value=>active.push(value)})}
 const h=await mount(React.createElement(App));const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:()=>new Promise(resolve=>permit=resolve)}});
 try{await click(button('Load queue'));await click(button('Start Autopilot'));await click('[aria-label="Minimize AI Autopilot"]');assert.deepEqual(active,[true]);assert.ok(document.querySelector('.ava-dock'));await click(button('Stop'));await act(async()=>permit({getTracks:()=>[{stop:()=>stopped++}]}));assert.equal(stopped,1);assert.deepEqual(active,[true,false])}finally{await h.close();globalThis.fetch=original}
});
