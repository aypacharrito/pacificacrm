"use client";
import {useRef,useState} from 'react';
import type {StoredCommunication} from '../lib/communications';
type Contact={id:number;name:string;communications?:StoredCommunication[]};
export default function AttachmentReview({leads}:{leads:Contact[]}){
 const [leadId,setLeadId]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[approved,setApproved]=useState(false),[kind,setKind]=useState<'policy'|'other'>('policy'),[savedIndex,setSavedIndex]=useState('');
 const input=useRef<HTMLInputElement>(null);
 const saved=(leads.find(lead=>String(lead.id)===leadId)?.communications||[]).flatMap(message=>(message.attachments||[]).flatMap((file,index)=>/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)&&/^\/api\/(message-media|email\/media|twilio\/messages)\//.test(file.url)?[{messageId:message.id,index,name:file.name||'Attachment',url:file.url}]:[]));
 async function review(body:Record<string,unknown>){
  if(!approved||!leadId||busy){setStatus('Choose a contact and approve AI review first.');return}
  setBusy(true);
  try{
   const response=await fetch('/api/crm/review-attachment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({leadId:Number(leadId),documentKind:kind,aiConsent:true,...body})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'File review failed.');
   setStatus(result.alreadyReviewed?'Already reviewed.':result.added?'Document context saved. Today will check it against the conversation.':'No new document details found.');
   window.dispatchEvent(new Event('pacifica:ai-review'));
  }catch(error){setStatus(error instanceof Error?error.message:'File review failed.')}
  finally{setBusy(false)}
 }
 async function upload(file:File){
  if(file.size>2_700_000){setStatus('Choose a file smaller than 2.7 MB.');return}
  if(!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(file.type)){setStatus('Use JPEG, PNG, WebP or PDF.');return}
  try{const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('File could not be read.'));reader.readAsDataURL(file)});
   await review({fileName:file.name,...(file.type==='application/pdf'?{pdf:data}:{image:data})});
  }catch{setStatus('File could not be read.')}
 }
 const selected=savedIndex===''?undefined:saved[Number(savedIndex)];
 return <details className="public-business-search"><summary>Pictures &amp; documents</summary><p>Inspect and choose a policy or other non-ID business document for AI review. Use Industry Tools for local license scanning. Saved message attachments are never reviewed automatically.</p><div className="public-records-controls">
 <label>Contact<select value={leadId} onChange={event=>{setLeadId(event.target.value);setSavedIndex('');setApproved(false)}} disabled={busy}><option value="">Choose a contact</option>{leads.map(lead=><option key={lead.id} value={lead.id}>{lead.name}</option>)}</select></label>
 <label>Document type<select value={kind} onChange={event=>{setKind(event.target.value as 'policy'|'other');setApproved(false)}} disabled={busy}><option value="policy">Policy or declaration</option><option value="other">Other non-ID business document</option></select></label>
 <label><input type="checkbox" checked={approved} onChange={event=>setApproved(event.target.checked)} disabled={busy}/> I inspected this non-ID document and have permission to send it to the external AI scanner for Today context.</label>
 <button disabled={busy||!leadId||!approved} onClick={()=>input.current?.click()}>{busy?'Reading…':'Add picture or PDF'}</button>
 <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void upload(file)}}/>
 {saved.length>0&&<><label>Saved attachment<select value={savedIndex} onChange={event=>{setSavedIndex(event.target.value);setApproved(false)}} disabled={busy}><option value="">Choose after inspecting</option>{saved.map((file,index)=><option key={`${file.messageId}:${file.index}`} value={index}>{file.name}</option>)}</select></label>{selected&&<a href={selected.url} target="_blank" rel="noopener noreferrer">Inspect selected attachment</a>}<button disabled={busy||!approved||!selected} onClick={()=>{if(selected)void review({messageId:selected.messageId,index:selected.index})}}>Review selected attachment</button></>}
 </div><p role="status">{status}</p></details>;
}
