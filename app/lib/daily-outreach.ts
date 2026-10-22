import {cleanWarming} from "./lead-warming-policy";
import {createHash} from 'node:crypto';
import {cleanAiControl,inOutreachWindow,matchesOutreach} from './ai-control';
import {smsRecipients,emailRecipients} from './ai-sms-recipients';
import {hasContactPermission} from './contact-permission';
import {automationWorkspaces,updateStoredWorkspace,type StoredWorkspace} from './workspace-storage';
import {workspaceAutomationAccess} from './clerk-access';
import {appendCommunication,cleanCommunications,type StoredCommunication} from './communications';
import {renderCommunicationTemplate,starterCommunicationTemplates} from './message-templates';
import {personalizeAutomationMessage} from './ai-outreach';
import {outboundSmsStatus,sendOutboundSms} from './outbound-sms';
import {outboundEmailStatus,sendOutboundEmail,inboundReplyAddress} from './outbound-email';
import {assertAutomatedContact} from './automated-contact';
import {emailWithComplianceFooter} from './message-footer';

type Channel='sms'|'email';
export type DailyReceipt={day:string;claim:string;state:'sending'|'sent'|'review';at:string;error?:string;providerId?:string};
type Lead=Record<string,unknown>&{source?:string;smsConsent?:boolean;smsOptOut?:boolean;emailConsent?:boolean;emailOptOut?:boolean;doNotCall?:boolean;deletedAt?:string;id:number;name:string;phone:string;email?:string;dailyOutreach?:Partial<Record<Channel,DailyReceipt>>};
export function localOutreachDay(now:Date,timeZone:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),get=(key:string)=>parts.find(p=>p.type===key)!.value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
const address=(l:Lead,c:Channel)=>c==='sms'?String(l.phone||'').replace(/\D/g,'').slice(-10):String(l.email||'').trim().toLowerCase();
export function dailyCandidates(workspace:StoredWorkspace,channel:Channel,now=new Date()){
 if(cleanWarming(workspace.profile.leadWarming).enabled)return [];
 const control=cleanAiControl(workspace.aiControl),rule=control.rules[channel];
 if(!(control.salesEnabled??workspace.profile.serverAutomationEnabled)||!rule?.dailyAt||!inOutreachWindow(rule,now))return [];
 const day=localOutreachDay(now,rule.timeZone),leads=workspace.leads as Lead[],limit=Math.min(3,Math.max(1,workspace.profile.maxAutomatedTouchesPerLeadPerDay||1));
 const unavailable=new Set(leads.filter(lead=>!matchesOutreach(lead,rule)||lead.dailyOutreach?.[channel]?.day===day||cleanCommunications(lead.communications).filter(m=>m.direction==='outbound'&&!/fail|blocked|error|task/i.test(m.status)&&Number.isFinite(Date.parse(m.sentAt))&&localOutreachDay(new Date(m.sentAt),rule.timeZone)===day).length>=limit).map(l=>address(l,channel)));
 return (channel==='sms'?smsRecipients:emailRecipients)(leads,lead=>hasContactPermission(lead,workspace.profile,channel)&&!unavailable.has(address(lead,channel)));
}
/** Claim is durable before contacting the provider. Unknown delivery is never automatically retried. */
export function claimDailyOutreach(workspace:StoredWorkspace,leadId:number,channel:Channel,claim:string,now=new Date()){
 const lead=dailyCandidates(workspace,channel,now).find(l=>l.id===leadId);
 if(!lead)return workspace;
 const rule=cleanAiControl(workspace.aiControl).rules[channel]!;
 const receipt:DailyReceipt={day:localOutreachDay(now,rule.timeZone),claim,state:'sending',at:now.toISOString()};
 return {...workspace,leads:(workspace.leads as Lead[]).map(l=>address(l,channel)===address(lead,channel)?{...l,dailyOutreach:{...l.dailyOutreach,[channel]:receipt}}:l)};
}
export async function runDailyOutreach(options:{workspaceId?:string;workspaceLimit?:number;sendLimit?:number;deadline?:number}={}){
 const deadline=options.deadline??Date.now()+45000,summary={due:0,sent:0,failed:0,unavailable:0},records=await automationWorkspaces(options);
 let attempted=0;
 for(const record of records){
  if(Date.now()>deadline-20000||attempted>=(options.sendLimit??100))break;
  if(!await workspaceAutomationAccess(record.workspaceId))continue;
  for(const channel of ['sms','email'] as const){
   const candidates=dailyCandidates(record.workspace,channel);summary.due+=candidates.length;
   if(!candidates.length)continue;
   const ready=channel==='sms'?await outboundSmsStatus(record.workspaceId):outboundEmailStatus();
   if(!ready.configured){summary.unavailable+=candidates.length;continue;}
   // Bounded concurrency keeps one slow/invalid number from holding the entire queue.
   let cursor=0;
   await Promise.all(Array.from({length:3},async()=>{
    while(cursor<candidates.length&&attempted<(options.sendLimit??100)&&Date.now()<deadline-20000){
     const lead=candidates[cursor++];attempted++;
     const claim=crypto.randomUUID();
     let current:StoredWorkspace;
     try{current=await updateStoredWorkspace(record.workspaceId,w=>claimDailyOutreach(w,lead.id,channel,claim));}catch{summary.failed++;continue;}
     const claimed=(current.leads as Lead[]).find(l=>l.id===lead.id);
     if(claimed?.dailyOutreach?.[channel]?.claim!==claim)continue;
     let communication:StoredCommunication|undefined,error='';
     try{
      const profile=current.profile;
      const templateId=channel==='sms'?'starter-gentle-follow-up':'starter-email-follow-up';
      const template=profile.communicationTemplates.find(t=>t.id===templateId)||starterCommunicationTemplates.find(t=>t.id===templateId)!;
      const context={...claimed,name:claimed.name,product:String(claimed.product||''),city:String(claimed.city||'')};
      const rendered=await personalizeAutomationMessage({profile,lead:claimed,channel,subject:renderCommunicationTemplate(template.subject,context,profile),body:renderCommunicationTemplate(template.body,context,profile),timeoutMs:3500});
      if(channel==='sms'){
       const result=await sendOutboundSms({workspaceId:record.workspaceId,to:claimed.phone,body:rendered.body,automated:true,scheduled:true,deadline});communication=result.communication;
      }else{
       if(!profile.businessAddress)throw Error('Add the business mailing address in Settings.');
       await assertAutomatedContact(record.workspaceId,claimed.email||'',channel,true);
       const body=emailWithComplianceFooter(rendered.body,profile),receipt=claimed.dailyOutreach![channel]!;
       const key=createHash('sha256').update(`${record.workspaceId}:${address(claimed,channel)}:${receipt.day}`).digest('hex');
       const result=await sendOutboundEmail({to:claimed.email!,subject:rendered.subject,fromName:profile.businessName||profile.agentName,replyTo:inboundReplyAddress(record.workspaceId)||profile.replyToEmail,text:body,deadline,idempotencyKey:`daily:${key}`});
       communication={id:result.id,providerId:result.id,channel,direction:'outbound',body,subject:rendered.subject,status:'sent',provider:result.provider,sentAt:new Date().toISOString()};
      }
      summary.sent++;
     }catch(e){error=e instanceof Error?e.message:'Delivery could not be confirmed.';summary.failed++;}
     // Save each result immediately. A timeout leaves a visible receipt, never an untracked retry.
     await updateStoredWorkspace(record.workspaceId,w=>({...w,leads:(w.leads as Lead[]).map(l=>{
      const receipt=l.dailyOutreach?.[channel];if(receipt?.claim!==claim)return l;
      return {...l,dailyOutreach:{...l.dailyOutreach,[channel]:{...receipt,state:communication?'sent':'review',error:error.slice(0,300),providerId:communication?.providerId}},...(communication?{communications:appendCommunication(l.communications,communication),[channel==='sms'?'lastSmsAt':'lastEmailAt']:communication.sentAt}:{})};
     })})).catch(()=>{summary.failed++});
    }
   }));
  }
 }
 return summary;
}
