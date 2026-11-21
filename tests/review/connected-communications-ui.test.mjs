import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useCallback,useState} from 'react';
import {createRoot} from 'react-dom/client';
import AssistantLauncher from '../../app/components/connected/AssistantLauncher.tsx';
import VoiceDictation from '../../app/components/VoiceDictation.tsx';
import ConnectedMail from '../../app/components/connected/ConnectedMail.tsx';

async function setup(){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://preview.example.test/dashboard',pretendToBeVisual:true});
  const {window}=dom;
  const original=Object.fromEntries(['window','document','HTMLElement','Event','KeyboardEvent','requestAnimationFrame','fetch','MediaRecorder','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,globalThis[key]]));
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
    const launcher=button('Open Pacifica assistant. Ready');
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
