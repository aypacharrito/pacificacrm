import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useCallback,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssistantLauncher from '../../app/components/connected/AssistantLauncher.tsx';
import VoiceDictation from '../../app/components/VoiceDictation.tsx';
import AiCommandCenter from '../../app/components/AiCommandCenter.tsx';
import {defaultWorkspaceProfile} from '../../app/lib/workspace-profile.ts';
import ConnectedMail from '../../app/components/connected/ConnectedMail.tsx';
import MessagesCenter from '../../app/components/MessagesCenter.tsx';
import CallbackReview from '../../app/components/CallbackReview.tsx';
import TodayWorkspace from '../../app/components/TodayWorkspace.tsx';
import OfficeDesk from '../../app/components/OfficeDesk.tsx';

async function setup(){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://preview.example.test/dashboard',pretendToBeVisual:true});
  const {window}=dom;
  const original=Object.fromEntries(['window','document','HTMLElement','Event','KeyboardEvent','requestAnimationFrame','fetch','MediaRecorder','SpeechSynthesisUtterance','speechSynthesis','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,globalThis[key]]));
  const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  Object.assign(globalThis,{window,document:window.document,HTMLElement:window.HTMLElement,Event:window.Event,
    KeyboardEvent:window.KeyboardEvent,requestAnimationFrame:window.requestAnimationFrame.bind(window),IS_REACT_ACT_ENVIRONMENT:true});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});
  const root=createRoot(document.getElementById('root'));
  return {
    window,
    async render(Component){await act(async()=>root.render(Component));},
    async close(){await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,original);Object.defineProperty(globalThis,'navigator',navigatorDescriptor);},
  };
}
const button=(name)=>[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===name||item.getAttribute('aria-label')===name);
const idle=()=>new Promise(resolve=>setTimeout(resolve,28));

test('confirmed member callback appears in Today and Calendar with its contact link',async()=>{
  const ui=await setup(),oldFetch=globalThis.fetch;
  const dueAt=new Date(Date.now()+2*86400000).toISOString(),day=dueAt.slice(0,10);
  const privateItem={id:'member-callback:synthetic',leadId:1,kind:'appointment',title:'Callback · Ana',dueAt,amount:0,status:'open',reminderAt:'',reminderState:'off',createdAt:new Date().toISOString(),durationMinutes:30,staffReminderMinutes:-1,privateMemberId:'member-a',sourceMessageId:'spanish-sms',timezone:'Etc/UTC'};
  const lead={id:1,name:'Ana',phone:'+15550000001',city:'',source:'Manual',leadCost:0,product:'Auto',stage:'Follow-up',outcome:'Interested',followUp:'',importedAt:'',lastContact:'',sourceDisposition:'',doNotCall:false};
  globalThis.fetch=async path=>path==='/api/calendar/member-callbacks'?Response.json({items:[privateItem]}):Response.json({items:[],events:[],accounts:[],errors:[]});
  try{
    await ui.render(React.createElement(TodayWorkspace,{leads:[lead],onOpen(){},onCall(){},onImport(){},onAdd(){}}));
    await act(async()=>idle());
    assert.match(document.querySelector('[aria-label="Private callbacks"]')?.textContent||'',/Callback · Ana/);
    await ui.render(React.createElement(OfficeDesk,{leads:[lead],profile:defaultWorkspaceProfile,onProfile(){},isOwner:false,onOpen(){},workspaceId:'dealer-one',initialDay:day,initialItem:privateItem.id}));
    await act(async()=>idle());
    assert.match(document.querySelector('[aria-label="Event details"]')?.textContent||'',/Callback · Ana/);
    assert.equal(button('Edit'),undefined);
  }finally{globalThis.fetch=oldFetch;await ui.close();}
});

