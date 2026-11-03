/* eslint-disable @next/next/no-img-element */
"use client";
import {useLanguage} from "./LanguageProvider";
import {quoteLinkIntent} from "../lib/quote-link-intent";
import {folderScanIntent} from "../lib/folder-ai";
import ProfileAvatar from "./ProfileAvatar";
import AiControlPanel from "./AiControlPanel";
import type {ControlCommand} from "../lib/ai-control";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AiCamera from "./AiCamera";
import VoiceDictation from "./VoiceDictation";
import ConnectedPages,{type PageContext} from "./ConnectedPages";
import type {WorkspaceProfile} from "../lib/workspace-profile";
import {hasContactPermission} from "../lib/contact-permission";
import {messageChannel,cleanSmsDraft,audienceMessageTargets} from "../lib/ai-message-plan";
import {smsRecipients,emailRecipients} from "../lib/ai-sms-recipients";
import {resolveDraftReview,type DraftAudience} from "../lib/ai-draft-review";
import { leadPriority, rankLeads } from "../lib/lead-priority";
import {contactIntakeFields,contactIntakeCanSave,type ContactIntakeDetails} from '../lib/contact-intake';

type Lead = {
  id:number;name:string;phone?:string;email?:string;city:string;stage:string;outcome:string;notes:string;followUp:string;lastContact:string;
  line:"life"|"home-auto";doNotCall:boolean;source:string;product:string;leadCost:number;importedAt:string;sourceDisposition:string;
  smsConsent?:boolean;smsOptOut?:boolean;emailConsent?:boolean;emailOptOut?:boolean;deletedAt?:string;automationEnabled?:boolean;
  received?:string;attempts?:number;lastAttemptAt?:string;priorityOverride?:"auto"|"high"|"low";
};
type RecentCall={name:string;startedAt:string;duration:number;outcome:string;status:string;source:string};

type AiAction={leadId:number;leadName:string;title:string;reason:string;patch:{stage:string|null;outcome:string|null;followUp:string|null;notesToAppend:string|null}};
export type AiCreateLead=ContactIntakeDetails&{name:string;phone:string;email:string;city:string;state:string;product:string;line:"life"|"home-auto";source:string;notes:string;otherFields:Array<{label:string;value:string}>};
type AiResult={controlCommands?:ControlCommand[];controlRevision?:number;controlChanges?:string[];controlError?:string;summary:string;priorities:Array<{leadId:number;leadName:string;score:number;reason:string;nextStep:string}>;actions:AiAction[];draft:string;subject?:string;channel?:"sms"|"email";recipientIds?:number[];createLead?:AiCreateLead|null;mode?:"ai"|"smart-fallback";notice?:string};
type AiImage={id:string;name:string;dataUrl:string};
const isPdf=(file:AiImage)=>file.dataUrl.startsWith("data:application/pdf;");
async function attachmentForAi(file:File){
 if(file.type==="application/pdf"||/\.pdf$/i.test(file.name)){
  if(file.size>2_800_000)throw new Error("Use a PDF under 2.8 MB, or split it into smaller files.");
  if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=="%PDF-")throw new Error("That file is not a valid PDF.");
  return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).replace(/^data:[^;]*;/,"data:application/pdf;"));reader.onerror=()=>reject(new Error("Could not read that PDF."));reader.readAsDataURL(file)});
 }
 return imageForAi(file);
}

const quickPrompts=[
  {title:"Plan my calls",detail:"Who should I contact first today?",prompt:"Which leads should I call first today, and why?"},
  {title:"Find missed chances",detail:"Surface stalled opportunities",prompt:"Find stalled opportunities and give me the best next step for each one."},
  {title:"Prepare me",detail:"Create useful call briefs",prompt:"Prepare concise call briefs for my strongest leads."},
  {title:"Write a follow-up",detail:"Friendly, natural, and specific",prompt:"Draft a short, natural first follow-up for new leads. Let me choose the recipients."},
];

function browserAnalysis(leads:Lead[],notice:string):AiResult{
  const priorities=rankLeads(leads).slice(0,5).map(lead=>{const priority=leadPriority(lead);return {leadId:lead.id,leadName:lead.name,score:Math.max(0,priority.score),reason:priority.reason,nextStep:priority.detail}});
  return {summary:`I reviewed ${leads.length} active contact${leads.length===1?"":"s"}. Start with the first contacts below, then work scheduled follow-ups before untouched leads.`,priorities,actions:[],draft:"",createLead:null,mode:"smart-fallback",notice};
}

