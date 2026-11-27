import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import OpportunityDesk from '../../app/components/OpportunityDesk.tsx';
import QuoteRequestForm from '../../app/quote-request/QuoteRequestForm.tsx';
import QuoteDesk from '../../app/components/QuoteDesk.tsx';
async function setup(hash=''){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test/quote-request'+hash,pretendToBeVisual:true});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,FormData:dom.window.FormData,IS_REACT_ACT_ENVIRONMENT:true});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:dom.window.navigator});
 const root=createRoot(document.getElementById('root'));
 return {render:async element=>{await act(async()=>root.render(element));await act(async()=>new Promise(r=>setTimeout(r,10)))},cleanup:async()=>{await act(async()=>root.unmount());dom.window.close()}};
}
const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
const click=async b=>{assert.ok(b);await act(async()=>b.click())};
test('personal quote form collects DOB without displaying existing personal records',async()=>{
 const h=await setup('#opaque-token');let posted;
 globalThis.fetch=async(url,init)=>{assert.equal(url,'/api/quote-intake');assert.equal(init.headers.Authorization,'Bearer opaque-token');if(init.method==='POST'){posted=JSON.parse(init.body);return Response.json({ok:true})}return Response.json({business:'Test Agency',existingContact:true,consentText:'I request a quote.'})};
 try{
  await h.render(React.createElement(QuoteRequestForm));
  assert.equal(document.querySelector('[name="name"]'),null);assert.equal(document.querySelector('[name="dateOfBirth"]').value,'');
  document.querySelector('[name="dateOfBirth"]').value='1990-06-15';document.querySelector('[name="contactPermission"]').checked=true;
  await act(async()=>document.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(posted.dateOfBirth,'1990-06-15');assert.equal(posted.contactPermission,true);assert.match(document.body.textContent,/agent has your request/);assert.equal(document.querySelector('form'),null);
 }finally{await h.cleanup()}
});
test('quote requests review refreshes contacts without the redundant dashboard',async()=>{
 const h=await setup();let refreshed=0;const actions=[];const pending={id:'r1',leadId:1,linkId:'l1',status:'pending',source:'Website',submittedAt:new Date().toISOString(),consentText:'Requested quote',details:{name:'Test Person',phone:'8185550101',dateOfBirth:'1990-06-15',product:'Auto',renewalDate:'',vin:'',address:'',city:'',state:'',zip:''}};
 const leads=[{id:1,name:'Test Person',phone:'8185550101',product:'Auto',outcome:'Interested'},{id:2,name:'Cold Contact',phone:'8185550102',source:'SmartFinancial',outcome:'Not contacted'},{id:3,name:'Renewal Contact',phone:'8185550103',renewalDate:new Date(Date.now()+14*86400000).toISOString().slice(0,10)}];
 globalThis.fetch=async(url,init)=>{if(url==='/api/vehicle-partner')return Response.json({error:'Temporarily unavailable'},{status:503});assert.equal(url,'/api/crm/opportunities');if(init.method==='POST'){actions.push(JSON.parse(init.body));return Response.json({ok:true})}return Response.json({links:[],submissions:actions.length?[]:[pending]})};
 try{
  await h.render(React.createElement(OpportunityDesk,{leads,onOpen(){},onMessage(){},onRefresh:async()=>{refreshed++}}));
  assert.match(document.body.textContent,/Quote requests to review/);assert.match(document.body.textContent,/Dealer partnership status could not be refreshed/);assert.doesNotMatch(document.body.textContent,/Your weekly growth plan/);
  await click(button('Reviewed · save to CRM'));assert.deepEqual(actions,[{action:'accept',id:'r1'}]);assert.equal(refreshed,1);assert.match(document.body.textContent,/No pending requests/);
 }finally{await h.cleanup()}
});
test('quote desk connects missing-details collection to the selected contact',async()=>{
 const h=await setup();let collected;
 try{await h.render(React.createElement(QuoteDesk,{leads:[{id:1,name:'Test Person',phone:'8185550101',product:'Auto'}],onOpen(){},onQuote(){},onQuoted(){},onCollect:id=>{collected=id}}));
 const select=document.querySelector('select');await act(async()=>{select.value='Needs information';select.dispatchEvent(new window.Event('change',{bubbles:true}))});await click(button('Collect missing details'));assert.equal(collected,1);
 }finally{await h.cleanup()}
});
test('quote links are generated on demand, disappear after copying, and old links never render',async()=>{
 const h=await setup();let created=0,copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{copied=text}}});
 globalThis.fetch=async(_url,options)=>options.method==='POST'?Response.json({path:`/quote-request#fresh-${++created}`}):Response.json({links:[{id:'old',path:'/quote-request#old'}],submissions:[]});
 try{await h.render(React.createElement(OpportunityDesk,{leads:[],onOpen(){},onMessage(){},onRefresh:async()=>{}}));assert.doesNotMatch(document.body.textContent,/Manage quote links/);assert.equal(document.querySelector('[aria-label="New quote link"]'),null);await click(button('Create quote link'));assert.match(document.querySelector('[aria-label="New quote link"]').value,/fresh-1/);await click(button('Copy link'));assert.equal(copied,'https://example.test/quote-request#fresh-1');assert.equal(document.querySelector('[aria-label="New quote link"]'),null);await click(button('Create quote link'));assert.match(document.querySelector('[aria-label="New quote link"]').value,/fresh-2/);await click(button('Done'));assert.equal(document.querySelector('[aria-label="New quote link"]'),null)}finally{await h.cleanup()}
});
test('AI changes show success only after a server save and retry with the same request ID',async()=>{
 const {default:AiControlPanel}=await import('../../app/components/AiControlPanel.tsx');const h=await setup();let attempts=0;const ids=[];globalThis.Event=window.Event;
 globalThis.fetch=async(_url,options)=>{if(options?.method==='POST'){ids.push(JSON.parse(options.body).id);return ++attempts===1?Response.json({error:'Storage unavailable'},{status:503}):Response.json({ok:true,changes:['Texts paused']})}return Response.json({control:{revision:0,rules:{},receipts:[]},counts:{sms:1,email:0},canManage:true,salesEnabled:true,schedule:'Scheduled checks'})};
 try{await h.render(React.createElement(AiControlPanel,{commands:[{kind:'outreach',channel:'sms',enabled:false}],changes:['Pause texts']}));await click(button('Save these changes'));assert.match(document.body.textContent,/Storage unavailable/);assert.ok(button('Save these changes'));await click(button('Save these changes'));assert.ok(button('Changes saved').disabled);assert.equal(ids[0],ids[1]);assert.match(document.body.textContent,/Saved. Texts paused/)}finally{await h.cleanup()}
});
