"use client";

import {useLanguage} from "./LanguageProvider";
import {memo,useCallback,useDeferredValue,useEffect,useMemo,useRef,useState} from "react";
import {aiTextLockReason,blocksAiText} from "../lib/ai-sms-recipients";
import {smsSegments,type NurtureState} from "../lib/lead-warming-policy";
import {conversationInboxStatus,matchesConversationFilter,stoppedSmsPhones} from "../lib/message-inbox";
import {emailWithComplianceFooter} from "../lib/message-footer";
import {hasContactPermission} from "../lib/contact-permission";
import {smsDeliveryLabel,smsFailureMessage} from "../lib/sms-delivery";
import {appendCommunication,mergeConversationMessages,cleanCommunications,type StoredCommunication} from "../lib/communications";
import {indexSmsByPhone,messagePriority,rankMessageLeads} from "../lib/message-priority";
import type {WorkspaceProfile} from "../lib/workspace-profile";
import {useMessageComposer} from "../hooks/use-message-composer";
import MessageAttachmentBridge,{type ComposerAttachment} from "./MessageAttachmentBridge";
import {useConversationHistory} from "../hooks/use-conversation-history";
import {loadWorkspaceSnapshot} from "../lib/workspace-snapshot";
import VoiceDictation from "./VoiceDictation";
import ReplyInterestPrompt from "./ReplyInterestPrompt";
import type {ReplyReviews} from "../lib/reply-interest";
import MessageReactions,{type SendMessageReaction} from "./MessageReactions";
import {smsReactionBody} from "../lib/message-reactions";
import MessageMedia from "./MessageMedia";
import type {MessageAttachment} from "../lib/message-attachments";
import MessageTemplateVault from "./MessageTemplateVault";
import {useScrollActivity} from "../hooks/use-scroll-activity";

export type MessageLead={nurture?:NurtureState;replyReviews?:ReplyReviews;workflowUpdatedAt?:string;automationUpdatedAt?:string;automationEnabled?:boolean;status?:string;id:number;name:string;phone:string;email:string;product:string;city:string;line:"life"|"home-auto";notes:string;stage:string;outcome:string;followUp:string;importedAt:string;lastContact:string;sourceDisposition:string;source?:string;received?:string;doNotCall:boolean;smsConsent?:boolean;smsOptOut?:boolean;lastSmsAt?:string;emailConsent?:boolean;emailOptOut?:boolean;lastEmailAt?:string;communications?:StoredCommunication[];attempts?:number;lastAttemptAt?:string;automationNextAt?:string;automationStatus?:string;priorityOverride?:"auto"|"high"|"low"};
type SmsMessage={mediaCount?:number;attachments?:MessageAttachment[];id:string;direction:string;from:string;to:string;body:string;status:string;sentAt:string;errorCode?:number|null;failureReason?:string|null};
type Channel="sms"|"email";
type EmailStatus={configured:boolean;provider:"resend"|"webhook"|"none";from:string;message:string};

const digits=(value:string)=>value.replace(/\D/g,"").slice(-10);
const firstName=(value:string)=>value.trim().split(/\s+/)[0]||"there";


function browserDraft(lead:MessageLead,profile:WorkspaceProfile,channel:Channel){
  const place=lead.city?` in ${lead.city}`:"";
  const sender=[profile.agentName,profile.businessName&&`with ${profile.businessName}`].filter(Boolean).join(" ")||"from our team";
  const callback=profile.callbackNumber?` or call ${profile.callbackNumber}`:"";
  if(channel==="email")return {subject:`Following up on your ${lead.product||"request"}`,body:`Hi ${firstName(lead.name)},\n\nThis is ${sender}. I’m following up on your request for ${lead.product||"service"}${place}. I’m available to answer questions and help with the next step. You can reply directly to this email${callback}.\n\nBest,\n${profile.emailSignature||profile.agentName||profile.businessName||"The team"}`};
  return {subject:"",body:`Hi ${firstName(lead.name)}, this is ${sender}. I’m following up on your request for ${lead.product||"service"}${place}. Are you still looking for assistance? Reply here when convenient${callback}. Reply STOP to opt out.`};
}



