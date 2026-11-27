'use client';
import {useRef,useState} from 'react';
import QuoteDesk from './QuoteDesk';
import VinLookupField from './VinLookupField';
import type {QuoteLead} from '../lib/quote-readiness';
import type {WorkspaceMode} from '../lib/workspace-profile';
type ScanOptions={kind:'license'|'policy';aiConsent:boolean};
export default function IndustryTools({mode,leads,onScan,onManual,scanBusy,...actions}:{mode:WorkspaceMode;leads:QuoteLead[];onScan:(files:File[],options:ScanOptions)=>void;onManual:()=>void;scanBusy:boolean;onOpen:(id:number)=>void;onQuote:(id:number)=>void;onQuoted:(id:number)=>void;onCollect:(id:number)=>void}){
 const [vin,setVin]=useState(''),[vehicle,setVehicle]=useState(''),[kind,setKind]=useState<ScanOptions['kind']>('license'),[permission,setPermission]=useState(false),[aiConsent,setAiConsent]=useState(false);
 const camera=useRef<HTMLInputElement>(null),picker=useRef<HTMLInputElement>(null);
 const receive=(files:FileList|null)=>{if(files?.length&&permission)onScan(Array.from(files),{kind,aiConsent:kind==='policy'&&aiConsent})};
 return <section className="industry-tools"><header className="module-bar"><div><span className="eyebrow">INDUSTRY TOOLS</span><h1>{mode==='insurance'?'Quote preparation':'Document intake'}</h1></div></header>
 <details><summary>Scan license or policy</summary><p>Choose the document and confirm permission to capture it for contact entry. Local barcode/OCR reads an editable draft; the original is not saved to the CRM.</p>
 <label>Document type<select value={kind} onChange={event=>{setKind(event.target.value as ScanOptions['kind']);setAiConsent(false)}}><option value="license">Driver license</option><option value="policy">Policy or declaration</option></select></label>
 <label><input type="checkbox" checked={permission} onChange={event=>setPermission(event.target.checked)}/> I have permission to capture this document for contact entry.</label>
 {kind==='license'?<p>License images are read on this device only. External AI license scanning is unavailable in this pilot.</p>:<label><input type="checkbox" checked={aiConsent} onChange={event=>setAiConsent(event.target.checked)}/> I approve sending this policy image to the external AI scanner for transcription.</label>}
 <div className="public-records-controls"><button type="button" disabled={!permission||scanBusy} onClick={()=>camera.current?.click()}>Use rear camera</button><button type="button" disabled={!permission||scanBusy} onClick={()=>picker.current?.click()}>Choose photo or PDF</button><button type="button" onClick={onManual}>Enter fields manually</button></div>
 <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={event=>{receive(event.currentTarget.files);event.currentTarget.value=''}}/>
 <input ref={picker} type="file" accept="image/*,application/pdf,.pdf" multiple hidden onChange={event=>{receive(event.currentTarget.files);event.currentTarget.value=''}}/>
 <p>Check and correct every extracted field before saving. License numbers stay in the dedicated contact field.</p></details>

 {mode==='insurance'&&<><QuoteDesk leads={leads} {...actions}/><details className="industry-vin"><summary>VIN details</summary><VinLookupField vin={vin} vehicle={vehicle} onVin={setVin} onVehicle={setVehicle}/></details></>}
 </section>
}
