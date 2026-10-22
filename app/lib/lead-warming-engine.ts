import {SmsBudgetError} from "./sms-budget";
import {assertAutomatedContact} from "./automated-contact";
import {createHash} from 'node:crypto';
import {automationWorkspaces,readStoredWorkspace,updateStoredWorkspace,type StoredWorkspace} from './workspace-storage';
import {workspaceAutomationAccess} from './clerk-access';
import {cleanAiControl,matchesOutreach,inOutreachWindow} from './ai-control';
import {aiTextLockReason} from './ai-sms-recipients';
import {hasContactPermission} from './contact-permission';
import {appendCommunication} from './communications';
import {automatedSmsBody,emailWithComplianceFooter} from './message-footer';
import {outboundSmsStatus,sendOutboundSms} from './outbound-sms';
import {outboundEmailStatus,sendOutboundEmail,inboundReplyAddress} from './outbound-email';
import {classifyWarmingReply,draftWarmingReply,requestedFollowUp,type ReplyIntent} from './lead-warming-ai';
import {cleanWarming,latestInbound,outboundHistory,phoneKey,renewalReady,smsSegments,warmingWindow,type WarmingLead,type NurtureState} from './lead-warming-policy';
const day=86400000;
function same(a:WarmingLead,b:WarmingLead){return a.id===b.id||Boolean(phoneKey(a.phone)&&phoneKey(a.phone)===phoneKey(b.phone))||Boolean(a.email&&b.email&&a.email.toLowerCase()===b.email.toLowerCase());}
function copies(w:StoredWorkspace,l:WarmingLead){return (w.leads as WarmingLead[]).filter(x=>same(x,l));}
function stopped(l:WarmingLead){return l.deletedAt||l.doNotCall||l.smsOptOut||l.emailOptOut||aiTextLockReason(l);}
export function replyState(intent:ReplyIntent,body:string,now=new Date()):Partial<WarmingLead>{
 const date=requestedFollowUp(intent.renewalEvidence,now),high=intent.confidence>=.9;
 const phase:NurtureState['phase']=!high?'review':intent.intent==='declined'?'closed':intent.intent==='interested'?'interested':intent.intent==='later'&&date&&intent.reconnectPermission?'snoozed':'review';
 const renewal=/renew|renov|renueva|vence/i.test(body);
 const resume=phase==='snoozed'&&date&&intent.reconnectPermission?new Date(Math.max(now.getTime()+60000,Date.parse(date.at)-(renewal?30*day:0))).toISOString():undefined;
 return {nurture:{phase,smsExhausted:false,summary:intent.summary,language:intent.language,reviewedAt:now.toISOString(),renewalDate:date?.precision==='date'?date.date:undefined,renewalMonth:date?.precision==='month'?date.date.slice(0,7):undefined,resumeAt:resume,resumePermission:Boolean(resume),nextAction:phase==='snoozed'?'Follow up at the requested date':phase==='interested'?'Call this interested contact':intent.intent==='later'?'Ask for renewal timing and permission':'Review and answer this reply'},followUp:resume||now.toISOString(),...(phase==='interested'?{outcome:'Interested',status:'Interested',stage:'Follow-up',automationEnabled:false,automationNextAt:'',automationStatus:'interested'}:{}),...(phase==='closed'?{stage:'Closed',outcome:'Not interested',status:'Closed',doNotCall:true,automationEnabled:false,automationNextAt:'',automationStatus:'complete'}:{}),automationUpdatedAt:now.toISOString(),workflowUpdatedAt:now.toISOString()};
}
function shortText(w:StoredWorkspace,l:WarmingLead,second:boolean,language:'en'|'es'){
 const name=String(l.name||'').trim().split(/\s+/)[0].slice(0,20),sender=w.profile.agentName.trim().split(/\s+/)[0].slice(0,20);
 const options=language==='es'?[`Hola ${name}, soy ${sender}. ¿Buscas mejorar precio o cobertura?`,`Hola ${name}, ¿quieres comparar ahora o antes de renovar?`]:[`Hi ${name}, ${sender} here. Is price or coverage your main concern?`,`Hi ${name}, would you prefer to compare now or before renewal?`];
 return options[second?1:0].replace(/\s+/g,' ').trim();
}
async function claimAction(workspaceId:string,lead:WarmingLead,key:string){
 const token=crypto.randomUUID();const saved=await updateStoredWorkspace(workspaceId,w=>{
  const group=copies(w,lead);if(!group.length||group.some(stopped)||group.some(l=>l.nurture?.actions?.[key]))return w;
  return {...w,leads:(w.leads as WarmingLead[]).map(l=>same(l,lead)?{...l,nurture:{phase:'waiting',...l.nurture,actions:{...l.nurture?.actions,[key]:{token,state:'sending',at:new Date().toISOString()}}}}:l)};
 });return copies(saved,lead).some(l=>l.nurture?.actions?.[key]?.token===token)?token:null;
}
async function finishAction(workspaceId:string,lead:WarmingLead,key:string,token:string,failure:unknown=''){
 const error=failure instanceof Error?failure.message:String(failure||'');
 await updateStoredWorkspace(workspaceId,w=>({...w,leads:(w.leads as WarmingLead[]).map(l=>{
 const a=l.nurture?.actions?.[key];if(!same(l,lead)||a?.token!==token)return l;
 if(failure instanceof SmsBudgetError&&failure.reason!=='segments'){const actions={...l.nurture?.actions};delete actions[key];return {...l,nurture:{...l.nurture!,smsExhausted:failure.reason==='cap',smsRetryAt:new Date(Date.now()+86400000).toISOString(),nextAction:error,actions}};}
 return {...l,nurture:{...l.nurture!,phase:error?'review':l.nurture!.phase,lastActionAt:new Date().toISOString(),lastActionKey:key,...(error?{nextAction:'Review delivery before retrying'}:{}),actions:{...l.nurture?.actions,[key]:{...a,state:error?'review':'sent',error:error.slice(0,180)}}}};
 })}));
}
export async function runLeadWarming(options:{workspaceId?:string;workspaceLimit?:number;sendLimit?:number;deadline?:number}={}){
 const result={reviewed:0,smsSent:0,emailSent:0,interested:0,snoozed:0,blocked:0,errors:0};let attempts=0,reviews=0;
 for(const record of await automationWorkspaces(options)){
  if(Date.now()>(options.deadline??Infinity)-12000)break;
  if(!await workspaceAutomationAccess(record.workspaceId))continue;
  let w=await readStoredWorkspace(record.workspaceId);if(!w)continue;
  const settings=cleanWarming(w.profile.leadWarming),control=cleanAiControl(w.aiControl);
  if(!settings.enabled||!(control.salesEnabled??w.profile.serverAutomationEnabled))continue;
  const seen=new Set<string>();
  for(const seed of w.leads as WarmingLead[]){
   if(Date.now()>(options.deadline??Infinity)-10000||attempts>=(options.sendLimit??50))break;
   const identity=phoneKey(seed.phone)||String(seed.email||'').toLowerCase()||String(seed.id);if(seen.has(identity))continue;
   const quickInbound=latestInbound([seed]),quickAge=Date.now()-Date.parse(String(seed.received||seed.importedAt||''));
   if(stopped(seed)||!quickInbound&&!seed.nurture?.resumeAt&&(!Number.isFinite(quickAge)||quickAge>settings.maxLeadAgeDays*day))continue;
   seen.add(identity);
   w=await readStoredWorkspace(record.workspaceId);if(!w)break;
   let group=copies(w,seed),lead=group.find(l=>l.id===seed.id)||group[0];if(!lead||group.some(stopped))continue;
   const inbound=latestInbound(group),replyId=inbound&&(inbound.providerId||inbound.id);
   if(inbound&&replyId&&lead.nurture?.reviewedReplyId!==replyId){
    if(reviews>=5)continue;reviews++;
    const intent=await classifyWarmingReply(inbound),patch=replyState(intent,inbound.body);
    const saved=await updateStoredWorkspace(record.workspaceId,current=>{
     const currentGroup=copies(current,seed),latest=latestInbound(currentGroup);if(!latest||(latest.providerId||latest.id)!==replyId||currentGroup.some(stopped)||currentGroup.some(l=>l.nurture?.reviewedReplyId===replyId))return current;
     return {...current,leads:(current.leads as WarmingLead[]).map(l=>same(l,seed)?{...l,...patch,nurture:{...l.nurture,...patch.nurture!,reviewedReplyId:replyId}}:l)};
    });w=saved;group=copies(w,seed);lead=group.find(l=>l.id===seed.id)||group[0];if(!lead)continue;
    result.reviewed++;if(lead.nurture?.phase==='interested')result.interested++;if(lead.nurture?.phase==='snoozed')result.snoozed++;
    // One bounded response for a question or a not-now reply missing timing. Never invent quotes.
    if(intent.confidence>=.9&&['question','later'].includes(intent.intent)&&lead.nurture?.phase==='review'&&inbound.channel==='sms'&&!group.some(stopped)&&warmingWindow(new Date(),w.profile.automationTimezone)&&hasContactPermission(lead,w.profile,'sms')&&matchesOutreach(lead,control.rules.sms)&&inOutreachWindow(control.rules.sms)){
     const key=`reply:${replyId}`,token=await claimAction(record.workspaceId,lead,key);if(!token)continue;attempts++;
     try{let text=intent.intent==='later'?(intent.language==='es'?'¿En qué mes renueva tu seguro? ¿Te contacto antes?':'What month does your policy renew? May I follow up before then?'):await draftWarmingReply(inbound.body,w.profile,intent.language);
      if(smsSegments(automatedSmsBody(text,w.profile.businessName)).segments>settings.maxSegments)text=intent.language==='es'?'¿Buscas mejor precio o cobertura?':'What would you like to compare?';
      await sendOutboundSms({workspaceId:record.workspaceId,to:String(lead.phone||''),body:text,automated:true,scheduled:true,replyId,idempotencyKey:key});result.smsSent++;await finishAction(record.workspaceId,lead,key,token);
     }catch(e){if(e instanceof SmsBudgetError)result.blocked++;else result.errors++;await finishAction(record.workspaceId,lead,key,token,e);}
    }
    continue;
   }
   if(inbound&&!renewalReady(lead))continue;
   if(lead.nurture?.phase==='review'||lead.nurture?.phase==='closed'||lead.nurture?.phase==='interested')continue;
   if(!warmingWindow(new Date(),w.profile.automationTimezone))continue;
   const arrived=Date.parse(String(lead.received||lead.importedAt||'')),age=Date.now()-arrived;
   if(!inbound&&(!Number.isFinite(arrived)||age<300000||age>settings.maxLeadAgeDays*day))continue;
   const language=lead.nurture?.language==='es'||/^es/i.test(String(lead.preferredLanguage||lead.language||''))?'es':'en';
   const messages=outboundHistory(group,'sms'),email=outboundHistory(group,'email'),renewal=Boolean(inbound&&renewalReady(lead));
   const lastSms=Date.parse(messages.at(-1)?.sentAt||'')||0;
   const smsDue=!lead.nurture?.smsExhausted&&!(lead.nurture?.smsRetryAt&&Date.parse(lead.nurture.smsRetryAt)>Date.now())&&(renewal||messages.length<settings.maxUnansweredTexts)&&(!lastSms||Date.now()-lastSms>=settings.gapHours*3600000);
   const emailDue=!inbound&&email.length<2&&age>=(email.length?7:1)*day;
   const channel=smsDue&&phoneKey(lead.phone).length===10&&hasContactPermission(lead,w.profile,'sms')?'sms':emailDue&&hasContactPermission(lead,w.profile,'email')?'email':null;
   if(!channel||!matchesOutreach(lead,control.rules[channel])||!inOutreachWindow(control.rules[channel]))continue;
   if(channel==='sms'&&!(await outboundSmsStatus(record.workspaceId)).configured||channel==='email'&&(!outboundEmailStatus().configured||!w.profile.businessAddress))continue;
   const key=`warming:${identity}:${channel}:${renewal?lead.nurture?.resumeAt:channel==='sms'?messages.length:email.length}`,token=await claimAction(record.workspaceId,lead,key);if(!token)continue;attempts++;
   try{
    if(channel==='sms'){
     let body=renewal?(language==='es'?'Me pediste contactarte por estas fechas. ¿Quieres comparar opciones?':'You asked me to follow up around now. Would you like to compare options?'):shortText(w,lead,messages.length>0,language);
     if(smsSegments(automatedSmsBody(body,w.profile.businessName)).segments>settings.maxSegments)body=language==='es'?'¿Buscas mejor precio o cobertura?':'Is price or coverage your main concern?';
     await sendOutboundSms({workspaceId:record.workspaceId,to:String(lead.phone||''),body,automated:true,scheduled:true,idempotencyKey:key});result.smsSent++;
    }else{
     const subject=language==='es'?'Una comparación clara para tu solicitud':'A clearer comparison for your request';
     const body=language==='es'?`Hola ${String(lead.name||'').split(' ')[0]},\n\nAl comparar opciones, revisa el precio y también los deducibles y límites de cobertura. ¿Qué te importa más en tu comparación?\n\n${w.profile.agentName}\n${w.profile.businessName}`:`Hi ${String(lead.name||'').split(' ')[0]},\n\nWhen comparing options, consider the price alongside deductibles and coverage limits. What matters most in your comparison?\n\n${w.profile.agentName}\n${w.profile.businessName}`;
     await assertAutomatedContact(record.workspaceId,String(lead.email||''),'email',true);
     const finalBody=email.length?(language==='es'?`Hola ${String(lead.name||'').split(' ')[0]},\n\nSi ahora no es buen momento, ¿en qué mes renueva tu seguro? Con tu permiso, podemos retomar la comparación antes de esa fecha.\n\n${w.profile.agentName}\n${w.profile.businessName}`:`Hi ${String(lead.name||'').split(' ')[0]},\n\nIf now is not the right time, what month does your policy renew? With your permission, we can revisit a comparison before then.\n\n${w.profile.agentName}\n${w.profile.businessName}`):body;
     const receipt=await sendOutboundEmail({to:String(lead.email||''),subject,text:emailWithComplianceFooter(finalBody,w.profile),fromName:w.profile.businessName,replyTo:inboundReplyAddress(record.workspaceId)||w.profile.replyToEmail,idempotencyKey:createHash('sha256').update(`${record.workspaceId}:${key}`).digest('hex')});
     await updateStoredWorkspace(record.workspaceId,current=>({...current,leads:(current.leads as WarmingLead[]).map(l=>same(l,lead)?{...l,lastEmailAt:new Date().toISOString(),communications:appendCommunication(l.communications,{id:receipt.id,providerId:receipt.id,channel:'email',direction:'outbound',body:emailWithComplianceFooter(finalBody,w!.profile),subject,status:'sent',sentAt:new Date().toISOString(),provider:receipt.provider})}:l)}));result.emailSent++;
    }
    await finishAction(record.workspaceId,lead,key,token);
    if(renewal)await updateStoredWorkspace(record.workspaceId,current=>({...current,leads:(current.leads as WarmingLead[]).map(l=>same(l,lead)?{...l,nurture:{...l.nurture!,phase:'resting',resumePermission:false}}:l)}));
   }catch(e){if(e instanceof SmsBudgetError)result.blocked++;else result.errors++;await finishAction(record.workspaceId,lead,key,token,e);}
  }
 }
 return result;
}
