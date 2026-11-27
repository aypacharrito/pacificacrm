'use client';
import {useState} from 'react';

type Preview={leadId:number;messageId:string;dueAt:string;timezone:string;sourceQuote:string;fingerprint:string;conflicts:Array<{id:string;title:string;dueAt:string}>};
export default function CallbackReview({leadId,messageId,timezone}:{leadId:number;messageId:string;timezone:string}){
  const [localTime,setLocalTime]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');
  async function submit(action:'preview'|'confirm'){
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/calendar/member-callbacks',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',origin:window.location.origin},body:JSON.stringify({action,leadId,messageId,localTime,fingerprint:preview?.fingerprint,acknowledgeConflict:ack})});
      const data=await response.json();
      if(data.preview)setPreview(data.preview);
      if(!response.ok)throw Error(data.error||'Callback review failed.');
      if(data.item){setSaved(`Private callback saved for ${new Date(data.item.dueAt).toLocaleString()}.`);window.dispatchEvent(new Event('pacifica:private-callback-updated'))}
      else if(action==='preview'){setAck(false);setPreview(data.preview)}
    }catch(cause){setError(cause instanceof Error?cause.message:'Callback review failed.')}
    finally{setBusy(false)}
  }
  return <section className="callback-review" aria-label="Review private callback">
    <h3>Review requested callback</h3><p>Choose the exact date and time from the message. Time zone: {timezone}. CRM appointments are checked for conflicts; connected calendars are not checked here. No call or message will be sent.</p>
    <label>Callback date and time <input type="datetime-local" value={localTime} onChange={event=>{setLocalTime(event.target.value);setPreview(null);setAck(false)}}/></label>
    <button type="button" disabled={busy||!localTime} onClick={()=>void submit('preview')}>Review time and conflicts</button>
    {preview&&<div><p>Source: {preview.sourceQuote}</p><p>Proposed: {new Date(preview.dueAt).toLocaleString('en-US',{timeZone:preview.timezone,dateStyle:'full',timeStyle:'short'})} ({preview.timezone})</p>
      {preview.conflicts.length?<><p role="alert">Calendar conflict requires review:</p><ul>{preview.conflicts.map(item=><li key={item.id}>{item.title} · {new Date(item.dueAt).toLocaleString()}</li>)}</ul><label><input type="checkbox" checked={ack} onChange={event=>setAck(event.target.checked)}/> I reviewed these conflicts</label></>:<p>No overlapping CRM appointments were found.</p>}
      <button type="button" disabled={busy||Boolean(preview.conflicts.length&&!ack)} onClick={()=>void submit('confirm')}>Confirm private callback</button></div>}
    {saved&&<p role="status">{saved} Open Today or Calendar to review it.</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}