test('employee reviews a seeded conflict before one private callback confirmation',async()=>{
  const ui=await setup(),oldFetch=globalThis.fetch,requests=[];
  globalThis.fetch=async(path,options)=>{
    assert.equal(path,'/api/calendar/member-callbacks');
    const body=JSON.parse(options.body);requests.push(body);
    const preview={leadId:1,messageId:'spanish-sms',sourceQuote:'Sí, me interesa. Llámame el martes a las dos.',dueAt:'2026-12-01T22:00:00.000Z',timezone:'America/Los_Angeles',fingerprint:'synthetic-fingerprint',conflicts:[{id:'seeded',title:'Existing CRM appointment',dueAt:'2026-12-01T22:00:00.000Z'}]};
    return Response.json(body.action==='preview'?{preview}:{ok:true,created:true,item:{id:'private',dueAt:preview.dueAt}});
  };
  try{
    await ui.render(React.createElement(CallbackReview,{leadId:1,messageId:'spanish-sms',timezone:'America/Los_Angeles'}));
    const input=document.querySelector('input[type="datetime-local"]');
    await act(async()=>{Object.getOwnPropertyDescriptor(ui.window.HTMLInputElement.prototype,'value').set.call(input,'2026-12-01T14:00');input.dispatchEvent(new ui.window.Event('input',{bubbles:true}));input.dispatchEvent(new ui.window.Event('change',{bubbles:true}))});
    await act(async()=>button('Review time and conflicts').click());
    assert.match(document.querySelector('.callback-review').textContent,/Existing CRM appointment/);
    assert.equal(button('Confirm private callback').disabled,true);
    await act(async()=>document.querySelector('input[type="checkbox"]').click());
    await act(async()=>button('Confirm private callback').click());
    assert.deepEqual(requests.map(request=>request.action),['preview','confirm']);
    assert.equal(requests[1].fingerprint,'synthetic-fingerprint');assert.equal(requests[1].acknowledgeConflict,true);
    assert.match(document.querySelector('.callback-review [role="status"]').textContent,/Private callback saved/);
  }finally{globalThis.fetch=oldFetch;await ui.close();}
});

test('a CRM SMS source opens the exact saved message even in a long thread',async()=>{
  const ui=await setup(),oldFetch=globalThis.fetch;
  const sentAt='2026-11-26T12:00:00Z';
  const communications=Array.from({length:72},(_,index)=>({id:index===0?'spanish-sms':'other-'+index,channel:'sms',direction:'inbound',body:index===0?'Sí, me interesa. Llámame el martes a las dos.':'Later reply '+index,status:'received',provider:'twilio',sentAt:new Date(Date.parse(sentAt)+index*60_000).toISOString()}));
  globalThis.fetch=async()=>Response.json({messages:[],configured:false,history:[]});
  try{
    await ui.render(React.createElement(MessagesCenter,{workspaceId:'dealer-one',profile:defaultWorkspaceProfile,leads:[{id:1,name:'Ana',phone:'+15550000001',email:'',product:'Auto',city:'',line:'home-auto',notes:'',stage:'Follow-up',outcome:'Interested',followUp:'',importedAt:'',lastContact:'',sourceDisposition:'',doNotCall:false,communications}],initialLeadId:1,initialChannel:'sms',initialMessageId:'spanish-sms',onPatch(){},onProfileChange(){},onOpenContact(){},onCloseLead(){}}));
    assert.match(document.querySelector('[data-source-message="spanish-sms"]')?.textContent||'',/Llámame el martes a las dos/);
  }finally{globalThis.fetch=oldFetch;await ui.close();}
});

test('launcher bilingual briefings send the exact question and render linked source records',async()=>{
  const ui=await setup();
  const previousFetch=globalThis.fetch;
  const prompts=[],opened=[];
  globalThis.fetch=async(path,options)=>{
    if(path==='/api/ai/crm'&&options?.method==='POST'){
      const {prompt}=JSON.parse(options.body);prompts.push(prompt);
      return Response.json({summary:'Review the linked records.',priorities:[],actions:[],draft:'',createLead:null,
        sources:[{label:'Specific request',detail:'Client · member@example.test',href:'/dashboard?connectedMail=signed-source'}]});
    }
    if(path==='/api/ai/crm')return Response.json({providerConfigured:false});
    return Response.json({configured:false});
  };
  try{
    await ui.render(React.createElement(AiCommandCenter,{assistantName:'Historically named assistant',visible:true,clerkEnabled:true,workspaceId:'synthetic',profile:defaultWorkspaceProfile,leads:[],recentCalls:[],onSource:href=>opened.push(href),onActivity(){},onApply(){},onCreateLead(){},onOpen(){},onCall(){}}));
    await act(async()=>button('Needs me today').click());
    assert.deepEqual(prompts,['What needs me today?']);
    assert.equal(document.querySelector('.ai-source-list a')?.textContent,'Specific request');
    await act(async()=>document.querySelector('.ai-source-list a').click());
    assert.deepEqual(opened,['/dashboard?connectedMail=signed-source']);
    await act(async()=>button('New request').click());
    await act(async()=>button('Asked for a call').click());
    assert.equal(prompts[1],'¿Quién pidió que le llamara?');
    assert.match(document.querySelector('.ai-assistant-message header b').textContent,/Historically named assistant/);
  }finally{globalThis.fetch=previousFetch;await ui.close();}
});

