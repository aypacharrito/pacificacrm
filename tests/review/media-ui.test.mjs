import test from 'node:test';import assert from 'node:assert/strict';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';
import MessageMedia from '../../app/components/MessageMedia.tsx';
import MessagesCenter from '../../app/components/MessagesCenter.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
import {cleanCommunications} from '../../app/lib/communications.ts';
import {cleanMessageAttachments} from '../../app/lib/message-attachments.ts';
async function mount(component){const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,Node:dom.window.Node,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById('root'));await act(async()=>root.render(component));return async()=>{await act(async()=>root.unmount());dom.window.close()}}
test('image thumbnail and on-demand PDF preview render in message history',async()=>{
 const clean=await mount(React.createElement(MessageMedia,{messageId:'email1',attachments:[{url:'/api/message-media/a?history=1',name:'photo.png',type:'image/png'},{url:'/api/message-media/b?history=1',name:'quote.pdf',type:'application/pdf'}]}));
 try{assert.equal(document.querySelector('img').alt,'photo.png');assert.equal(document.querySelector('iframe'),null);await act(async()=>document.querySelector('button').click());assert.equal(document.querySelector('iframe').title,'Preview quote.pdf');assert.equal(document.querySelectorAll('a[download]').length,2);assert.match(document.querySelector('a[download]').href,/history=1&download=1/)}finally{await clean()}
});
test('attachments survive communication normalization and unsafe URL schemes are discarded',()=>{
 const attachments=[{url:'/api/message-media/a?history=1',name:'quote.pdf',type:'application/pdf'}];assert.deepEqual(cleanCommunications([{id:'e1',channel:'email',body:'Your quote',attachments}])[0].attachments,attachments);assert.equal(cleanMessageAttachments([{url:'javascript:alert(1)'}]).length,0);
});
test('large inbox renders an initial window, with access to remaining conversations',async()=>{
 const original=global.fetch;global.fetch=async url=>String(url).includes('twilio')?Response.json({messages:[],sending:{configured:true}}):Response.json({configured:false,leads:[]});
 const leads=Array.from({length:5000},(_,id)=>({id:id+1,name:`Contact ${id}`,phone:`818555${String(id).padStart(4,'0')}`,email:'',stage:'New lead',outcome:'Not contacted',notes:'',product:'Insurance',city:'',line:'home-auto',followUp:'',importedAt:'',lastContact:'',sourceDisposition:'',doNotCall:false}));
 const clean=await mount(React.createElement(MessagesCenter,{workspaceId:'test',profile:defaultWorkspaceProfile,leads,onPatch(){},onProfileChange(){},onOpenContact(){},onCloseLead(){},visible:false}));
 try{assert.equal(document.querySelectorAll('.message-contacts>button').length,61);await act(async()=>document.querySelector('.load-more').click());assert.equal(document.querySelectorAll('.message-contacts>button').length,121)}finally{await clean();global.fetch=original}
});
test('message scroll indicators activate only during scrolling and fade after idle',async()=>{
 const clean=await mount(React.createElement(MessagesCenter,{workspaceId:'test',profile:defaultWorkspaceProfile,leads:[],onPatch(){},onProfileChange(){},onOpenContact(){},onCloseLead(){},visible:false}));
 try{const list=document.querySelector('.message-contacts');assert.equal(list.classList.contains('is-scrolling'),false);list.dispatchEvent(new window.Event('scroll'));assert.equal(list.classList.contains('is-scrolling'),true);await new Promise(resolve=>setTimeout(resolve,700));assert.equal(list.classList.contains('is-scrolling'),false);list.dispatchEvent(new window.Event('scroll'));await clean();assert.equal(list.classList.contains('is-scrolling'),false)}catch(error){await clean();throw error}
});
test('saved outgoing PDF and reply remain together after answering and in Replies filter',async()=>{
 const original=global.fetch;global.fetch=async()=>Response.json({messages:[],configured:true,leads:[]});
 const lead={id:1,name:'Example Contact',phone:'8185550100',email:'client@example.test',stage:'Follow-up',outcome:'Interested',notes:'',product:'Insurance',city:'',line:'home-auto',followUp:'',importedAt:'',lastContact:'',sourceDisposition:'',doNotCall:false,communications:[{id:'a',channel:'sms',direction:'inbound',body:'Please send the quote',status:'received',sentAt:'2026-09-30T10:00:00Z',provider:'twilio'},{id:'b',channel:'sms',direction:'outbound',body:'',attachments:[{url:'/api/message-media/a?history=1',name:'quote.pdf',type:'application/pdf'}],status:'sent',sentAt:'2026-09-30T11:00:00Z',provider:'twilio'}]};
 const clean=await mount(React.createElement(MessagesCenter,{workspaceId:'test',profile:defaultWorkspaceProfile,leads:[lead],onPatch(){},onProfileChange(){},onOpenContact(){},onCloseLead(){},visible:false}));
 try{assert.match(document.body.textContent,/Please send the quote/);assert.match(document.body.textContent,/quote.pdf/);assert.match(document.body.textContent,/AI texting is off/);await act(async()=>[...document.querySelectorAll('.inbox-filters button')].find(button=>button.textContent==='Reply').click());assert.equal(document.querySelectorAll('.message-contacts>button').length,1)}finally{await clean();global.fetch=original}
});
test('STOP threads appear only in Closed, including their selected thread and saved attachments',async()=>{
 const original=global.fetch;global.fetch=async()=>Response.json({messages:[],configured:true,leads:[]});
 const base={phone:'8185550100',email:'',stage:'Follow-up',outcome:'Not contacted',notes:'',product:'Insurance',city:'',line:'home-auto',followUp:'',importedAt:'',lastContact:'',sourceDisposition:'',doNotCall:false};
 const outbound={id:'out',channel:'sms',direction:'outbound',body:'Your quote',attachments:[{url:'/api/message-media/a?history=1',name:'quote.pdf',type:'application/pdf'}],status:'sent',sentAt:'2026-09-30T10:00:00Z',provider:'twilio'};
 const leads=[{...base,id:1,name:'Stopped Contact',communications:[outbound,{id:'stop',channel:'sms',direction:'inbound',body:'STOP',sentAt:'2026-09-30T11:00:00Z',status:'received',provider:'twilio'}]},{...base,id:2,phone:'8185550200',name:'Active Contact',outcome:'Interested',communications:[{...outbound,id:'active-out',attachments:[]},{id:'reply',channel:'sms',direction:'inbound',body:'Can you quote me?',sentAt:'2026-09-30T12:00:00Z',status:'received',provider:'twilio'}]}];
 const clean=await mount(React.createElement(MessagesCenter,{workspaceId:'test',profile:defaultWorkspaceProfile,leads,onPatch(){},onProfileChange(){},onOpenContact(){},onCloseLead(){},visible:false}));
 const filter=async name=>act(async()=>[...document.querySelectorAll('.inbox-filters button')].find(button=>button.textContent===name).click());
 try{
  for(const name of ['All','Reply','Sent']){await filter(name);assert.doesNotMatch(document.querySelector('.message-contacts').textContent,/Stopped Contact/);assert.match(document.querySelector('.thread-contact').textContent,/Active Contact/)}
  await filter('Closed');assert.match(document.querySelector('.message-contacts').textContent,/Stopped Contact/);assert.doesNotMatch(document.querySelector('.message-contacts').textContent,/Active Contact/);assert.match(document.querySelector('.message-history').textContent,/STOP/);assert.match(document.querySelector('.message-history').textContent,/quote.pdf/);assert.equal(document.querySelector('textarea').disabled,true);
  await act(async()=>document.querySelector('.message-contacts>button').click());await filter('Reply');assert.match(document.querySelector('.thread-contact').textContent,/Active Contact/);assert.doesNotMatch(document.querySelector('.message-history').textContent,/STOP/);
 }finally{await clean();global.fetch=original}
});
test('a freshly polled STOP closes every duplicate phone record and leaves Replies immediately',async()=>{
 const original=global.fetch;const patches=[];
 global.fetch=async url=>String(url).includes('twilio/messages')?Response.json({phone:'+18185559999',sending:{configured:true},messages:[{id:'new-stop',direction:'inbound',from:'+18185550100',to:'+18185559999',body:'STOP',status:'received',sentAt:'2026-09-30T11:00:00Z'}]}):Response.json({messages:[],configured:true,leads:[]});
 const leads=[1,2].map(id=>({id,name:`Duplicate ${id}`,phone:'8185550100',email:'',stage:'Follow-up',outcome:'Not contacted',notes:'',product:'Insurance',city:'',line:'home-auto',followUp:'',importedAt:'',lastContact:'',sourceDisposition:'',doNotCall:false}));
 const clean=await mount(React.createElement(MessagesCenter,{workspaceId:'test',profile:defaultWorkspaceProfile,leads,onPatch(id,patch){patches.push({id,patch})},onProfileChange(){},onOpenContact(){},onCloseLead(){}}));
 try{await act(async()=>new Promise(resolve=>setTimeout(resolve,40)));assert.deepEqual(patches.map(x=>x.id).sort(),[1,2]);assert.ok(patches.every(x=>x.patch.smsOptOut&&x.patch.doNotCall&&x.patch.stage==='Closed'));assert.equal(document.querySelectorAll('.message-contacts>button').length,0);assert.equal(document.querySelector('.thread-contact'),null);await act(async()=>[...document.querySelectorAll('.inbox-filters button')].find(button=>button.textContent==='Closed').click());assert.equal(document.querySelectorAll('.message-contacts>button').length,2)}finally{await clean();global.fetch=original}
});

