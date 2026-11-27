"use client";
import {useEffect,useState} from 'react';

type Status={available:boolean;connected:boolean;encrypted:boolean;message:string};
type Citation={name:string;locator:string;quote:string;revision:string};
type Result={status:string;title?:string;breadcrumb?:string;entry?:string;revision?:string;anchor?:number;statement?:{text?:string;kind?:string};evidence?:Citation[];candidates?:Array<{breadcrumb:string}>};
type Bridge={supportsMemberBinding?:boolean;status:()=>Promise<Status>;connect:(token:string)=>Promise<Status>;disconnect:()=>Promise<Status>;lookup:(query:string)=>Promise<Result>};
const bridge=()=>((window as Window&{pacificaDesktop?:{flintload?:Bridge}}).pacificaDesktop?.flintload);

export function FlintloadAvailable(){return typeof window!=='undefined'&&Boolean(bridge()?.supportsMemberBinding)}

export default function FlintloadCompanion({memberId,onClose}:{memberId:string;onClose:()=>void}){
 const [status,setStatus]=useState<Status|null>(null),[token,setToken]=useState(''),[query,setQuery]=useState(''),[result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;setResult(null);setStatus(null);setToken('');setError('');if(!memberId)return;bridge()?.status().then(value=>{if(live)setStatus(value)}).catch(()=>{if(live)setError('Sign in to your workspace and reopen Flintload.')});return()=>{live=false}},[memberId]);
 async function action(work:()=>Promise<Status|Result>){setBusy(true);setError('');try{return await work()}catch(reason){setResult(null);setError(reason instanceof Error?reason.message:'Flintload could not complete this request.');return null}finally{setBusy(false)}}
 return <div role="dialog" aria-modal="true" aria-label="Flintload private context" style={{position:'fixed',inset:0,zIndex:2000,background:'rgba(15,30,25,.65)',display:'grid',placeItems:'center',padding:20}}>
  <section style={{width:'min(680px,100%)',maxHeight:'85vh',overflow:'auto',background:'var(--ps-bg,#fff)',color:'var(--ps-text,#172b25)',padding:24,borderRadius:16}}>
   <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><h2>Flintload private context</h2><button type="button" onClick={onClose}>Close</button></header>
   <p>Search approved local vault entries. Passages stay in this Windows panel and are not sent to Pacifica AI or CRM notes.</p>
   {status&&<p role="status">{status.message}</p>}
   {error&&<p role="alert">{error}</p>}
   {status?.available&&status.encrypted&&!status.connected&&<form onSubmit={event=>{event.preventDefault();void action(async()=>{const next=await bridge()!.connect(token);setToken('');setStatus(next);return next})}}>
    <label>One-time Flintload Doxa grant token<input type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} required style={{display:'block',width:'100%'}}/></label>
    <p>In Flintload, select this project’s Skills → Agent access → Grant access. Select approved entries, choose Doxa, leave draft recaps off, then copy the token here.</p><button type="submit" disabled={busy}>Connect</button>
   </form>}
   {status?.connected&&<><form onSubmit={event=>{event.preventDefault();void action(async()=>{const next=await bridge()!.lookup(query);setResult(next);return next})}}>
    <label>Look up approved context<input value={query} maxLength={500} onChange={event=>setQuery(event.target.value)} placeholder="What should I know about this project?" required style={{display:'block',width:'100%'}}/></label><button type="submit" disabled={busy}>{busy?'Reading locally…':'Find cited context'}</button>
   </form><button type="button" disabled={busy} onClick={()=>void action(async()=>{const next=await bridge()!.disconnect();setStatus(next);setResult(null);return next})}>Disconnect this member</button><p>To revoke the grant itself, use Flintload’s Skills → Agent access → Revoke.</p></>}
   {result?.status==='resolved'&&<article aria-label="Flintload cited result"><h3>{result.title}</h3><p>{result.breadcrumb}</p><blockquote>{result.statement?.text}</blockquote><p>Entry {result.entry} · revision {result.revision} · statement {result.anchor}</p><h4>Evidence</h4>{result.evidence?.length?result.evidence.map((source,index)=><section key={`${source.revision}:${source.locator}:${index}`}><b>{source.name}</b><p>{source.quote}</p><small>Locator {source.locator} · source revision {source.revision}</small></section>):<p>This statement has no source citation in its approved revision.</p>}</article>}
   {result?.status==='ambiguous'&&<p>Several approved folders match. Add a project or folder name to your lookup. {result.candidates?.map(item=>item.breadcrumb).join('; ')}</p>}
   {result?.status==='no_match'&&<p>No approved passage matched. Check the grant’s entry selection in Flintload.</p>}
  </section>
 </div>;
}