test('connected mail starts Starred, saves the chosen view and opens an unread message without writing',async()=>{
  const ui=await setup();
  const requests=[];
  const now=Date.now();
  const row={id:'id',thread:'thread',sender:'You',recipients:['me@example.test'],subject:'Calendar follow-up',
    at:now,preview:'Example',unread:true,starred:true,folders:[],inbox:true,sent:false,hasAttachments:false,connection:'google-account',
    source:'private-signed-source',account:'me@example.test',provider:'google'};
  globalThis.fetch=async(path,options)=>{
    requests.push({path, method:options?.method||'GET'});
    if(path==='/api/connected/accounts')return Response.json(options?.method==='POST'?JSON.parse(options.body):{
      accounts:[{id:'google-account',provider:'google',email:'me@example.test',enabled:{mail:true},actions:[],folders:[]}],
      preferences:{view:'starred',selected:[]},providers:{storage:true,google:true,microsoft:false,icloud:{mail:false,calendar:false}},
    });
    if(path.includes('?source='))return Response.json({...row,text:'Private message text',attachments:[],related:[]});
    return Response.json({rows:[row],coverage:[{connection:'google-account',account:'me@example.test',status:'searched'}]});
  };
  try{
    await ui.render(React.createElement(ConnectedMail,{onSettings(){}}));
    assert.equal(button('Starred').getAttribute('aria-pressed'),'true');
    await act(async()=>button('All Mail').click());
    assert.equal(button('All Mail').getAttribute('aria-pressed'),'true');
    assert.equal(requests.filter(request=>request.method==='POST').length,1);
    const message=document.querySelector('[aria-label="Messages"] button');
    await act(async()=>message.click());
    assert.match(document.querySelector('[aria-label="Reading pane"]').textContent,/Private message text/);
    assert.match(message.textContent,/Unread/);
    assert.equal(requests.filter(request=>request.method==='POST').length,1);
  }finally{await ui.close();}
});

test('the floating assistant keeps its session and releases the microphone on Escape',async()=>{
  const ui=await setup();
  let considered=0,stops=0;
  const track={addEventListener(){},stop(){stops++;}};
  Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{considered++;return {getTracks:()=>[track]};}}});
  globalThis.MediaRecorder=class{
    static isTypeSupported(){return true;}
    state='inactive';mimeType='audio/webm';
    start(){this.state='recording';}
    stop(){this.state='inactive';this.onstop?.();}
  };
  function Fixture(){
    const [open,setOpen]=useState(false),[notes,setNotes]=useState(0),[activity,setActivity]=useState('idle');
    const close=useCallback(()=>setOpen(false),[]);
    return React.createElement(AssistantLauncher,{open,activity,onOpen:()=>setOpen(true),onClose:close,away:false,blocked:false},
      React.createElement(React.Fragment,null,
        React.createElement('button',{onClick:()=>setNotes(value=>value+1)},'Session '+notes),
        open&&React.createElement(VoiceDictation,{disabled:false,onText(){},onStatus:state=>setActivity(state==='listening'?'listening':'idle')})));
  }
  try{
    await ui.render(React.createElement(Fixture));
    const launcher=button('Open Doxa. Ready');
    launcher.focus();
    assert.equal(document.activeElement,launcher);
    await act(async()=>launcher.click());
    assert.equal(considered,0);
    await act(async()=>button('Session 0').click());
    await act(async()=>button('Voice input').click());
    assert.equal(considered,1);
    assert.match(document.getElementById('pacifica-assistant').textContent,/Listening/);
    await act(async()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
    await act(async()=>idle());
    assert.equal(stops,1);
    assert.equal(document.getElementById('pacifica-assistant').hidden,true);
    assert.equal(document.activeElement,launcher);
    await act(async()=>launcher.click());
    assert.ok(button('Session 1'));
    assert.equal(considered,1);
  }finally{await ui.close();}
});