test('SMS Reply hides unreviewed inbound replies and AI follow-ups until marked Interested',async()=>{
 const base={phone:'8185550100',email:'',stage:'Follow-up',outcome:'Not contacted',notes:'',product:'Insurance',city:'',line:'home-auto',followUp:'',importedAt:'',lastContact:'',sourceDisposition:'',doNotCall:false};
 const messages=[{id:'reply',channel:'sms',direction:'inbound',body:'Hello',sentAt:'2026-10-01T10:00:00Z'},{id:'ai',channel:'sms',direction:'outbound',body:'Following up',sentAt:'2026-10-01T11:00:00Z'}];
 const leads=[{...base,id:1,name:'Unreviewed Reply',communications:messages},{...base,id:2,name:'Marked Interested',phone:'8185550200',outcome:'Interested',communications:messages.map(m=>({...m,id:`second-${m.id}`}))}];
 const clean=await mount(React.createElement(MessagesCenter,{workspaceId:'test',profile:defaultWorkspaceProfile,leads,onPatch(){},onProfileChange(){},onOpenContact(){},onCloseLead(){},visible:false}));
 try{
  await act(async()=>[...document.querySelectorAll('.inbox-filters button')].find(b=>b.textContent==='Reply').click());
  assert.equal(document.querySelectorAll('.message-contacts>button').length,1);
  assert.match(document.querySelector('.message-contacts').textContent,/Marked Interested/);
  assert.doesNotMatch(document.querySelector('.message-contacts').textContent,/Unreviewed Reply/);
  await act(async()=>[...document.querySelectorAll('.inbox-filters button')].find(b=>b.textContent==='All').click());
  assert.equal(document.querySelectorAll('.message-contacts>button').length,2);
 }finally{await clean()}
});
