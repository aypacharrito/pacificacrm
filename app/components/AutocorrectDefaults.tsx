"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {useLanguage} from './LanguageProvider';
import {proseCorrection} from '../lib/prose-correction';
type Editor=HTMLInputElement|HTMLTextAreaElement;
const selector='textarea:not([spellcheck="false"]),input[aria-label*="subject" i]:not([spellcheck="false"]),input[data-prose="true"]:not([spellcheck="false"])';
const key='pacifica:autocorrect';
function snapshot(){try{return localStorage.getItem(key)!=='off'}catch{return true}}
function subscribe(fn:()=>void){window.addEventListener('storage',fn);window.addEventListener('pacifica:autocorrect',fn);return()=>{window.removeEventListener('storage',fn);window.removeEventListener('pacifica:autocorrect',fn)}}
function editor(value:EventTarget|null):value is Editor{return value instanceof HTMLInputElement||value instanceof HTMLTextAreaElement}
function enable(element:Element){if(!editor(element))return;if(!element.hasAttribute('spellcheck'))element.spellcheck=true;element.setAttribute('autocorrect','on');element.setAttribute('autocapitalize','sentences')}
function replaceValue(target:Editor,value:string,caret:number){const proto=target instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(target,value);target.dispatchEvent(new window.InputEvent('input',{bubbles:true,inputType:'insertReplacementText'}));target.setSelectionRange(caret,caret)}
export default function AutocorrectDefaults(){
 const enabled=useSyncExternalStore(subscribe,snapshot,()=>true),{writingLanguage}=useLanguage();
 const [active,setActive]=useState<Editor|null>(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[hasUndo,setHasUndo]=useState(false);
 const changing=useRef(false),undo=useRef<{target:Editor;before:string;after:string;caret:number}|null>(null);
 useEffect(()=>{
  document.querySelectorAll(selector).forEach(enable);
  const focus=(event:FocusEvent)=>{if(editor(event.target)&&event.target.matches(selector)){enable(event.target);setActive(event.target);setStatus('')}};
  const input=(event:Event)=>{
   const e=event as InputEvent,target=e.target;
   if(!enabled||changing.current||e.isComposing||e.inputType!=='insertText'||!editor(target)||!target.matches(selector)||target.readOnly||target.disabled||target.selectionStart!==target.selectionEnd)return;
   const correction=proseCorrection(target.value,target.selectionStart??target.value.length,writingLanguage);if(!correction)return;
   undo.current={target,before:target.value,after:correction.value,caret:target.selectionStart??0};
   setHasUndo(true);changing.current=true;try{replaceValue(target,correction.value,correction.caret)}finally{changing.current=false}
   setStatus(`${correction.before} → ${correction.after}`);
  };
  const blur=()=>queueMicrotask(()=>{const target=document.activeElement;if(target?.closest('.autocorrect-toolbar')||editor(target)&&target.matches(selector))return;setActive(null)});
  document.addEventListener('focusin',focus);document.addEventListener('input',input);document.addEventListener('focusout',blur);
  return()=>{document.removeEventListener('focusin',focus);document.removeEventListener('input',input);document.removeEventListener('focusout',blur)};
 },[enabled,writingLanguage]);
 function toggle(){try{localStorage.setItem(key,enabled?'off':'on')}catch{}window.dispatchEvent(new Event('pacifica:autocorrect'))}
 function undoCorrection(){const last=undo.current;if(!last||!last.target.isConnected||last.target.value!==last.after){setStatus('Text changed; undo is no longer available.');return}changing.current=true;try{replaceValue(last.target,last.before,last.caret);last.target.focus()}finally{changing.current=false}undo.current=null;setHasUndo(false);setStatus('Correction undone')}
 async function polish(){if(!active||busy||!active.value.trim())return;const target=active,before=target.value;setBusy(true);setStatus('Checking grammar…');try{const response=await fetch('/api/ai/proofread',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:before,language:writingLanguage})});const data=await response.json();if(!response.ok)throw Error(data.error||'Grammar check unavailable');if(!target.isConnected||target.value!==before){setStatus('Text changed while checking. Your edits were kept.');return}undo.current={target,before,after:data.text,caret:target.selectionStart??before.length};setHasUndo(true);changing.current=true;try{replaceValue(target,data.text,data.text.length)}finally{changing.current=false}target.focus();setStatus('Grammar corrected')}catch(e){setStatus(e instanceof Error?e.message:'Grammar check unavailable')}finally{setBusy(false)}}
 return active?<div className="autocorrect-toolbar" role="region" aria-label="Writing assistance" onPointerDown={e=>e.preventDefault()}><button type="button" aria-pressed={enabled} onClick={toggle}>Autocorrect {enabled?'on':'off'}</button><button type="button" disabled={busy} onClick={()=>void polish()}>{busy?'Checking…':'Fix grammar'}</button>{hasUndo&&<button type="button" onClick={undoCorrection}>Undo</button>}<span role="status" aria-live="polite">{status}</span></div>:null;
}
