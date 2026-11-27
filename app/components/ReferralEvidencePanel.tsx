'use client';
import {useRef,useState} from 'react';
import type {QuoteEvidenceStage,QuoteSubmission} from '../lib/quote-intake';

const stages:{id:QuoteEvidenceStage;label:string}[]=[
 {id:'carrier_quote',label:'Carrier quote evidence'},
 {id:'customer_acceptance',label:'Customer acceptance evidence'},
 {id:'binder_evidence',label:'Binder evidence'},
];

export default function ReferralEvidencePanel({submissions,onRefresh}:{submissions:QuoteSubmission[];onRefresh:()=>Promise<void>}){
 const [selected,setSelected]=useState(''),[reference,setReference]=useState('');
 const [agencyAuthorized,setAgencyAuthorized]=useState(false),[licensedAgentAttestation,setLicensedAgentAttestation]=useState(false);
 const [attested,setAttested]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const requestId=useRef('');
 const submission=submissions.find(s=>s.id===selected)||submissions[0];
 const stage=stages.find(item=>!submission?.evidence?.some(record=>record.stage===item.id));

 async function record(){
  if(!submission||!stage||busy)return;
  setBusy(true);setMessage('');
  try{
   requestId.current||=crypto.randomUUID();
   const response=await fetch('/api/crm/opportunities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'record-evidence',id:submission.id,evidenceId:requestId.current,stage:stage.id,reference,agencyAuthorized,licensedAgentAttestation,attested})});
   const data=await response.json();
   if(!response.ok)throw Error(data.error||'Evidence could not be recorded.');
   requestId.current='';setReference('');setAgencyAuthorized(false);setLicensedAgentAttestation(false);setAttested(false);
   await onRefresh();setMessage('Agency evidence recorded. Provider verification remains unavailable.');
  }catch(error){setMessage(error instanceof Error?error.message:'Evidence could not be recorded. Retry this form.')}finally{setBusy(false)}
 }

 return <section><h2>Agency evidence ledger</h2><p>Only the designated agency owner may record external evidence they personally reviewed. This is an agency attestation, not independent carrier verification. Do not enter premiums, customer identifiers, documents or links here.</p>
 {!submissions.length?<p>No reviewed vehicle partner requests.</p>:<><label>Reviewed request<select value={submission?.id||''} onChange={e=>{setSelected(e.target.value);requestId.current='';setReference('')}}>{submissions.map(item=><option key={item.id} value={item.id}>{item.details.name} · {item.id}</option>)}</select></label>
 {submission?.evidence?.map(item=><p key={item.id}>{stages.find(stage=>stage.id===item.stage)?.label}: agency recorded, provider unverified · {item.reference} · {new Date(item.recordedAt).toLocaleString()}</p>)}
 {stage?<><h3>{stage.label}</h3><p>{stage.id==='binder_evidence'?'Recording binder evidence does not confirm binding. Carrier confirmation is unavailable.':'The agency must verify this outside Pacifica before recording its evidence reference.'}</p><label>External reference (no personal details)<input value={reference} maxLength={80} onChange={e=>{setReference(e.target.value);requestId.current=''}}/></label><label><input type="checkbox" checked={agencyAuthorized} onChange={e=>setAgencyAuthorized(e.target.checked)}/> I am designated by this insurance agency to record this request.</label><label><input type="checkbox" checked={licensedAgentAttestation} onChange={e=>setLicensedAgentAttestation(e.target.checked)}/> I attest I am the licensed agent responsible for this review; Pacifica has not verified my license.</label><label><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/> I personally reviewed the external evidence for this stage.</label><button type="button" disabled={busy||!reference||!agencyAuthorized||!licensedAgentAttestation||!attested} onClick={()=>void record()}>{busy?'Recording…':'Record agency evidence'}</button></>:<p>All agency evidence stages recorded. Carrier confirmation and binding remain unverified.</p>}</>}
 {message&&<p role="status">{message}</p>}</section>;
}