export default function MessagesCenter({workspaceId,profile,leads,onPatch,onProfileChange,initialLeadId,initialChannel,onOpenContact,onCloseLead,visible=true}:{visible?:boolean;workspaceId:string;profile:WorkspaceProfile;leads:MessageLead[];onPatch:(id:number,patch:Partial<MessageLead>)=>void;onProfileChange:(profile:WorkspaceProfile)=>void;initialLeadId?:number|null;initialChannel?:Channel;onOpenContact:(id:number)=>void;onCloseLead:(id:number)=>void}){
  const {t,writingLanguage}=useLanguage();
  const scrollRoot = useScrollActivity();
  const [smsMessages,setSmsMessages]=useState<SmsMessage[]>([]);
  const [twilioNumber,setTwilioNumber]=useState("");
  const [emailStatus,setEmailStatus]=useState<EmailStatus>({configured:false,provider:"none",from:"",message:"Checking email provider…"});
  const [selectedId,setSelectedId]=useState<number|null>(initialLeadId??null);
  const [channel,setChannel]=useState<Channel>(initialChannel||"sms");
  const [smsConnection,setSmsConnection]=useState<"checking"|"ready"|"error">("checking");
  const [smsSetupMessage,setSmsSetupMessage]=useState("Checking SMS sending setup…");
  const [rankingNow,setRankingNow]=useState(()=>Date.now());
  const [contactSearch,setContactSearch]=useState("");
  const [inboxFilter,setInboxFilter]=useState(()=>{const lead=leads.find(item=>item.id===initialLeadId);return lead&&(lead.stage==="Closed"||lead.doNotCall||(initialChannel==="email"?lead.emailOptOut:lead.smsOptOut))?"closed":"all"});
  const historyRef=useRef<HTMLDivElement>(null);
  const [threadOpen,setThreadOpen]=useState(Boolean(initialLeadId));
  const deliveryTimers=useRef<number[]>([]);
  const mounted=useRef(false);
  const loadingMessages=useRef(false);
  const leadSnapshot=useRef(leads);
  const patchLead=useRef(onPatch);
  const deferredSearch=useDeferredValue(contactSearch);
  const allSms=useMemo(()=>mergeConversationMessages(leads.flatMap(lead=>(lead.communications||[]).filter(message=>message.channel==="sms").map(message=>({...message,from:message.from||(message.direction==="inbound"?lead.phone:twilioNumber),to:message.to||(message.direction==="inbound"?twilioNumber:lead.phone)}))),smsMessages.map(message=>({...message,channel:"sms" as const,direction:/inbound/i.test(message.direction)?"inbound" as const:"outbound" as const,provider:"twilio",providerId:message.id,errorCode:message.errorCode??undefined,failureReason:message.failureReason||undefined}))).map(message=>({...message,from:message.from||"",to:message.to||""})),[leads,smsMessages,twilioNumber]);
  const smsByPhone=useMemo(()=>indexSmsByPhone(allSms),[allSms]);
  const stoppedPhones=useMemo(()=>stoppedSmsPhones(allSms),[allSms]);
  const inboxStatus=useMemo(()=>conversationInboxStatus(leads,channel,stoppedPhones),[leads,channel,stoppedPhones]);
  const emailByAddress=useMemo(()=>{const map=new Map<string,StoredCommunication[]>();for(const lead of leads){const key=lead.email?.toLowerCase();if(key)map.set(key,mergeConversationMessages(map.get(key)||[],(lead.communications||[]).filter(message=>message.channel==="email")))}return map},[leads]);
  const orderedLeads=useMemo(()=>rankMessageLeads(leads,allSms,channel,rankingNow),[leads,allSms,channel,rankingNow]);
  const latestMessages=useMemo(()=>{
    const latest=new Map<number,{body:string;sentAt:string;incoming:boolean}>();
    for(const lead of leads){
      const messages=channel==="sms"?(smsByPhone.get(digits(lead.phone))||[]):(emailByAddress.get(lead.email?.toLowerCase())||[]);
      const message=messages.reduce<(typeof messages)[number]|undefined>((last,item)=>!last||Date.parse(item.sentAt)>Date.parse(last.sentAt)?item:last,undefined);
      if(message)latest.set(lead.id,{body:message.body,sentAt:message.sentAt,incoming:/inbound/i.test(message.direction)});
    }
    return latest;
  },[leads,smsByPhone,emailByAddress,channel]);
  const visibleLeads=useMemo(()=>{
    const query=deferredSearch.trim().toLowerCase();
    return orderedLeads.filter(lead=>{
      const messages=channel==="sms"?(smsByPhone.get(digits(lead.phone))||[]):(emailByAddress.get(lead.email?.toLowerCase())||[]);
      if(inboxFilter==="review"&&lead.nurture?.phase!=="review")return false;
      if(!matchesConversationFilter(lead,channel,inboxFilter,Boolean(inboxStatus.get(lead.id)?.closed),messages))return false;
      return !query||[lead.name,lead.phone,lead.email,lead.city,lead.product,lead.source].some(value=>String(value||"").toLowerCase().includes(query));
    }).sort((a,b)=>Number(b.priorityOverride==="high")-Number(a.priorityOverride==="high")||(Date.parse(latestMessages.get(b.id)?.sentAt||"")||0)-(Date.parse(latestMessages.get(a.id)?.sentAt||"")||0));
  },[deferredSearch,orderedLeads,inboxFilter,latestMessages,smsByPhone,emailByAddress,channel,inboxStatus]);
  const listKey=`${channel}:${inboxFilter}:${deferredSearch}`;
  const [listWindow,setListWindow]=useState({key:"",size:60});
  const visibleCount=listWindow.key===listKey?listWindow.size:60;
  const [threadWindow,setThreadWindow]=useState({key:"",size:60});
  const selectedCandidate=visibleLeads.find(lead=>lead.id===selectedId);
  const selected=selectedCandidate||visibleLeads[0];
  const archive=useConversationHistory(selected?.id,channel,visible);
  const {subject,draft,loading,sendState,status,aiMode,setSubject,setDraft,setSendState,setStatus,setAiMode,beginRequest,endRequest}=useMessageComposer(`${selected?.id??"none"}:${channel}`);
  const [attachmentVersion,setAttachmentVersion]=useState(0);
  const [dictationActive,setDictationActive]=useState(false);
  const composerKey=`${selected?.id??"none"}:${channel}`;
  const [mediaDraft,setMediaDraft]=useState<{key:string;files:ComposerAttachment[];busy:boolean}>({key:"",files:[],busy:false});
  const onMediaChange=useCallback((files:ComposerAttachment[],busy:boolean)=>setMediaDraft({key:composerKey,files,busy}),[composerKey]);
  const mediaFiles=mediaDraft.key===composerKey?mediaDraft.files:[];
  const mediaBusy=mediaDraft.key===composerKey&&mediaDraft.busy;

  useEffect(()=>{leadSnapshot.current=leads;patchLead.current=onPatch},[leads,onPatch]);
  const load=useCallback(async()=>{
    if(loadingMessages.current||!mounted.current)return;
    loadingMessages.current=true;
    try {
    const [smsResult,emailResult,workspaceResult]=await Promise.allSettled([
      fetch("/api/twilio/messages",{cache:"no-store",credentials:"same-origin"}).then(async response=>({response,data:await response.json() as {error?:string;phone?:string;messages?:SmsMessage[];sending?:{configured:boolean;message:string}}})),
      fetch("/api/email/messages",{cache:"no-store",credentials:"same-origin"}).then(async response=>({response,data:await response.json() as EmailStatus&{error?:string}})),
      loadWorkspaceSnapshot(workspaceId).then(data=>({response:{ok:true},data:data as {leads?:MessageLead[]}})),
    ]);
    if(!mounted.current)return;
    if(smsResult.status==="fulfilled"&&smsResult.value.response.ok){
      const incoming=smsResult.value.data.messages||[];setSmsMessages(old=>JSON.stringify(old)===JSON.stringify(incoming)?old:incoming);setTwilioNumber(smsResult.value.data.phone||"");setSmsConnection(smsResult.value.data.sending?.configured?"ready":"error");setSmsSetupMessage(smsResult.value.data.sending?.message||"SMS sending readiness could not be confirmed. Refresh to check again.");
      const stopped=stoppedSmsPhones(incoming);
      for(const lead of leadSnapshot.current){if(stopped.has(digits(lead.phone))&&!lead.smsOptOut)patchLead.current(lead.id,{smsOptOut:true,smsConsent:false,doNotCall:true,stage:"Closed",outcome:"Not interested",followUp:"",sourceDisposition:"Lost - Not Interested"})}
    }else {setSmsConnection("error");setSmsSetupMessage(smsResult.status==="fulfilled"?smsResult.value.data.error||"SMS connection unavailable":"Could not reach SMS. Refresh to try again.");}
    if(workspaceResult.status==="fulfilled"&&workspaceResult.value.response.ok){
      const localById=new Map(leadSnapshot.current.map(lead=>[lead.id,lead]));
      for(const remote of workspaceResult.value.data.leads||[]){
        const local=localById.get(remote.id);if(!local)continue;
        const merged=new Map(cleanCommunications(local.communications).map(message=>[message.providerId||message.id,message]));
        for(const message of cleanCommunications(remote.communications))merged.set(message.providerId||message.id,message);
        const communications=Array.from(merged.values()).sort((a,b)=>Date.parse(a.sentAt)-Date.parse(b.sentAt));
        if(JSON.stringify(communications)!==JSON.stringify(cleanCommunications(local.communications)))patchLead.current(local.id,{communications});
      }
    }
    if(emailResult.status==="fulfilled"&&emailResult.value.response.ok)setEmailStatus(emailResult.value.data);
    else setEmailStatus({configured:false,provider:"none",from:"",message:emailResult.status==="rejected"?"Email provider check failed":emailResult.value.data.error||"Email provider not configured"});
    } finally {loadingMessages.current=false;}
  },[workspaceId]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;deliveryTimers.current.forEach(window.clearTimeout);deliveryTimers.current=[]}},[]);
  useEffect(()=>{if(!visible)return;const initial=window.setTimeout(()=>void load(),0);const timer=window.setInterval(()=>void load(),30000);return()=>{window.clearTimeout(initial);window.clearInterval(timer)}},[load,visible]);
  useEffect(()=>{if(!visible)return;const timer=window.setInterval(()=>setRankingNow(Date.now()),30000);return()=>window.clearInterval(timer)},[visible]);

  const thread=useMemo(()=>{
    if(!selected)return [];
    const inline=channel==="sms"?(smsByPhone.get(digits(selected.phone))||[]):(emailByAddress.get(selected.email?.toLowerCase())||[]);
    return mergeConversationMessages(inline as StoredCommunication[],archive.messages);
  },[smsByPhone,emailByAddress,selected,channel,archive.messages]);
  const scrollAnchor=useRef<{height:number;top:number}|null>(null);
  useEffect(()=>{const history=historyRef.current;if(!history)return;if(scrollAnchor.current){history.scrollTop=scrollAnchor.current.top+history.scrollHeight-scrollAnchor.current.height;scrollAnchor.current=null}else history.scrollTop=history.scrollHeight},[selected?.id,channel,thread.length,threadWindow]);
  async function olderMessages(){const history=historyRef.current;if(history)scrollAnchor.current={height:history.scrollHeight,top:history.scrollTop};setThreadWindow({key:composerKey,size:(threadWindow.key===composerKey?threadWindow.size:60)+60});await archive.loadMore()}
  function chooseChannel(next:Channel){if(selected)setSelectedId(selected.id);setChannel(next)}
  async function generate(lead=selected){
    if(!lead)throw new Error("Choose a contact first");
    const response=await fetch("/api/ai/message",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({lead,profile,channel,language:writingLanguage,messages:thread.slice(-10).map(message=>({direction:message.direction,body:message.body}))})});
    const data=await response.json() as {draft?:string;subject?:string;error?:string;mode?:"ai"|"smart-fallback";notice?:string};
    if(!response.ok||!data.draft)throw new Error(data.error||"AI could not draft a message");setAiMode(data.mode||"ai");if(data.notice)setStatus(data.notice);if(channel==="email")setSubject(data.subject||`Following up about your ${lead.product||"request"}`);return data.draft;
  }
  async function sendSms(lead:MessageLead,text:string,files:ComposerAttachment[]=mediaFiles){
    if(lead.smsOptOut)throw new Error("This contact replied STOP. SMS is blocked.");if(!hasContactPermission(lead,profile,"sms"))throw new Error("Document SMS consent before sending.");
    const optimistic:SmsMessage={id:`local:${crypto.randomUUID()}`,direction:"outbound-api",from:twilioNumber,to:lead.phone,body:text,status:"sending",sentAt:new Date().toISOString()};
    setSmsMessages(old=>[...old,optimistic]);
    try{
      const response=await fetch("/api/twilio/messages",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:lead.phone,body:text,mediaUrls:files.map(file=>file.url),permissionDocumented:lead.smsConsent===true,sendMode:"manual"})});const data=await response.json() as {message?:SmsMessage;error?:string};
      if(!response.ok||!data.message)throw new Error(data.error||"Text message could not be sent");
      setSmsMessages(old=>old.map(message=>message.id===optimistic.id?data.message!:message));onPatch(lead.id,{lastSmsAt:data.message.sentAt});deliveryTimers.current.forEach(window.clearTimeout);deliveryTimers.current=[2000,8000,20000].map(delay=>window.setTimeout(()=>void load(),delay));
    }catch(error){setSmsMessages(old=>old.map(message=>message.id===optimistic.id?{...message,status:"failed",failureReason:error instanceof Error?error.message:"Text message could not be sent"}:message));throw error}
  }
  async function sendEmail(lead:MessageLead,text:string){
    if(!lead.email)throw new Error("Add an email address to this contact first.");if(lead.emailOptOut)throw new Error("This contact is unsubscribed from email.");if(!hasContactPermission(lead,profile,"email"))throw new Error("Document email permission before sending.");if(!profile.businessAddress)throw new Error("Add the business mailing address under Owner Settings before sending commercial email.");
    const sentText=emailWithComplianceFooter(text,profile);const response=await fetch("/api/email/messages",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:lead.email,subject,text:sentText,attachments:mediaFiles.map(file=>({path:file.url,filename:file.name,contentType:file.type})),fromName:profile.businessName||profile.agentName,replyTo:profile.replyToEmail,leadId:lead.id,permissionDocumented:lead.emailConsent===true,idempotencyKey:`manual:${workspaceId}:${lead.id}:${crypto.randomUUID()}`})});const data=await response.json() as {message?:{id:string;provider:string;status:string;sentAt:string;attachments?:MessageAttachment[]};error?:string};if(!response.ok||!data.message)throw new Error(data.error||"Email could not be sent");const communication:StoredCommunication={id:crypto.randomUUID(),channel:"email",direction:"outbound",subject,body:sentText,status:data.message.status,sentAt:data.message.sentAt,provider:data.message.provider,attachments:data.message.attachments,providerId:data.message.id};onPatch(lead.id,{lastEmailAt:data.message.sentAt,communications:appendCommunication(lead.communications,communication)});
  }
  async function generateSelected(){if(!selected||blocksAiText(selected)||!beginRequest())return;setSelectedId(selected.id);try{setDraft(await generate());setStatus(`${channel==="email"?"Email":"Text"} draft ready for review`)}catch(error){if(writingLanguage!=="en"){setStatus(error instanceof Error?error.message:"Draft unavailable")}else if(selected){const fallback=browserDraft(selected,profile,channel);setDraft(fallback.body);setSubject(fallback.subject);setAiMode("smart-fallback");setStatus(`Pacifica created a safe local draft. ${error instanceof Error?error.message:""}`)}else setStatus("Choose a contact first")}finally{endRequest()}}
  async function sendSelected(){if(!selected||!beginRequest())return;setSelectedId(selected.id);setSendState("sending");setStatus(`Sending ${channel==="email"?"email":"text"} to ${selected.name}…`);try{if(selected.doNotCall)throw new Error("This contact is marked DNC. Outreach is blocked.");if(channel==="sms")await sendSms(selected,draft);else await sendEmail(selected,draft);setDraft("");setSubject("");setAttachmentVersion(value=>value+1);setSendState("sent");setStatus(channel==="email"?`Email submitted for ${selected.name}`:`Text submitted for ${selected.name}; awaiting delivery`);window.setTimeout(()=>setSendState("idle"),2600)}catch(error){setSendState("error");setStatus(error instanceof Error?error.message:"Send failed")}finally{endRequest()}}

  const optedOut=selected?inboxStatus.get(selected.id)?.optedOut:false;
  const consent=hasContactPermission(selected,profile,channel);
  const connectionClass=channel==="sms"?smsConnection:emailStatus.configured?"ready":"error";
  const reactionDisabledReason=optedOut?"This contact opted out. Texting is blocked.":selected?.doNotCall?"This contact is marked DNC.":!consent?"Document SMS consent before sending.":smsConnection!=="ready"?"SMS connection is not ready.":loading?"A message is being prepared or sent.":"";
  const reactionSender=useRef<SendMessageReaction>(async()=>{});
  useEffect(()=>{reactionSender.current=async(message,emoji)=>{
    if(!selected||channel!=="sms"||message.direction!=="inbound")throw Error("Open the text conversation before reacting.");
    if(reactionDisabledReason)throw Error(reactionDisabledReason);if(!beginRequest())throw Error("Wait for the current message to finish.");
    try{await sendSms(selected,smsReactionBody(message,emoji),[]);setStatus("Reaction submitted as a text reply")}finally{endRequest()}
  }});
  const sendReaction=useCallback<SendMessageReaction>((message,emoji)=>reactionSender.current(message,emoji),[]);
  const conversationButtons=useMemo(()=>visibleLeads.slice(0,visibleCount).map(lead=>{const priority=messagePriority(lead,smsByPhone.get(digits(lead.phone))||[],channel,rankingNow);const latest=latestMessages.get(lead.id);return <button key={lead.id} className={selected?.id===lead.id?"active":""} title={priority.detail} onClick={()=>{setSelectedId(lead.id);setThreadOpen(true)}}><i>{lead.name.split(" ").map(value=>value[0]).slice(0,2).join("")}</i><span><b>{lead.name}</b><small>{latest?.body||(channel==="email"?lead.email||"No email":lead.phone)}</small><small className="conversation-status">{aiTextLockReason(lead)?`${aiTextLockReason(lead)} · AI off`:priority.label}</small></span><time dateTime={latest?.sentAt}>{latest?new Date(latest.sentAt).toLocaleDateString(undefined,{month:"short",day:"numeric"}):""}</time></button>}),[visibleLeads,visibleCount,smsByPhone,channel,rankingNow,latestMessages,selected?.id]);
  return <div ref={scrollRoot} className={`messages-center channel-${channel}`}>
    <header className="module-bar messages-module-bar"><div title={channel==="sms"&&smsConnection==="error"?smsSetupMessage:undefined} className={`message-connection ${connectionClass}`}><i/>{channel==="sms"?(smsConnection==="checking"?"Checking…":smsConnection==="ready"?"SMS ready":"SMS needs attention"):(emailStatus.configured?"Email ready":"Email needs attention")}<button type="button" aria-label="Refresh message connection" onClick={()=>void load()}>↻</button></div></header>
    <div className="channel-tabs compact-channel-tabs" role="tablist" aria-label="Communication channel" onKeyDown={event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const next=event.key==="Home"?"sms":event.key==="End"?"email":channel==="sms"?"email":"sms";chooseChannel(next);document.getElementById(`message-tab-${next}`)?.focus()}}><button type="button" id="message-tab-sms" role="tab" title={twilioNumber||"SMS"} aria-controls="message-channel-panel" tabIndex={channel==="sms"?0:-1} aria-selected={channel==="sms"} className={channel==="sms"?"active":""} onClick={()=>chooseChannel("sms")}><b>SMS</b><small>{smsConnection==="ready"?twilioNumber||"Connected":"Needs setup"}</small></button><button type="button" id="message-tab-email" role="tab" title={emailStatus.from||"Email"} aria-controls="message-channel-panel" tabIndex={channel==="email"?0:-1} aria-selected={channel==="email"} className={channel==="email"?"active":""} onClick={()=>chooseChannel("email")}><b>Email</b><small>{emailStatus.configured?`${emailStatus.provider} · ${emailStatus.from}`:"Not connected"}</small></button></div>
    <div className={`messages-layout ${threadOpen?"thread-open":"inbox-open"}`} role="tabpanel" id="message-channel-panel" aria-labelledby={`message-tab-${channel}`}><aside className="message-contacts"><header><b>{t("Conversations")}</b><label className="message-contact-search"><span aria-hidden="true">⌕</span><input value={contactSearch} onChange={event=>setContactSearch(event.target.value)} placeholder={t("Search clients")} aria-label="Search clients"/>{contactSearch&&<button type="button" aria-label="Clear client search" onClick={()=>setContactSearch("")}>×</button>}</label><div className="inbox-filters" role="group" aria-label="Filter conversations">{[["all",channel==="email"?"All mail":"All"],["review","Needs review"],["replies",channel==="sms"?"Reply":"Replies"],["sent","Sent"],["closed","Closed"]].map(([value,label])=><button key={value} type="button" aria-pressed={inboxFilter===value} title={value==="replies"&&channel==="sms"?"Contacts you marked Interested":undefined} onClick={()=>setInboxFilter(value)}>{t(label)}</button>)}</div></header>{conversationButtons}{visibleLeads.length>visibleCount&&<button className="load-more" onClick={()=>setListWindow({key:listKey,size:visibleCount+60})}>Show more conversations ({visibleLeads.length-visibleCount})</button>}{!visibleLeads.length&&<p>{t(channel==="sms"&&inboxFilter==="replies"?"Mark a contact Interested to see them here.":"No matching clients")}</p>}</aside>
      <section className="message-thread" onFocusCapture={()=>{if(selected)setSelectedId(selected.id)}}>{selected?<><header><button type="button" className="message-back" onClick={()=>setThreadOpen(false)}>← Inbox</button><button type="button" className="thread-contact" onClick={()=>onOpenContact(selected.id)} aria-label={`Open contact details for ${selected.name}`}><b>{selected.name}</b><small>{selected.product} · {channel==="email"?selected.email||"No email":selected.phone}</small></button><div className="thread-contact-actions"><button type="button" aria-label="Contact info" title="Contact info" onClick={()=>onOpenContact(selected.id)}>ⓘ</button><button type="button" disabled={selected.stage==="Closed"} onClick={()=>onCloseLead(selected.id)}>{selected.stage==="Closed"?"Lead closed":"Close lead"}</button></div></header>{selected.nurture?.summary&&<aside className="nurture-summary"><b>{selected.nurture.phase==="snoozed"?"Follow-up saved":selected.nurture.phase==="interested"?"Interested":"AI review"}</b><p>{selected.nurture.summary}</p><small>{selected.nurture.nextAction}{selected.nurture.resumeAt?` · ${new Date(selected.nurture.resumeAt).toLocaleDateString()}`:""}</small></aside>}{visible&&<ReplyInterestPrompt key={composerKey} lead={selected} messages={thread} channel={channel} onPatch={onPatch}/>}<div className="message-history" ref={historyRef}>{archive.error&&<button className="load-older" onClick={()=>void archive.refresh()}>{archive.error} Retry</button>}{archive.notice&&<p role="status">{archive.notice}</p>}{archive.loading&&<p role="status">Loading saved history…</p>}{(archive.hasMore||thread.length>(threadWindow.key===composerKey?threadWindow.size:60))&&<button className="load-older" disabled={archive.loading} onClick={()=>void olderMessages()}>Show older messages</button>}{thread.slice(-(threadWindow.key===composerKey?threadWindow.size:60)).map(message=><ConversationMessage key={`${composerKey}:${message.id}`} active={visible} reactionDisabledReason={reactionDisabledReason} onReact={sendReaction} message={message} channel={channel} name={selected.name} email={selected.email} agentName={profile.agentName} sender={emailStatus.from}/>)}{!thread.length&&<div className="empty-thread"><b>No {channel} conversation</b></div>}</div><footer>{channel==="email"&&!emailStatus.configured&&<p className="email-setup-note" role="status">Email is not ready. {emailStatus.message}. Open Settings → Integrations → Email to check the sender setup.</p>}{channel==="sms"&&blocksAiText(selected)&&!optedOut&&<p className="personal-text-note">AI texting is off for this lead. You can write and send a personal text here.</p>}{optedOut&&<p className="personal-text-note">This contact opted out. Texting is blocked.</p>}<MessageTemplateVault channel={channel} lead={selected} profile={profile} subject={subject} body={draft} disabled={loading} onUse={(nextSubject,nextBody)=>{setSelectedId(selected.id);setSubject(nextSubject);setDraft(nextBody);setAiMode("template");setStatus(`Template personalized for ${selected.name}`)}} onProfileChange={onProfileChange}/>{aiMode&&<div className={`message-ai-mode ${aiMode}`}><b>{aiMode==="ai"?"Pacifica AI draft":aiMode==="template"?"Personalized template":"Pacifica Smart Fallback"}</b><span>Filled using this contact’s name, product, city, and your workspace details</span></div>}{channel==="email"&&<input className="email-subject-input" aria-label="Email subject" disabled={loading} value={subject} onChange={event=>setSubject(event.target.value)} placeholder="Email subject"/>}<textarea lang={writingLanguage} aria-label="Message body" value={draft} spellCheck={true} autoCorrect="on" autoCapitalize="sentences" inputMode="text" onChange={event=>{setDraft(event.target.value);if(sendState!=="idle"){setSendState("idle");setStatus("")}}} placeholder={optedOut?"This channel is blocked":t("Write a message…")} disabled={loading||Boolean(optedOut)}/>{!optedOut&&!selected.doNotCall&&!consent&&<p className="message-permission-note"><button type="button" onClick={()=>onOpenContact(selected.id)}>Review contact permissions</button></p>}<MessageAttachmentBridge key={`${composerKey}:${attachmentVersion}`} channel={channel} active={visible} disabled={loading||Boolean(optedOut)||Boolean(selected.doNotCall)||dictationActive} onChange={onMediaChange}/><div className="composer-actions">{channel==="sms"&&draft.trim()&&<small className="sms-segment-preview">{(()=>{const preview=smsSegments(draft);return `${preview.segments} SMS segment${preview.segments===1?"":"s"} · ${preview.encoding}`})()}</small>}{visible&&<VoiceDictation key={composerKey} disabled={loading||mediaBusy||Boolean(optedOut)} onActiveChange={setDictationActive} onText={text=>setDraft(draft?`${draft} ${text}`:text)}/>}<span className={`send-feedback ${sendState} ${status?"has-feedback":""}`} role="status" aria-live="polite">{sendState==="sending"?"Sending securely…":sendState==="sent"?"✓ Submitted":status}</span><button onClick={()=>void generateSelected()} disabled={loading||Boolean(optedOut)||blocksAiText(selected)}>{loading&&sendState!=="sending"?"Preparing draft…":t("Draft with AI")}</button><button className={`send-message ${sendState}`} title={!consent?"Document permission to enable sending":""} onClick={()=>void sendSelected()} disabled={loading||mediaBusy||(channel==="sms"&&smsConnection!=="ready")||(!draft.trim()&&!mediaFiles.length)||!consent||Boolean(optedOut)||selected.doNotCall||(channel==="email"&&(!emailStatus.configured||!subject.trim()||!selected.email||!profile.businessAddress))}>{sendState==="sending"?"Sending…":sendState==="sent"?"✓ Submitted":t("Send")}</button></div></footer></>:<div className="empty-thread"><b>{t("No contact selected")}</b></div>}</section></div>
  </div>;
}

