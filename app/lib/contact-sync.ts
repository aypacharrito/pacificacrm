import {mergeContactCallDetection,type ContactCallDetection} from "./call-detection";
import {deletionState,type DeletionState} from './lead-deletion';
import type {ReplyReviews} from "./reply-interest";
type SyncedContact=DeletionState&ContactCallDetection&{id:number;phone:string;workflowUpdatedAt?:string;replyReviews?:ReplyReviews;email?:string;vendorId?:string;source?:string;providerUpdatedAt?:string;queueOverride?:boolean;quoteDetailsUpdatedAt?:string;lastInboundAt?:string;automationUpdatedAt?:string;communications?:unknown[]};
const providerFields=['name','phone','email','city','source','product','vendorId','address','state','zip','territory','brand','profileName','received','importedAt','returnStatus','employeeCount','searchPro','extraFields','providerUpdatedAt'] as const;
/** Refresh provider details while retaining local workflow and newer deletion decisions. */
export function mergeCloudContact<T extends SyncedContact>(local:T,remote:T):T{
  const newer=Date.parse(remote.providerUpdatedAt||'')>(Date.parse(local.providerUpdatedAt||'')||0);
  const deletion=deletionState(local,remote);

  const detection=mergeContactCallDetection(local,remote);
  const patch:Record<string,unknown>=detection===local?{}:{lastCallResult:detection.lastCallResult,lastCallStartedAt:detection.lastCallStartedAt,lastCallDetectionAt:detection.lastCallDetectionAt,lastDetectedCallSid:detection.lastDetectedCallSid};
  if(newer){const values=remote as unknown as Record<string,unknown>;for(const key of providerFields)if(values[key]!==undefined)patch[key]=values[key];if(!local.queueOverride&&values.line)patch.line=values.line}
  const values=remote as unknown as Record<string,unknown>;
  const localN=(local as Record<string,unknown>).nurture as {reviewedAt?:string;lastActionAt?:string}|undefined,remoteN=values.nurture as {reviewedAt?:string;lastActionAt?:string}|undefined;
  if(remoteN&&Math.max(Date.parse(remoteN.reviewedAt||"")||0,Date.parse(remoteN.lastActionAt||"")||0)>Math.max(Date.parse(localN?.reviewedAt||"")||0,Date.parse(localN?.lastActionAt||"")||0))patch.nurture=remoteN;
  if(Date.parse(remote.quoteDetailsUpdatedAt||'')>(Date.parse(local.quoteDetailsUpdatedAt||'')||0)){
    for(const key of ['quoteDetailsUpdatedAt','quoteRequests','dateOfBirth','renewalDate','vin','name','phone','email','address','city','state','zip','product','extraFields'])if(values[key]!==undefined)patch[key]=values[key];
  }

  if(Date.parse(remote.automationUpdatedAt||'')>(Date.parse(local.automationUpdatedAt||'')||0)){
    for(const key of ['automationEnabled','automationSequenceId','automationStep','automationNextAt','automationStatus','automationUpdatedAt'])if(values[key]!==undefined)patch[key]=values[key];
  }
  if(Date.parse(remote.workflowUpdatedAt||'')>(Date.parse(local.workflowUpdatedAt||'')||0)){
    for(const key of ['stage','status','outcome','sourceDisposition','followUp','automationEnabled','automationNextAt','automationStatus','automationUpdatedAt','workflowUpdatedAt'])if(values[key]!==undefined)patch[key]=values[key];
  }
  for(const channel of ['sms','email'] as const){const review=remote.replyReviews?.[channel];if(review&&Date.parse(review.at)>(Date.parse(local.replyReviews?.[channel]?.at||'')||0))patch.replyReviews={...(patch.replyReviews as ReplyReviews||local.replyReviews),[channel]:review};}
  if(Date.parse(remote.lastInboundAt||'')>(Date.parse(local.lastInboundAt||'')||0)){
    patch.lastInboundAt=remote.lastInboundAt;
    for(const key of ['smsOptOut','emailOptOut'])if(values[key]!==undefined)patch[key]=values[key];
    if(values.smsOptOut===true){
      patch.automationEnabled=false;patch.automationNextAt='';patch.automationStatus='opted out';
      for(const key of ['doNotCall','stage','status','outcome','sourceDisposition','followUp','smsConsent'])if(values[key]!==undefined)patch[key]=values[key];
    }
  }
  if(remote.communications?.length){
    const messages=new Map<string,unknown>();
    for(const raw of [...(local.communications||[]),...remote.communications]){
      if(!raw||typeof raw!=='object')continue;
      const message=raw as Record<string,unknown>;
      messages.set(String(message.providerId||message.id||JSON.stringify(raw)),raw);
    }
    const communications=Array.from(messages.values());
    if(JSON.stringify(communications)!==JSON.stringify(local.communications||[]))patch.communications=communications;
  }
  if(!Object.keys(patch).length&&(local.deletedAt||'')===deletion.deletedAt&&(local.deletionUpdatedAt||local.deletedAt||'')===deletion.deletionUpdatedAt)return local;
  return {...local,...patch,...deletion};
}
export function mergeIncomingContacts<T extends SyncedContact>(local:T[],remote:T[]):T[]{
  const phoneKey=(lead:T)=>lead.phone.replace(/\D/g,'').slice(-10),emailKey=(lead:T)=>String(lead.email||'').trim().toLowerCase();
  const decisionTime=(lead:T)=>{const time=Date.parse(lead.deletionUpdatedAt||lead.deletedAt||'');return Number.isFinite(time)?time:0};
  const decisionsByPhone=new Map<string,T>(),decisionsByEmail=new Map<string,T>();
  for(const lead of [...local,...remote]){if(!decisionTime(lead))continue;const phone=phoneKey(lead),email=emailKey(lead);if(phone.length>=7&&(!decisionsByPhone.get(phone)||decisionTime(lead)>=decisionTime(decisionsByPhone.get(phone)!)))decisionsByPhone.set(phone,lead);if(email.includes('@')&&(!decisionsByEmail.get(email)||decisionTime(lead)>=decisionTime(decisionsByEmail.get(email)!)))decisionsByEmail.set(email,lead)}
  const protect=(lead:T)=>{const phone=phoneKey(lead),email=emailKey(lead),decision=(phone.length>=7?decisionsByPhone.get(phone):undefined)||(email.includes('@')?decisionsByEmail.get(email):undefined);if(!decision)return lead;const state=deletionState(lead,decision);return (lead.deletedAt||'')===state.deletedAt&&(lead.deletionUpdatedAt||lead.deletedAt||'')===state.deletionUpdatedAt?lead:{...lead,...state} as T};
  const next=local.map(protect),ids=new Map(next.map((lead,i)=>[lead.id,i])),phones=new Map(next.map((lead,i)=>[phoneKey(lead),i]).filter(([phone])=>Boolean(phone)) as [string,number][]),emails=new Map(next.map((lead,i)=>[emailKey(lead),i]).filter(([email])=>String(email).includes('@')) as [string,number][]);let changed=false;
  for(const rawLead of remote){const lead=protect(rawLead),phone=phoneKey(lead),email=emailKey(lead),index=ids.get(lead.id)??(phone?phones.get(phone):undefined)??(email.includes('@')?emails.get(email):undefined);if(index!==undefined){const merged=mergeCloudContact(next[index],lead);if(merged!==next[index]){next[index]=merged;changed=true}continue}const indexNew=next.length;next.push(lead);ids.set(lead.id,indexNew);if(phone)phones.set(phone,indexNew);if(email.includes('@'))emails.set(email,indexNew);changed=true}
  return changed?[...next.slice(local.length),...next.slice(0,local.length)]:next.some((lead,index)=>lead!==local[index])?next:local;
}
export function contactMatches(lead:{name:string;phone:string;email:string},query:string){
  const normalize=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const haystack=normalize(`${lead.name} ${lead.phone} ${lead.email}`),digits=lead.phone.replace(/\D/g,'');
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(token=>haystack.includes(token)||(/^\+?[\d().-]+$/.test(token)&&digits.includes(token.replace(/\D/g,''))));
}
