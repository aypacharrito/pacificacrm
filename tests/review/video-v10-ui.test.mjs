import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OfficeDesk from '../../app/components/OfficeDesk.tsx';
import AiCommandCenter from '../../app/components/AiCommandCenter.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
async function setup(){const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/dashboard',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,FileReader:dom.window.FileReader,IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});const root=createRoot(document.getElementById('root'));return {dom,render:async view=>{await act(async()=>{root.render(view);await new Promise(r=>setTimeout(r,20))});await act(async()=>new Promise(r=>setTimeout(r,20)))},cleanup:async()=>{await act(async()=>root.unmount());dom.window.close()}}}
const button=text=>[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===text);
const click=async element=>{assert.ok(element);await act(async()=>element.click())};
test('office calendar renders scheduled payment, saves completion and shows paid status',async()=>{
 const h=await setup();const item={id:'p1',leadId:1,title:'Monthly payment',kind:'payment',dueAt:new Date().toISOString(),amount:200,status:'open',reminderState:'pending',reminderAt:new Date().toISOString()};let sent;
 globalThis.fetch=async(url,options)=>{if(String(url).startsWith('/api/calendar/external'))return Response.json({events:[],errors:[]});if(url==='/api/calendar/google')return Response.json({configured:false,connected:false,canManage:true});if(url==='/api/automation/run')return Response.json({configured:false,browserSchedule:'Every five minutes'});assert.equal(url,'/api/crm/office');if(options?.method==='POST'){sent=JSON.parse(options.body);item.status='done'}return Response.json({items:[item]})};
 try{await h.render(React.createElement(OfficeDesk,{leads:[{id:1,name:'Client One',phone:'8185550101'}],profile:defaultWorkspaceProfile,onProfile(){},isOwner:true,onOpen(){}}));assert.equal(document.querySelectorAll('[aria-label^="Create event on"]').length,42);await click([...document.querySelectorAll('button')].find(x=>x.title.startsWith('Monthly payment')));assert.match(document.body.textContent,/Client One/);await click(button('Mark paid'));assert.deepEqual(sent,{action:'complete',id:'p1'});assert.match(document.body.textContent,/Marked paid/)}finally{await h.cleanup()}
});
const aiProps={leads:[],recentCalls:[],onApply(){},onCreateLead(){},onOpen(){},onCall(){},workspaceId:'test',activeLine:'home-auto',profile:defaultWorkspaceProfile,onActivity(){},visible:true};
test('AI chat attaches a PDF, sends it as a document and displays its filename after answering',async()=>{
 const h=await setup();let posted;
 globalThis.fetch=async(url,options)=>{if(options?.method==='POST'){posted=JSON.parse(options.body);return Response.json({summary:'Document read.',priorities:[],actions:[],draft:'',createLead:null})}return Response.json({configured:true,providerConfigured:true})};
 try{await h.render(React.createElement(AiCommandCenter,aiProps));const input=document.querySelector('input[type=file]');assert.match(input.accept,/application\/pdf/);const file=new h.dom.window.File(['%PDF-1.4\nTest document'],'policy.pdf',{type:'application/pdf'});file.slice=()=>({arrayBuffer:async()=>new TextEncoder().encode('%PDF-').buffer});Object.defineProperty(input,'files',{value:[file]});await act(async()=>{input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,30))});assert.match(document.body.textContent,/policy.pdf/);await click(document.querySelector('[aria-label="Send to Doxa"]'));assert.equal(posted.images.length,0);assert.equal(posted.documents[0].name,'policy.pdf');assert.match(posted.documents[0].dataUrl,/^data:application\/pdf;base64,/);assert.match(document.body.textContent,/Document read/);assert.match(document.body.textContent,/PDF · policy.pdf/)}finally{await h.cleanup()}
});
test('AI camera starts a real media request and stops every track when dismissed',async()=>{
 const h=await setup();let requested=0,stopped=0;
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async constraints=>{requested++;assert.equal(constraints.audio,false);return {getTracks:()=>[{stop(){stopped++}}]}}}});
 h.dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};h.dom.window.HTMLMediaElement.prototype.play=async()=>{};
 globalThis.fetch=async()=>Response.json({configured:true,providerConfigured:true});
 try{await h.render(React.createElement(AiCommandCenter,aiProps));await click(document.querySelector('[aria-label="Open AI tools"]'));await click(button('Use camera'));assert.equal(requested,1);assert.ok(document.querySelector('video'));await click(button('Cancel'));assert.equal(stopped,1);assert.equal(document.querySelector('video'),null)}finally{await h.cleanup()}
});
test('native overlay renderer paints call, incoming and wrap-up controls and acknowledges each state',async()=>{
 const {readFileSync}=await import('node:fs');const html=readFileSync(new URL('../../desktop/overlay.html',import.meta.url),'utf8');const dom=new JSDOM(html,{runScripts:'outside-only'});let listener,ready=0;const actions=[];
 dom.window.pacificaOverlay={onState:callback=>{listener=callback},getState:async()=>({active:true,name:'Caller One',connected:true,elapsed:'00:27'}),ready(){ready++},send:action=>actions.push(action),sendWrapAction:action=>actions.push(action)};
 try{dom.window.eval(readFileSync(new URL('../../desktop/overlay.js',import.meta.url),'utf8'));await Promise.resolve();assert.equal(dom.window.document.getElementById('name').textContent,'Caller One');assert.equal(dom.window.document.getElementById('timer').textContent,'00:27');assert.equal(ready,1);
  listener({incoming:{name:'Caller Two',number:'8185550101'}});assert.equal(dom.window.document.getElementById('incoming').hidden,false);assert.equal(dom.window.document.getElementById('call').hidden,true);dom.window.document.querySelector('[data-action="answer-incoming"]').click();assert.equal(actions[0],'answer-incoming');
  listener({active:false,wrapUp:{id:'w1',name:'Caller One',outcomes:['Interested'],draft:{crmOutcome:'Interested',crmStage:'Follow-up',notes:'',appointmentAt:''},resume:true}});assert.equal(dom.window.document.getElementById('wrap').hidden,false);dom.window.document.getElementById('save').click();assert.equal(actions[1].kind,'save');assert.equal(actions[1].id,'w1');assert.equal(ready,3);
 }finally{dom.window.close()}
});
test('a reviewed AI batch continues after a blocked recipient and counts only confirmed provider acceptance',async()=>{
 const h=await setup();
 const sent=[];
 const leads=[1,2,3,4].map(id=>({id,name:`Person ${id}`,phone:`818555010${id}`,email:'',stage:'New lead',outcome:'Not contacted',line:'home-auto',smsConsent:true}));
 globalThis.fetch=async(url,options)=>{
   if(url==='/api/ai/crm')return Response.json({summary:'Ready',draft:'Hello, following up on your request.',recipientIds:leads.map(lead=>lead.id),priorities:[],actions:[]});
   if(url==='/api/twilio/messages'&&options?.method==='POST'){
     const payload=JSON.parse(options.body);
     sent.push(payload);
     if(payload.leadId===2)return Response.json({error:'Invalid destination'},{status:400});
     if(payload.leadId===3)return Response.json({ok:true});
     return Response.json({ok:true,reviewedSend:{state:'accepted',providerId:`fixture-${payload.leadId}`}});
   }
   return Response.json({configured:true,providerConfigured:true});
 };
 try{
   await h.render(React.createElement(AiCommandCenter,{...aiProps,leads}));
   await click([...document.querySelectorAll('button')].find(b=>b.textContent.includes('Write a follow-up')));
   await click(button('Send text to 4 selected contacts'));
   assert.deepEqual(sent.map(item=>item.to),leads.map(lead=>lead.phone));
   assert.ok(sent[0].reviewId);
   assert.equal(new Set(sent.map(item=>item.reviewId)).size,1);
   assert.match(document.body.textContent,/2 accepted by provider · 2 pending\/unconfirmed · 0 skipped/);
 }finally{await h.cleanup()}
});
test('updated desktop waits for native visibility acknowledgment instead of racing a second open request',async()=>{
 const {default:FloatingCallWindow}=await import('../../app/components/FloatingCallWindow.tsx');const h=await setup();let listener,entered=0;const visible=[];
 window.pacificaDesktop={isDesktop:true,supportsDesktopWrapUp:true,supportsAtomicCallState:true,onOverlayStatus:cb=>{listener=cb;return()=>{}},enterCallOverlay:async()=>{entered++;return false},exitCallOverlay:async()=>true};
 const props={active:true,category:'Auto',name:'Test',number:'8185550100',connected:false,muted:false,elapsed:'00:00',sentDigits:'',feedback:'',onWindowChange:v=>visible.push(v),onMute(){},onEnd(){},onDigits(){}};
 try{await h.render(React.createElement(FloatingCallWindow,props));assert.equal(entered,0);assert.doesNotMatch(document.body.textContent,/Could not open/);await act(async()=>listener({open:true,error:''}));assert.match(document.body.textContent,/Show floating call/);assert.equal(visible.at(-1),true);await act(async()=>listener({open:false,error:'Native window unavailable'}));assert.match(document.body.textContent,/Native window unavailable/)}finally{await h.cleanup()}
});
test('attachment state clears when the composer changes recipient',async()=>{
 const {default:MessageAttachmentBridge}=await import('../../app/components/MessageAttachmentBridge.tsx');const h=await setup();
 Object.assign(globalThis,{MutationObserver:window.MutationObserver,Element:window.Element,HTMLTextAreaElement:window.HTMLTextAreaElement,Event:window.Event,requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window)});
 const thread=document.createElement('section');thread.className='message-thread';thread.innerHTML='<button class="thread-contact"><b>First contact</b><small>8185550100</small></button><footer><textarea></textarea></footer>';document.body.appendChild(thread);
 globalThis.fetch=async()=>Response.json({attachment:{url:'https://example.test/file.pdf',name:'quote.pdf',type:'application/pdf',size:8,expiresAt:Date.now()+60000}});window.fetch=globalThis.fetch;
 try{await h.render(React.createElement(MessageAttachmentBridge,{key:"first",channel:"sms",resetKey:false,onChange(){}}));const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new window.File(['%PDF-1.4'],'quote.pdf',{type:'application/pdf'})]});await act(async()=>{input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,50))});assert.equal(document.querySelectorAll('.message-attachment-chips>span').length,1);await h.render(React.createElement(MessageAttachmentBridge,{key:"second",channel:"sms",resetKey:false,onChange(){}}));assert.equal(document.querySelectorAll('.message-attachment-chips>span').length,0)}finally{await h.cleanup()}
});

