'use client';
import {useEffect,useRef,useState} from 'react';
import {folderCsvHeader,folderCsvCell,folderCsvLine,type FolderContact} from '../lib/folder-contact';
import {folderFileKey,openFolderStore,type FolderStore,type FolderFileResult} from '../lib/folder-contact-store';
import {createLocalFolderReader} from '../lib/local-folder-reader';
import {createFolderAiExtractor,FolderAiStop,folderTextHash} from '../lib/folder-ai-browser';
import {folderAiVersion} from '../lib/folder-ai';
import {downloadContactsCsv} from '../lib/contact-export';
type SaveWindow=Window&{showSaveFilePicker?:(options:{suggestedName:string;types:Array<{description:string;accept:Record<string,string[]>}>})=>Promise<{createWritable:()=>Promise<{write:(value:string)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>}>}>};
export default function LocalFolderImport({workspaceId,expanded,onClose,onOpen,onAdd,instruction=""}:{instruction?:string;workspaceId:string;expanded:boolean;onClose:()=>void;onOpen:()=>void;onAdd:(rows:FolderContact[])=>void}){
 const input=useRef<HTMLInputElement>(null),store=useRef<FolderStore|null>(null),mounted=useRef(true),controller=useRef<AbortController|null>(null),pause=useRef(false),wake=useRef<(()=>void)|null>(null);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[paused,setPaused]=useState(false),[status,setStatus]=useState('Choose a folder'),[error,setError]=useState(''),[count,setCount]=useState(0),[rows,setRows]=useState<FolderContact[]>([]),[errors,setErrors]=useState<FolderFileResult[]>([]),[progress,setProgress]=useState({done:0,total:0}),[pageStart,setPageStart]=useState(''),[pages,setPages]=useState<string[]>([]);
 const active=useRef(false),selectedFiles=useRef<File[]>([]);
 const [selectedCount,setSelectedCount]=useState(0),[mode,setMode]=useState<'ai'|'local'>('ai'),[goal,setGoal]=useState(instruction||'Find human contacts who have a full name and their own phone number. Then match those people across every file and keep useful CRM facts such as amounts, addresses and locations. Exclude business-only records.'),[usage,setUsage]=useState({phase:'identity' as 'identity'|'enrichment',requests:0,input:0,output:0,cached:0,rejected:0});
 useEffect(()=>{if(instruction&&!active.current)queueMicrotask(()=>{setGoal(instruction.slice(0,1200));setMode('ai')})},[instruction]);
 const [scanning,setScanning]=useState(false);
 useEffect(()=>{
  mounted.current=true;let disposed=false,database:FolderStore|undefined;
  void openFolderStore(workspaceId).then(async db=>{database=db;if(disposed){db.close();return}store.current=db;const [total,list,issues]=await Promise.all([db.count(),db.page(),db.errors()]);if(mounted.current){setCount(total);setRows(list);setErrors(issues);setReady(true);if(total)setStatus('Saved results · reselect the folder to resume')}}).catch(e=>{if(mounted.current)setError(e instanceof Error?e.message:'Local storage unavailable.')});
  return()=>{disposed=true;mounted.current=false;controller.current?.abort();wake.current?.();database?.close();store.current=null};
 },[workspaceId]);
 async function refresh(start=pageStart){const db=store.current;if(!db)return;const [total,list,issues]=await Promise.all([db.count(),db.page(start),db.errors()]);if(mounted.current){setCount(total);setRows(list);setErrors(issues)}}
 async function checkpoint(signal:AbortSignal){signal.throwIfAborted();if(pause.current)await new Promise<void>(resolve=>{wake.current=resolve});wake.current=null;signal.throwIfAborted()}
 function togglePause(){pause.current=!pause.current;setPaused(pause.current);if(!pause.current)wake.current?.()}
 function cancel(){controller.current?.abort();pause.current=false;setPaused(false);wake.current?.()}
 async function scan(files:File[]){
  const db=store.current;if(!db||active.current||!files.length)return;active.current=true;setBusy(true);setScanning(true);setError('');pause.current=false;setPaused(false);const control=new AbortController();controller.current=control;
  setProgress({done:0,total:files.length});setUsage({phase:'identity',requests:0,input:0,output:0,cached:0,rejected:0});let latest=0,lastRefresh=0;
  const refreshProgress=async()=>{if(Date.now()-lastRefresh<1000||!mounted.current)return;lastRefresh=Date.now();await refresh('');setPageStart('');setPages([])};
  let model='',namespace='local';
  try{if(mode==='ai'){const response=await fetch('/api/ai/folder-contacts',{cache:'no-store',signal:control.signal}),connection=await response.json();if(!response.ok||!connection.configured)throw Error(connection.error||'Connect Doxa in Settings first.');model=String(connection.model||'');namespace=folderAiVersion+':'+await folderTextHash(JSON.stringify([goal,model]))}control.signal.throwIfAborted()}catch(e){active.current=false;controller.current=null;if(mounted.current){setBusy(false);setScanning(false);setStatus(control.signal.aborted?'Stopped · saved progress kept':'Scan stopped');if(!control.signal.aborted)setError(e instanceof Error?e.message:'AI is unavailable.')}return}
  const ai=mode==='ai'?createFolderAiExtractor({store:db,signal:control.signal,checkpoint:()=>checkpoint(control.signal),goal,model,onProgress:value=>{if(mounted.current){setUsage(value);setStatus(value.phase==='identity'?'Finding people…':'Matching details across files…');void refreshProgress().catch(()=>{})}}}):undefined;
  const reader=createLocalFolderReader({extract:ai?.extract,signal:control.signal,checkpoint:()=>checkpoint(control.signal),progress:message=>{if(mounted.current&&Date.now()-latest>250){latest=Date.now();setStatus(message)}}});
  try{
   for(let index=0;index<files.length;index++){
    await checkpoint(control.signal);const file=files[index],id=namespace+':'+folderFileKey(file),name=file.webkitRelativePath||file.name;
    if((await db.file(id))?.status==='done'){setProgress({done:index+1,total:files.length});continue}
    setStatus(name);let found=0;
    try{
     for await(const batch of reader.read(file)){await checkpoint(control.signal);found+=batch.length;await db.add(batch);await refreshProgress()}
     if(!found&&mode==='local')throw Error('No contact fields found. Check this file manually.');
     await db.finish({id,name,status:'done',error:'',at:Date.now()});
    }catch(e){
     control.signal.throwIfAborted();if(e instanceof FolderAiStop)throw e;if(e instanceof DOMException&&['QuotaExceededError','InvalidStateError','AbortError'].includes(e.name))throw e;
     await db.finish({id,name,status:'error',error:e instanceof Error?e.message:'Could not read this file.',at:Date.now()});
    }
    if(mounted.current){setProgress({done:index+1,total:files.length});await refreshProgress()}
   }
   if(ai){if(mounted.current)setStatus('Matching details across files…');await ai.enrich();await refreshProgress()}
   if(mounted.current)setStatus(mode==='ai'?'AI scan complete · identities and details matched':'Local scan complete');
  }catch(e){if(mounted.current){setStatus(control.signal.aborted?'Stopped · saved progress kept':'Scan stopped');if(!control.signal.aborted)setError(e instanceof Error?e.message:'Scan failed.')}}
  finally{await reader.close().catch(()=>{});active.current=false;controller.current=null;if(mounted.current){setBusy(false);setScanning(false);setPaused(false);await refresh('')}}
 }
 async function eachRow(callback:(batch:FolderContact[])=>Promise<void>){
  const db=store.current;if(!db)return;let after='';while(true){const batch=await db.page(after,200);if(!batch.length)break;if(!mounted.current)throw new DOMException('Import window closed.','AbortError');await callback(batch);after=batch[batch.length-1].id}
 }
 async function add(){
  if(active.current)return;active.current=true;setBusy(true);setError('');
  try{await eachRow(async batch=>{onAdd(batch.filter(row=>!row.review||row.approved));await new Promise(resolve=>setTimeout(resolve,0))});if(mounted.current)setStatus('Contacts added · matching contacts enriched without overwriting saved details')}
  catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Import failed.')}
  finally{active.current=false;if(mounted.current)setBusy(false)}
 }
 async function exportCsv(){
  if(active.current)return;active.current=true;setBusy(true);setError('');
  let writable:{write:(value:string)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>}|undefined;
  try{
   const picker=(window as SaveWindow).showSaveFilePicker;
   if(picker)writable=await(await picker.call(window,{suggestedName:'pacifica-folder-contacts.csv',types:[{description:'Contacts CSV',accept:{'text/csv':['.csv']}}]})).createWritable();
   const header='\uFEFF'+folderCsvHeader.map(folderCsvCell).join(',')+'\r\n',parts:string[]=[];let size=header.length;
   if(writable)await writable.write(header);else parts.push(header);
   await eachRow(async batch=>{const text=batch.map(folderCsvLine).join('');if(writable)await writable.write(text);else{size+=text.length;if(size>32*1024*1024)throw Error('CSV is too large for this browser. Export with a browser that supports saving directly to a file.');parts.push(text)}});
   if(writable)await writable.close();else downloadContactsCsv(parts.join(''),'pacifica-folder-contacts.csv');
   if(mounted.current)setStatus('CSV exported');
  }catch(e){await writable?.abort().catch(()=>{});if(mounted.current&&!(e instanceof DOMException&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Export failed.')}
  finally{active.current=false;if(mounted.current)setBusy(false)}
 }
 async function changePage(next:string,history:string[]){await refresh(next);setPageStart(next);setPages(history)}
 if(!expanded)return <section className="folder-dock" aria-label="Folder scan"><button onClick={onOpen}><strong>{count.toLocaleString()} qualified people extracted</strong><small>{busy?status:'Human name + phone required'}</small></button>{scanning&&<button onClick={togglePause}>{paused?'Resume':'Pause'}</button>}</section>;
 return <section className="folder-panel" aria-label="Local folder contacts"><header><h2>Doxa · Scan folder</h2><button aria-label="Minimize folder scan" onClick={onClose}>−</button></header>
  <small>{mode==='ai'?'AI reads extracted text through your OpenAI connection. Files stay on this device; API usage is charged.':'Local parsing and OCR · no OpenAI usage'}</small><input ref={node=>{input.current=node;node?.setAttribute('webkitdirectory','');node?.setAttribute('directory','')}} type="file" multiple hidden onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';selectedFiles.current=files;setSelectedCount(files.length);setStatus(files.length.toLocaleString()+' files selected')}}/>
  <div className="folder-actions"><button disabled={!ready||busy} onClick={()=>input.current?.click()}>Choose folder</button><button className="primary" disabled={!ready||busy||!selectedCount} onClick={()=>void scan(selectedFiles.current)}>{mode==='ai'?'Scan with AI':'Scan locally'}</button>{scanning&&<><button onClick={togglePause}>{paused?'Resume':'Pause'}</button><button onClick={cancel}>Stop</button></>}</div>
  <div className="folder-options"><label>Reading mode<select disabled={busy} aria-label="Folder reading mode" value={mode} onChange={e=>setMode(e.target.value as 'ai'|'local')}><option value="ai">Doxa</option><option value="local">Local parser</option></select></label>{mode==='ai'&&<><label>Find<textarea aria-label="Folder scan instructions" disabled={busy} maxLength={1200} value={goal} spellCheck autoCorrect="on" autoCapitalize="sentences" inputMode="text" onChange={e=>setGoal(e.target.value)}/></label></>}</div>
  {mode==='ai'&&usage.requests+usage.cached>0&&<small>{usage.phase==='identity'?'Pass 1 · finding names and numbers':'Pass 2 · matching money, address, location and other facts'} · {usage.requests} requests · {usage.cached} cached · {(usage.input+usage.output).toLocaleString()} reported tokens{usage.rejected?' · '+usage.rejected+' unverified results excluded':''}</small>}
  <p role="status">{paused?'Paused':status}</p>{progress.total>0&&<><progress aria-label="Folder progress" max={progress.total} value={progress.done}/><small>{progress.done.toLocaleString()} / {progress.total.toLocaleString()} files · {count.toLocaleString()} contacts</small></>}
  {error&&<p role="alert">{error}</p>}
  <div className="folder-actions"><button disabled={busy||!count} onClick={()=>void add()}>Add ready contacts</button><button disabled={busy||!count} onClick={()=>void exportCsv()}>Export CSV</button></div>
  {rows.map(row=><article className="folder-row" key={row.id}><div><strong>{row.name}</strong><small>{[row.phone,row.email,row.address,row.city,row.state,row.zip,row.product].filter(Boolean).join(' · ')}</small>{!!Object.keys(row.importedFields||{}).length&&<details><summary>All extracted fields</summary>{Object.entries(row.importedFields||{}).map(([label,value])=><small key={label}>{label}: {value}</small>)}</details>}<small>{row.sourceFile} · {row.sourcePage}</small>{(row.sources?.length||0)>1&&<details><summary>{row.sources!.length} sources</summary>{row.sources!.map((source,index)=><small key={index}>{source.file} · {source.page}</small>)}</details>}{row.review&&!row.approved&&<small>{row.review}</small>}{!!row.conflicts?.length&&<details><summary>Conflicting details</summary>{row.conflicts.map((item,index)=><small key={index}>{item.field}: {item.value} · {item.file} · {item.page}</small>)}</details>}</div>{row.review&&!row.approved&&<button disabled={busy} onClick={()=>void store.current?.approve(row.id).then(()=>refresh()).catch(e=>setError(e.message))}>Approve</button>}</article>)}
  <div className="folder-actions"><button disabled={busy||!pages.length} onClick={()=>void changePage(pages.at(-1)||'',pages.slice(0,-1))}>Previous</button><button disabled={busy||rows.length<50} onClick={()=>void changePage(rows.at(-1)?.id||'',[...pages,pageStart])}>Next</button></div>
  {errors.length>0&&<details><summary>{errors.length.toLocaleString()}{errors.length===100?'+':''} files need attention</summary><ul>{errors.map(file=><li key={file.id}>{file.name}: {file.error}</li>)}</ul>{errors.length===100&&<small>Showing the first 100 files.</small>}</details>}
  <details><summary>Scan details</summary><p>Reads the selected folder and its subfolders. AI mode first extracts only a human full name and that person’s phone number. It then searches every saved text section for those identities and enriches matches with money, address, location, policy and other useful non-sensitive facts. Files stay on this device; only extracted text sections are sent through your connected OpenAI account. Local mode stays entirely on this device. OCR uses English. Unclear results need approval. Adding results fills empty fields only when the full name and phone match an existing contact; saved details, notes, consent and call history stay intact. PDF limit: 256 MB per file. Image limit: 64 MB. TXT/MD/LOG/JSON/VCF limit: 32 MB. CSV and TSV are read in chunks.</p><p>Keep Pacifica open during the scan. Reselect the same folder to resume after a restart. Scanning continues through all supported files with no request-count limit. Both passes are cached; failed API requests stop the scan without discarding saved progress. Results stay in this browser’s local storage until cleared.</p><button disabled={busy||!ready} onClick={()=>void store.current?.clear().then(async()=>{await refresh('');setPageStart('');setPages([]);setProgress({done:0,total:0});setStatus('Local results cleared')}).catch(e=>setError(e.message))}>Clear local results</button></details>
 </section>;
}
