'use client';
import {useState} from 'react';
import type {SyntheticTowingResult} from '../lib/integon-value-diagnostic';

export default function IntegonSyntheticDiagnostic(){
 const [limit,setLimit]=useState<25|35|50>(35);
 const [result,setResult]=useState<SyntheticTowingResult|null>(null);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 async function run(){
  setBusy(true);setError('');setResult(null);
  try{
   const response=await fetch('/api/crm/opportunities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'synthetic-towing-diagnostic',scenario:{scenario:'synthetic-only',limit}})});
   if(!response.ok)throw Error('The internal diagnostic is unavailable.');
   const data=await response.json();setResult(data.diagnostic);
  }catch{setError('The internal diagnostic is unavailable.')}finally{setBusy(false)}
 }
 return <details aria-label="Integon synthetic table exercise">
  <summary>Integon Preferred: synthetic table exercise</summary>
  <p>Internal arithmetic from the physical page 74 Towing and Labor table. Page 73 has a different Value Option base. No policy, customer, term or effective date is used. Carrier quote required.</p>
  <label>Synthetic per-occurrence limit
   <select value={limit} onChange={event=>{setLimit(Number(event.target.value) as 25|35|50);setResult(null)}}>
    <option value={25}>$25</option><option value={35}>$35</option><option value={50}>$50</option>
   </select>
  </label>
  <button disabled={busy} onClick={()=>void run()}>Show partial table arithmetic</button>
  {error&&<p role="alert">{error}</p>}
  {result&&<div role="status"><p>{result.base} × {result.factor} = {result.partialProduct} (unrounded, partial table product)</p><p>{result.disclaimer}</p><ul>{result.provenance.map(source=><li key={source}>{source}</li>)}</ul></div>}
 </details>;
}