const ConversationMessage=memo(function ConversationMessage({message,channel,name,email,agentName,sender,reactionDisabledReason,onReact,active}:{active:boolean;reactionDisabledReason:string;onReact:SendMessageReaction;message:StoredCommunication;channel:Channel;name:string;email:string;agentName:string;sender:string}){return <article className={message.direction==="inbound"||/inbound/i.test(message.direction)?"incoming":"outgoing"}>{channel==="email"&&<div className="email-message-header"><b>{message.direction==="inbound"?name:agentName||"You"}</b><span>{message.from|| (message.direction==="inbound"?email:sender)}</span></div>}{message.subject&&<b className="message-subject">{message.subject}</b>}<p>{message.body}</p><MessageMedia active={active} messageId={message.id} mediaCount={"mediaCount" in message?message.mediaCount:0} attachments={message.attachments}/><small><time dateTime={message.sentAt}>{new Date(message.sentAt).toLocaleString()}</time> · {message.channel==="sms"?smsDeliveryLabel(message.status):message.status}</small>{(message.status==="failed"||message.status==="undelivered"||message.failureReason)&&<p className="message-failure">{message.channel==="sms"?smsFailureMessage(message.errorCode??message.failureReason?.match(/\b[1-9]\d{4}\b/)?.[0]):message.failureReason||"Pacifica CRM: This email could not be delivered. Check the email address before trying again."}</p>}{channel==="sms"&&message.direction==="inbound"&&<MessageReactions message={message} disabledReason={reactionDisabledReason} onReact={onReact}/>}</article>});