test('emoji picker escapes the scrolling footer, inserts at the cursor, and closes with Escape',async()=>{
 const {default:MessageAttachmentBridge}=await import('../../app/components/MessageAttachmentBridge.tsx');const h=await setup();Object.assign(globalThis,{MutationObserver:window.MutationObserver,Element:window.Element,HTMLTextAreaElement:window.HTMLTextAreaElement,Event:window.Event,requestAnimationFrame:window.requestAnimationFrame.bind(window),cancelAnimationFrame:window.cancelAnimationFrame.bind(window)});const thread=document.createElement('section');thread.className='message-thread';thread.innerHTML='<button class="thread-contact">Test</button><footer style="overflow:auto"><textarea>Hello there</textarea></footer>';document.body.appendChild(thread);globalThis.fetch=async()=>Response.json({});window.fetch=globalThis.fetch;
 try{await h.render(React.createElement(MessageAttachmentBridge,{key:"first",channel:"sms",resetKey:false,onChange(){}}));const textarea=thread.querySelector('textarea');textarea.setSelectionRange(5,5);await click(button('😊 Emoji'));const picker=document.querySelector('.message-emoji-picker');assert.equal(picker.parentElement,document.body);assert.ok(picker.querySelectorAll('button').length>60);await click(picker.querySelector('[aria-label="Insert 💚"]'));assert.equal(textarea.value,'Hello💚 there');await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('.message-emoji-picker'),null)}finally{await h.cleanup()}
});