for (const {browser, supportedType, blobType, filename} of [
  {browser: 'Android Chrome', supportedType: 'audio/webm;codecs=opus', blobType: 'audio/webm;codecs=opus', filename: 'dictation.webm'},
  {browser: 'iOS Safari', supportedType: 'audio/mp4', blobType: 'audio/mp4;codecs=mp4a.40.2', filename: 'dictation.mp4'},
]) {
  test(browser + ' microphone adds an editable transcript and submits only after review', async () => {
    const ui = await setup();
    const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: ui.window.localStorage});
    let stops = 0;
    Object.defineProperty(navigator, 'mediaDevices', {value: {getUserMedia: async ({audio}) => {
      assert.equal(audio, true);
      return {getTracks: () => [{stop() { stops++; }}]};
    }}});
    globalThis.MediaRecorder = class {
      static isTypeSupported(type) { return type === supportedType; }
      state = 'inactive';
      mimeType = '';
      constructor(_stream, {mimeType}) { assert.equal(mimeType, supportedType); }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable?.({data: new Blob(['synthetic audio'], {type: blobType})});
        void this.onstop?.();
      }
    };
    const spoken = [];
    let playbackStops = 0;
    globalThis.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    globalThis.speechSynthesis = {speak: audio => spoken.push(audio.text), cancel: () => playbackStops++};
    const requests = [];
    globalThis.fetch = async (path, options) => {
      if (options?.method === 'POST') requests.push({path, body: options.body});
      if (path === '/api/ai/transcribe') return Response.json({text: 'Prepare a follow-up for Taylor'});
      if (path === '/api/ai/crm') return Response.json({summary: 'Draft ready', priorities: [], actions: [],
        draft: 'Hi Taylor, are you free for a quick call?', channel: 'sms', recipientIds: [5]});
      return Response.json({providerConfigured: true, configured: true, rules: []});
    };
    const props = {assistantName: 'Doxa', visible: true, workspaceId: 'test', profile: defaultWorkspaceProfile,
      leads: [{id: 5, name: 'Taylor', phone: '8185550105', smsConsent: true}], recentCalls: [],
      onActivity(){}, onApply(){}, onCreateLead(){}, onOpen(){}, onCall(){}};
    try {
      const assistant = callBusy => React.createElement(AssistantLauncher, {
        open: true, activity: 'idle', onOpen(){}, onClose(){}, away: false, blocked: false,
      }, React.createElement(AiCommandCenter, {...props, callBusy}));
      await ui.render(assistant(false));
      assert.equal(document.getElementById('assistant-label').textContent, 'Doxa');
      await act(async () => button('Voice input').click());
      assert.equal(button('Send to Doxa').disabled, true);
      await act(async () => button('Finish recording').click());
      assert.equal(stops, 1);
      assert.deepEqual(requests.map(request => request.path), ['/api/ai/transcribe']);
      const audio = requests[0].body.get('audio');
      assert.equal(audio.type, blobType.split(';')[0]);
      assert.equal(audio.name, filename);
      const input = document.querySelector('[aria-label="Message Doxa"]');
      assert.equal(input.value, 'Prepare a follow-up for Taylor');
      await act(async () => {
        Object.getOwnPropertyDescriptor(ui.window.HTMLTextAreaElement.prototype, 'value').set.call(input, 'Draft a text for Taylor');
        input.dispatchEvent(new ui.window.Event('input', {bubbles: true}));
      });
      await act(async () => button('Send to Doxa').click());
      assert.deepEqual(requests.map(request => request.path), ['/api/ai/transcribe', '/api/ai/crm']);
      assert.match(requests[1].body, /Draft a text for Taylor/);
      assert.equal(document.querySelector('.ai-assistant-message header b').textContent, 'Doxa');
      assert.match(document.querySelector('[aria-label="Review message before sending"]').value, /Hi Taylor/);
      assert.deepEqual(spoken, []);
      await act(async () => button('Read aloud').click());
      assert.deepEqual(spoken, [document.querySelector('.ai-assistant-message p').textContent]);
      assert.ok(button('Stop playback'));
      await act(async () => button('Voice input').click());
      assert.equal(playbackStops, 1);
      assert.ok(button('Finish recording'));
      await ui.render(assistant(true));
      assert.equal(stops, 2);
      assert.equal(button('Voice input').disabled, true);
      assert.equal(button('Read aloud').disabled, true);
      assert.equal(requests.length, 2);
      await ui.render(assistant(false));
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
      await act(async () => button('Voice input').click());
      assert.equal(playbackStops, 1);
      assert.ok(button('Read aloud'));
      assert.match(document.querySelector('[role="alert"]').textContent, /Allow microphone access/);
      assert.equal(requests.length, 2);
    } finally {
      await ui.close();
      if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
      else delete globalThis.localStorage;
    }
  });
}

test('the floating assistant keeps an explicit display name', async () => {
  const ui = await setup();
  try {
    await ui.render(React.createElement(AssistantLauncher, {
      name: 'Custom Assistant', open: true, activity: 'idle', onOpen(){}, onClose(){}, away: false, blocked: false,
    }));
    assert.equal(document.getElementById('assistant-label').textContent, 'Custom Assistant');
    assert.ok(button('Close Custom Assistant'));
  } finally {
    await ui.close();
  }
});
