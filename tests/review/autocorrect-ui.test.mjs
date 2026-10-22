import test from 'node:test';import assert from 'node:assert/strict';
import React,{act} from 'react';import {createRoot} from 'react-dom/client';import {JSDOM} from 'jsdom';
import AutocorrectDefaults from '../../app/components/AutocorrectDefaults.tsx';

test('prose editors receive autocorrect while explicitly excluded fields stay untouched',async()=>{
 const dom=new JSDOM('<div id="root"></div>');Object.assign(globalThis,{window:dom.window,document:dom.window.document,Element:dom.window.Element,HTMLInputElement:dom.window.HTMLInputElement,HTMLTextAreaElement:dom.window.HTMLTextAreaElement,FocusEvent:dom.window.FocusEvent,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById('root'));
 try{await act(async()=>root.render(React.createElement(React.Fragment,null,React.createElement(AutocorrectDefaults),React.createElement('textarea',{'aria-label':'Notes'}),React.createElement('input',{'aria-label':'Email subject'}),React.createElement('textarea',{spellCheck:false,'aria-label':'Exact code'}))));const [notes,exact]=document.querySelectorAll('textarea'),subject=document.querySelector('input');assert.equal(notes.getAttribute('autocorrect'),'on');assert.equal(notes.getAttribute('autocapitalize'),'sentences');assert.equal(subject.getAttribute('autocorrect'),'on');assert.equal(exact.getAttribute('autocorrect'),null)}finally{await act(async()=>root.unmount());dom.window.close()}
});

test('typing a typo updates a controlled editor and Undo restores the original',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',pretendToBeVisual:true});Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,Element:dom.window.Element,HTMLInputElement:dom.window.HTMLInputElement,HTMLTextAreaElement:dom.window.HTMLTextAreaElement,FocusEvent:dom.window.FocusEvent,IS_REACT_ACT_ENVIRONMENT:true});const root=createRoot(document.getElementById('root'));
 function Editor(){const [value,setValue]=React.useState('');return React.createElement(React.Fragment,null,React.createElement(AutocorrectDefaults),React.createElement('textarea',{'aria-label':'Message',value,onChange:e=>setValue(e.target.value)}),React.createElement('output',null,value))}
 try{
  await act(async()=>root.render(React.createElement(Editor)));const input=document.querySelector('textarea');await act(async()=>input.focus());
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'teh ');input.setSelectionRange(4,4);input.dispatchEvent(new window.InputEvent('input',{bubbles:true,inputType:'insertText',data:' '}));});
  assert.equal(input.value,'the ');assert.equal(document.querySelector('output').textContent,'the ');assert.match(document.querySelector('.autocorrect-toolbar').textContent,/teh → the/);
  await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Undo').click());assert.equal(input.value,'teh ');assert.equal(document.querySelector('output').textContent,'teh ');
 }finally{await act(async()=>root.unmount());dom.window.close()}
});