async function imageForAi(file:File){
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type)&&!/\.(jpe?g|png|webp)$/i.test(file.name))throw new Error("Use a JPG, PNG, or WebP image.");
  if(file.size>12*1024*1024)throw new Error("That image is too large. Use a photo under 12 MB.");
  const bitmap=await createImageBitmap(file);
  try{
    const largest=Math.max(bitmap.width,bitmap.height);const scale=Math.min(1,1800/largest);const width=Math.max(1,Math.round(bitmap.width*scale));const height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;const context=canvas.getContext("2d");if(!context)throw new Error("Could not prepare that image.");
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.drawImage(bitmap,0,0,width,height);
    let quality=.9;let dataUrl=canvas.toDataURL("image/jpeg",quality);while(dataUrl.length>2_350_000&&quality>.55){quality-=.08;dataUrl=canvas.toDataURL("image/jpeg",quality)}
    if(dataUrl.length>2_500_000)throw new Error("Crop closer to the useful information and try again.");
    return dataUrl;
  }finally{bitmap.close()}
}

export default function AiCommandCenter({clerkEnabled=false,leads,recentCalls,onApply,onCreateLead,onOpen,onCall,workspaceId,profile,onActivity,onQuoteRequests,onNavigate,callBusy=false,onAutopilot,onScanFolder,children,visible=false}:{clerkEnabled?:boolean;callBusy?:boolean;onAutopilot?:()=>void;onScanFolder?:(goal?:string)=>void;children?:ReactNode;onQuoteRequests?:()=>void;onNavigate?:(view:"messages"|"office"|"settings")=>void;visible?:boolean;onActivity:(state:"idle"|"working"|"sending"|"ready")=>void;workspaceId:string;activeLine:"life"|"home-auto";profile:WorkspaceProfile;leads:Lead[];recentCalls:RecentCall[];onApply:(action:AiAction)=>void;onCreateLead:(lead:AiCreateLead)=>void;onOpen:(leadId:number)=>void;onCall:(leadId:number)=>void}){
  const {t,writingLanguage}=useLanguage();
  const [pagesOpen,setPagesOpen]=useState(false),[pageContexts,setPageContexts]=useState<PageContext[]>([]);
  const closePages=useCallback(()=>{setPagesOpen(false);document.getElementById("ai-pages-toggle")?.focus()},[]);
  const [toolsOpen,setToolsOpen]=useState(false),[showRules,setShowRules]=useState(false),[quoteLink,setQuoteLink]=useState("");
  const toolsRef=useRef<HTMLDivElement>(null);
  const [dictating,setDictating]=useState(false);
  const [prompt,setPrompt]=useState("");const [submittedPrompt,setSubmittedPrompt]=useState("");const [submittedImages,setSubmittedImages]=useState<AiImage[]>([]);const [includeNotes,setIncludeNotes]=useState(true);const [loading,setLoading]=useState(false);const [result,setResult]=useState<AiResult|null>(null);const [error,setError]=useState("");const [applied,setApplied]=useState<number[]>([]);const [service,setService]=useState("Checking AI connection…");
  const [images,setImages]=useState<AiImage[]>([]);const [dragging,setDragging]=useState(false);const [created,setCreated]=useState(false);const imageInputRef=useRef<HTMLInputElement>(null);const [cameraOpen,setCameraOpen]=useState(false);
  const [sending,setSending]=useState(false);const [sendReport,setSendReport]=useState("");const submittedSms=useRef(new Set<string>());
  const [draftChannel,setDraftChannel]=useState<"sms"|"email">("sms");
  const composerRef=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{const field=composerRef.current;if(field){field.style.height="auto";field.style.height=`${Math.min(220,Math.max(48,field.scrollHeight))}px`}},[prompt,visible]);
  const [selectedRecipients,setSelectedRecipients]=useState<number[]>([]);
  const [audienceMode,setAudienceMode]=useState<DraftAudience>("custom");
  const [requestLeadIds,setRequestLeadIds]=useState<number[]>([]);
  const [recipientSearch,setRecipientSearch]=useState("");
  const [emailReady,setEmailReady]=useState<{configured:boolean;message:string}>({configured:false,message:"Checking email…"});
  const [history,setHistory]=useState<Array<{role:"user"|"assistant";content:string}>>([]);
  const currentLeads=useRef(leads);
  const stopSending=useRef(false);
  const sendLock=useRef(false);
  const [requestId,setRequestId]=useState("");
  useEffect(()=>{currentLeads.current=leads},[leads]);
  const allRecipients=useMemo(()=>draftChannel==="sms"?smsRecipients(leads,lead=>hasContactPermission(lead,profile,"sms")):emailRecipients(leads,lead=>hasContactPermission(lead,profile,"email")),[leads,profile,draftChannel]);
  const recipients=useMemo(()=>{const ids=new Set(requestLeadIds);return allRecipients.filter(lead=>ids.has(lead.id))},[allRecipients,requestLeadIds]);
  const selectedSet=new Set(selectedRecipients);const targets=recipients.filter(lead=>selectedSet.has(lead.id));
  const eligible=useMemo(()=>leads.filter(lead=>!lead.deletedAt&&!lead.doNotCall&&lead.stage!=="Closed"),[leads]);
  useEffect(()=>{void fetch("/api/email/messages",{credentials:"same-origin",cache:"no-store"}).then(response=>response.json()).then(data=>setEmailReady({configured:Boolean(data.configured),message:data.message||data.error||"Email is not connected"})).catch(()=>setEmailReady({configured:false,message:"Could not check email. Open Messages → Email to reconnect."}))},[]);

  useEffect(()=>{void fetch("/api/ai/crm",{cache:"no-store",credentials:"same-origin"}).then(async response=>{const data=await response.json().catch(()=>({})) as {providerConfigured?:boolean;error?:string};if(!response.ok)throw new Error(data.error||"AI service check failed");setService(data.providerConfigured?"AI enabled":"Local suggestions")}).catch(error=>setService(error instanceof Error?error.message:"AI connection unavailable"))},[]);

  useEffect(()=>{if(!toolsOpen)return;const close=(e:PointerEvent)=>{if(e.target instanceof Node&&!toolsRef.current?.contains(e.target))setToolsOpen(false)};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setToolsOpen(false)};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}},[toolsOpen]);
  useEffect(()=>{if(!visible)queueMicrotask(()=>{setQuoteLink('');setToolsOpen(false)})},[visible]);
  async function addFiles(files:FileList|File[]){
    const incoming=Array.from(files);if(!incoming.length)return;
    if(incoming.length+images.length>4){setError("Attach up to four files at a time.");return}
    try{const prepared=await Promise.all(incoming.map(async file=>({id:crypto.randomUUID(),name:file.name,dataUrl:await attachmentForAi(file)})));
      if([...images,...prepared].reduce((sum,file)=>sum+file.dataUrl.length,0)>3_800_000)throw new Error("These attachments are too large together. Send fewer files at a time.");
      setImages(current=>[...current,...prepared].slice(0,4));setError("");
    }catch(err){setError(err instanceof Error?err.message:"Could not attach that file")}

  }

  async function run(nextPrompt=prompt){
    const typed=nextPrompt.trim();const question=typed||images.length||pageContexts.length?typed||"Read the attached files and page context and summarize their contents. Do not create a contact unless I ask.":"";if(!question||loading||sending||dictating)return;
    setQuoteLink("");setToolsOpen(false);
    if(onScanFolder&&!images.length&&folderScanIntent(question)){
      const summary='Choose your folder, then select Scan with AI. I’ll extract contacts and check duplicates in the scan panel.';
      setSubmittedPrompt(question);setSubmittedImages([]);setPrompt('');setError('');setResult({summary,priorities:[],actions:[],draft:''});setRequestId(crypto.randomUUID());
      setHistory(items=>[...items,{role:'user' as const,content:question},{role:'assistant' as const,content:summary}].slice(-6));onScanFolder(question);return;
    }
    const previousReview=result?.draft?{channel:draftChannel,audience:audienceMode,recipientIds:selectedRecipients,text:result.draft,subject:result.subject}:undefined;
    const requestImages=[...images];setPrompt(typed);setLoading(true);setError("");setApplied([]);setCreated(false);setSendReport("");submittedSms.current.clear();setRequestId(crypto.randomUUID());const channel=messageChannel(question,result?draftChannel:"sms");
    const quote=images.length?null:quoteLinkIntent(question,leads);
    try{
      if(quote){if('error' in quote)throw Error(quote.error);const response=await fetch('/api/crm/opportunities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create-link',leadId:quote.leadId,source:'Pacifica AI quote request'})});const data=await response.json();if(!response.ok)throw Error(data.error||'Quote link could not be created.');if(typeof data.path!=='string'||!data.path.startsWith('/quote-request#'))throw Error('Quote link could not be created.');setQuoteLink(new URL(data.path,window.location.origin).href);setSubmittedPrompt(question);setSubmittedImages([]);setResult({summary:'Your new quote link is ready. Copy it to share. It expires in 7 days; this screen clears it after copying or leaving Pacifica AI.',priorities:[],actions:[],draft:''});setPrompt('');return;}
      const response=await fetch("/api/ai/crm",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({prompt:question,includeNotes,language:writingLanguage,draftReview:previousReview,pageContexts,images:images.filter(image=>!isPdf(image)).map(image=>image.dataUrl),documents:images.filter(isPdf).map(({name,dataUrl})=>({name,dataUrl})),leads:eligible.slice(0,100),recentCalls:recentCalls.slice(0,100),history:history.slice(-6)})});
      const data=await response.json().catch(()=>({})) as AiResult&{error?:string};if(!response.ok)throw new Error(data.error||"Pacifica could not complete that request");if(data.mode==="smart-fallback"&&previousReview){setError(`${data.notice||"AI is temporarily unavailable."} Your draft and recipients are preserved.`);return}setDraftChannel(channel);setSubmittedPrompt(question);setSubmittedImages(requestImages);setResult({...data,draft:channel==="sms"?cleanSmsDraft(data.draft||""):data.draft||""});setPrompt("");setImages([]);
      const review=resolveDraftReview(question,leads,profile,previousReview);
      const proposed=review.resolved?review.selected:review.available.filter(lead=>data.recipientIds?.includes(lead.id));
      setSelectedRecipients(proposed.map(lead=>lead.id));setAudienceMode(review.audience);setRequestLeadIds(review.scope.map(lead=>lead.id));
      if(data.draft&&review.resolved)setResult(previous=>previous?{...previous,summary:proposed.length?`Draft ready for ${proposed.length} ${review.audience==="follow-ups"?"follow-up contacts":"contacts"}. Review the message and recipients before sending.`:"Choose an audience below to select eligible recipients."}:previous);
      setHistory(items=>[...items,{role:"user" as const,content:question},{role:"assistant" as const,content:data.summary+(data.draft?`\nDraft: ${data.draft}`:"")}].slice(-6));

    }catch(err){const message=err instanceof Error?err.message:"Pacifica could not complete that request";setError(message);if(!quote&&eligible.length&&!result?.draft){setSubmittedPrompt(question);setSubmittedImages(requestImages);setResult(browserAnalysis(eligible.slice(0,100),"Pacifica used local suggestions because the AI service did not answer."))}}
    finally{setLoading(false)}
  }

  async function sendDraft(){
    if(sendLock.current||loading||dictating||!result?.draft.trim()||!targets.length)return;
    const body=draftChannel==="sms"?cleanSmsDraft(result.draft):result.draft.trim();
    if(draftChannel==="sms"&&body.length>1400){setSendReport("Shorten this text to 1,400 characters before sending.");return}
    if(draftChannel==="email"&&(!result.subject?.trim()||!emailReady.configured)){setSendReport("Add a subject and connect email in Messages before sending.");return}
    sendLock.current=true;stopSending.current=false;setSending(true);
    let submitted=0,failed=0,skipped=0;const failures:string[]=[];const planned=[...targets];const channel=draftChannel;
    try{
      for(const contact of planned){
        if(stopSending.current)break;
        const eligibleNow=channel==="sms"?smsRecipients(currentLeads.current,lead=>hasContactPermission(lead,profile,"sms")):emailRecipients(currentLeads.current,lead=>hasContactPermission(lead,profile,"email"));
        const current=eligibleNow.find(lead=>lead.id===contact.id);
        if(!current||current.phone!==contact.phone||current.email!==contact.email){skipped++;continue}
        const key=`${channel}:${channel==="sms"?contact.phone:contact.email}:${result.subject||""}:${body}`;
        if(submittedSms.current.has(key)){skipped++;continue}
        // Mark attempts before dispatch. A lost response must not cause an automatic duplicate.
        submittedSms.current.add(key);
        try{
          const payload=channel==="sms"?{to:contact.phone,body,sendMode:"ai"}:{to:contact.email,leadId:contact.id,subject:result.subject,text:body,sendMode:"ai",fromName:profile.businessName||profile.agentName,replyTo:profile.replyToEmail,idempotencyKey:`ai:${workspaceId}:${requestId}:${contact.id}`};
          const response=await fetch(channel==="sms"?"/api/twilio/messages":"/api/email/messages",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(25000)});
          const data=await response.json();if(!response.ok)throw new Error(data.error||"Send failed");
          submitted++;
        }catch(reason){failed++;failures.push(`${contact.name}: ${reason instanceof Error?reason.message:"Submission unconfirmed; check Messages before retrying."}`)}
        setSendReport(`${submitted} of ${planned.length} submitted · ${failed} failed/unconfirmed · ${skipped} skipped`);
      }
      setSendReport(`${submitted} submitted · ${failed} failed/unconfirmed · ${skipped} skipped${stopSending.current?" · remaining messages cancelled":""}. Check Messages for delivery status.${failures.length?" Issues: "+failures.slice(0,5).join("; "):""}`);
    }finally{sendLock.current=false;setSending(false)}
  }

  function reset(){setQuoteLink("");setSubmittedPrompt("");setSubmittedImages([]);setResult(null);setPrompt("");setError("");setImages([]);setCreated(false);setHistory([]);setSelectedRecipients([]);setAudienceMode("custom");setRequestLeadIds([]);setPageContexts([])}
  const seenResult=useRef<AiResult|null>(null);
  useEffect(()=>{
    if(visible)seenResult.current=result;
    onActivity(loading?"working":sending?"sending":result&&seenResult.current!==result?"ready":"idle");
  },[loading,sending,result,visible,onActivity]);
  const displayPrompt=submittedPrompt;
  const hasDetails=Boolean(result&&(result.controlCommands?.length||result.controlError||result.createLead||result.priorities.length||result.actions.length||result.draft));
  return <div className={`ai-workspace ${pagesOpen?"has-pages":""} ${hasDetails?"has-details":""}`} onDragEnter={event=>{if(Array.from(event.dataTransfer.types).includes("Files")){event.preventDefault();setDragging(true)}}} onDragOver={event=>{if(Array.from(event.dataTransfer.types).includes("Files")){event.preventDefault();event.dataTransfer.dropEffect="copy"}}} onDragLeave={event=>{if(event.currentTarget===event.target)setDragging(false)}} onDrop={event=>{event.preventDefault();event.stopPropagation();setDragging(false);void addFiles(event.dataTransfer.files)}}>
    {dragging&&<div className="ai-drop-overlay"><div><b>Drop photos or PDFs into Pacifica AI</b><span>I’ll read it together with your instructions.</span></div></div>}
    <header className="ai-shell-header"><div className="ai-shell-brand"><ProfileAvatar enabled={clerkEnabled}/><span><b>Pacifica AI</b><small role="status">{loading?"Thinking…":sending?"Sending…":service}</small></span></div><div className="ai-header-tools">{onScanFolder&&<button type="button" disabled={loading||sending} onClick={()=>onScanFolder()}>Scan folder</button>}{profile.mode==="insurance"&&onAutopilot&&<button type="button" disabled={callBusy} onClick={onAutopilot}>Ava dialer</button>}<button id="ai-pages-toggle" type="button" aria-expanded={pagesOpen} onClick={()=>setPagesOpen(value=>!value)}>Pages & connections</button><label className="ai-notes-control"><input type="checkbox" checked={includeNotes} onChange={event=>setIncludeNotes(event.target.checked)}/><span><b>{t("Use CRM context")}</b></span></label></div></header>
    <div className="ai-content-layout">
    <main className={result?"ai-chat answered":"ai-chat"}>
      {!result?<section className="ai-welcome"><h1>{t("How can I help?")}</h1><p>Talk it through, review your day, or bring a document.</p></section>:<section className="ai-conversation" aria-live="polite"><div className="ai-user-message"><span>You</span><p>{displayPrompt}</p>{submittedImages.length>0&&<div className="ai-message-images">{submittedImages.map(image=>isPdf(image)?<span key={image.id} className="ai-pdf-file">PDF · {image.name}</span>:<img key={image.id} src={image.dataUrl} alt={image.name}/>)}</div>}</div><div className="ai-assistant-message"><ProfileAvatar enabled={clerkEnabled}/><div><header><b>Pacifica</b><em className={result.mode==="smart-fallback"?"fallback":""}>{result.mode==="smart-fallback"?"Local suggestions":""}</em></header><p>{result.summary}</p>{result.notice&&<small>{result.notice}</small>}</div></div></section>}

      {!result&&<section className="ai-starters">{quickPrompts.map(item=><button key={item.title} onClick={()=>void run(item.prompt)} disabled={!eligible.length||loading||sending||dictating}><b>{item.title}</b><span>{item.detail}</span><em>→</em></button>)}</section>}

      {cameraOpen&&<AiCamera onClose={()=>setCameraOpen(false)} onCapture={file=>void addFiles([file])}/>}
      <section aria-label="Message composer" className={`ai-chat-composer ${images.length?"has-images":""}`} onPaste={event=>{const files=Array.from(event.clipboardData.files).filter(file=>file.type.startsWith("image/"));if(files.length)void addFiles(files)}}>
        {pageContexts.length>0&&<div className="ai-page-contexts">{pageContexts.map((page,index)=><span key={`${page.url}:${index}`}><b>{page.title}</b><button type="button" aria-label={`Remove page ${page.title}`} onClick={()=>setPageContexts(items=>items.filter((_,i)=>i!==index))}>×</button></span>)}</div>}{images.length>0&&<div className="ai-attachments">{images.map(image=><figure key={image.id}>{isPdf(image)?<span className="ai-pdf-file">PDF</span>:<img src={image.dataUrl} alt={image.name}/>}<button type="button" aria-label={`Remove ${image.name}`} onClick={()=>setImages(current=>current.filter(item=>item.id!==image.id))}>×</button><figcaption>{image.name}</figcaption></figure>)}{images.length<4&&<button type="button" className="ai-add-image" onClick={()=>imageInputRef.current?.click()}>＋ Add file</button>}</div>}
        <div className="ai-composer-row"><div className="ai-tools" ref={toolsRef}><button type="button" className="ai-attach-button" title="Add to your request" aria-label="Open AI tools" aria-expanded={toolsOpen} onClick={()=>setToolsOpen(open=>!open)}>+</button>{toolsOpen&&<div className="ai-tools-menu" aria-label="AI tools"><button type="button" disabled={loading||images.length>=4} onClick={()=>{setToolsOpen(false);setCameraOpen(true)}}>Use camera</button><button type="button" disabled={loading||images.length>=4} onClick={()=>{setToolsOpen(false);imageInputRef.current?.click()}}>Attach photo or PDF</button><button type="button" onClick={()=>{setShowRules(show=>!show);setToolsOpen(false)}}>Saved outreach rules</button>{onQuoteRequests&&<button type="button" onClick={()=>{onQuoteRequests();setToolsOpen(false)}}>Quote requests</button>}</div>}</div><textarea ref={composerRef} aria-label="Message Pacifica AI" value={prompt} onChange={event=>setPrompt(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void run()}}} disabled={loading||sending} lang={writingLanguage} spellCheck autoCorrect="on" placeholder={t("Message Pacifica…")} rows={1}/>{visible&&<VoiceDictation compact disabled={loading||sending} onActiveChange={setDictating} onText={text=>{setPrompt(current=>current?`${current} ${text}`:text);composerRef.current?.focus()}}/>}<button className="ai-submit" onClick={()=>void run()} disabled={loading||sending||dictating||(!prompt.trim()&&!images.length&&!pageContexts.length)} aria-label="Send to Pacifica AI">{loading?<span className="ai-thinking"/>:"↑"}</button></div>
        <input ref={imageInputRef} hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onChange={event=>{if(event.currentTarget.files)void addFiles(event.currentTarget.files);event.currentTarget.value=""}}/>

      </section>
      {!result&&!eligible.length&&!images.length&&<p className="ai-error">Import contacts for contact analysis, or attach a photo or PDF to read.</p>}{error&&<div className="ai-error" role="alert"><p>{error}</p><button type="button" disabled={loading||sending||dictating} onClick={()=>void run(prompt||submittedPrompt)}>Try again</button>{onNavigate&&<button type="button" onClick={()=>onNavigate("messages")}>Open Messages</button>}</div>}
      {quoteLink&&<div className="ai-quote-link"><label>New quote link<input readOnly value={quoteLink} onFocus={e=>e.target.select()}/></label><button onClick={()=>void navigator.clipboard.writeText(quoteLink).then(()=>setQuoteLink('')).catch(()=>setError('Select and copy the link from the field.'))}>Copy link</button><button onClick={()=>setQuoteLink('')}>Done</button></div>}
      <AiControlPanel showRules={showRules} key={requestId} requestKey={requestId} commands={loading?[]:result?.controlCommands} revision={result?.controlRevision} changes={result?.controlChanges} error={result?.controlError}/>
      {children}
    </main>

    {hasDetails&&result&&<aside className="ai-results" aria-label="CRM suggestions">
      {result.createLead&&<section className={`ai-create-lead-card ${created?"created":""}`}><header><div><span>{created?"ADDED TO CONTACTS":"NEW CONTACT FROM ATTACHMENT"}</span><h2>{result.createLead.name||"New lead"}</h2></div><em>{result.createLead.line==="home-auto"?"HOME & AUTO":"LIFE / PRIORITY"}</em></header><div className="ai-contact-review">{(["name","phone","email","city","state",...contactIntakeFields,"product","notes"] as const).map(key=><label key={key}>{key.charAt(0).toUpperCase()+key.slice(1)}<input aria-label={`Contact ${key}`} disabled={created||loading} value={result.createLead![key]||""} onChange={event=>{const value=event.target.value;setResult(current=>current?.createLead?{...current,createLead:{...current.createLead,[key]:value}}:current)}}/></label>)}<label>Queue<select disabled={created||loading} value={result.createLead.line} onChange={event=>{const line=event.target.value==="home-auto"?"home-auto":"life";setResult(current=>current?.createLead?{...current,createLead:{...current.createLead,line}}:current)}}><option value="home-auto">Home &amp; Auto</option><option value="life">Life / Priority</option></select></label></div><p>{created?"Contact added to Pacifica.":"Check the extracted details before adding this contact."}</p>{!created&&<button type="button" disabled={loading||sending} onClick={()=>{const contact=result.createLead!;if(!contactIntakeCanSave(contact)){setError("Add contact details or a name with readable ID/address details.");return;}onCreateLead(contact);setCreated(true)}}>Add to Contacts</button>}</section>}
      {result.priorities.length>0&&<section className="ai-priority-panel"><header><div><h2>Priority contacts</h2></div><em>{result.priorities.length} leads</em></header>{result.priorities.map(item=><article key={`${item.leadId}-${item.score}`}><strong>{item.score}</strong><div><b>{item.leadName}</b><p>{item.reason}</p><small>{item.nextStep}</small></div><footer><button onClick={()=>onOpen(item.leadId)}>Open</button><button onClick={()=>onCall(item.leadId)}>Call now</button></footer></article>)}</section>}
      {result.actions.length>0&&<section className="ai-actions-panel"><header><div><h2>Suggested updates</h2></div></header>{result.actions.map((action,index)=><article key={`${action.leadId}-${index}`}><div><b>{action.title}</b><span>{action.leadName}</span><p>{action.reason}</p></div><button disabled={applied.includes(index)} onClick={()=>{onApply(action);setApplied(items=>[...items,index])}}>{applied.includes(index)?"Applied":"Apply"}</button></article>)}</section>}
      {result.draft&&<section className="ai-draft-card"><header><span>{draftChannel==="email"?"EMAIL":"TEXT MESSAGE"}</span><button onClick={()=>void navigator.clipboard.writeText(result.draft)}>Copy</button></header>
        <div className="ai-channel-choice" role="group" aria-label="Send channel">{(["sms","email"] as const).map(channel=><button key={channel} type="button" disabled={sending||loading} aria-pressed={draftChannel===channel} onClick={()=>{if(draftChannel===channel)return;const review=resolveDraftReview(channel==="email"?"Use email":"Use SMS",leads,profile,{channel:draftChannel,audience:audienceMode,recipientIds:selectedRecipients,text:result.draft,subject:result.subject});setDraftChannel(channel);setSelectedRecipients(review.selected.map(l=>l.id));setRequestLeadIds(review.scope.map(l=>l.id))}}>{channel==="sms"?"Text":"Email"}</button>)}</div>
        {draftChannel==="email"&&<label className="ai-subject">Subject<input aria-label="Email subject" disabled={sending||loading} value={result.subject||""} spellCheck autoCorrect="on" autoCapitalize="sentences" inputMode="text" onChange={event=>setResult(current=>current?{...current,subject:event.target.value}:current)}/></label>}
        <textarea aria-label="Review message before sending" value={result.draft} disabled={sending||loading} spellCheck autoCorrect="on" autoCapitalize="sentences" inputMode="text" onChange={event=>{const draft=event.target.value;setResult(current=>current?{...current,draft}:current)}}/>
        <div className="ai-recipient-review"><label className="ai-audience-control">Audience<select aria-label="Message audience" disabled={sending||loading} value={audienceMode} onChange={event=>{const mode=event.target.value as DraftAudience;setAudienceMode(mode);const scope=mode==="custom"?allRecipients:audienceMessageTargets(mode,allRecipients);setRequestLeadIds(scope.map(l=>l.id));setSelectedRecipients(mode==="custom"?[]:scope.map(l=>l.id))}}><option value="custom">Choose contacts</option><option value="follow-ups">Follow-ups · {audienceMessageTargets("follow-ups",allRecipients).length}</option><option value="new-leads">New leads · {audienceMessageTargets("new-leads",allRecipients).length}</option><option value="all-eligible">All eligible · {allRecipients.length}</option></select></label><div className="ai-selection-heading"><b>Recipients · {targets.length} selected</b><div><button type="button" disabled={sending||loading||!recipients.length} onClick={()=>setSelectedRecipients(recipients.map(l=>l.id))}>Select all {recipients.length}</button><button type="button" disabled={sending||loading||!targets.length} onClick={()=>setSelectedRecipients([])}>Clear</button></div></div><p>Only contacts eligible for this channel appear here.</p>
          <input aria-label="Search message recipients" placeholder="Find a recipient" value={recipientSearch} onChange={event=>setRecipientSearch(event.target.value)}/>
          <div className="ai-recipient-list">{recipients.filter(lead=>[lead.name,lead.phone,lead.email].some(value=>String(value||"").toLowerCase().includes(recipientSearch.toLowerCase()))).map(lead=><label key={lead.id}><input type="checkbox" disabled={sending||loading} checked={selectedRecipients.includes(lead.id)} onChange={event=>setSelectedRecipients(ids=>event.target.checked?[...ids,lead.id]:ids.filter(id=>id!==lead.id))}/><span><b>{lead.name}</b><small>{draftChannel==="email"?lead.email:lead.phone}</small></span></label>)}</div>
          {!recipients.length&&<p>No eligible recipients for this request.</p>}
        </div>
        {draftChannel==="email"&&!emailReady.configured&&<p role="status">{emailReady.message}</p>}
        <p>{draftChannel==="sms"?`${result.draft.length}/1,400 characters`:`${profile.businessAddress?"Business address will be included":"Add your business mailing address in Settings"}`}</p>
        <button type="button" disabled={sending||loading||dictating||!result.draft.trim()||!targets.length||(draftChannel==="sms"&&result.draft.length>1400)||(draftChannel==="email"&&(!emailReady.configured||!result.subject?.trim()||!profile.businessAddress))} onClick={()=>void sendDraft()}>{sending?"Sending…":`Send ${draftChannel==="email"?"email":"text"} to ${targets.length} selected ${targets.length===1?"contact":"contacts"}`}</button>
        {sending&&<button type="button" onClick={()=>{stopSending.current=true;setSendReport("Stopping after the current message…")}}>Stop remaining messages</button>}
        {sendReport&&<p role="status">{sendReport}</p>}</section>}

    </aside>}
    </div>
    {pagesOpen&&visible&&<ConnectedPages workspaceId={workspaceId} onClose={closePages} onNavigate={onNavigate} onAdd={page=>{setPageContexts(items=>[...items,page].slice(-3));composerRef.current?.focus()}}/>}
    {result&&<button type="button" className="ai-new-chat" onClick={reset} disabled={loading||sending}>New request</button>}
  </div>;
}

export type {AiAction};
