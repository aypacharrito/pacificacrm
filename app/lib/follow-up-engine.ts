import {cleanWarming} from "./lead-warming-policy";
import {cleanAiControl,matchesOutreach,inOutreachWindow} from "./ai-control";
import {workspaceAutomationAccess} from "./clerk-access";
import {emailWithComplianceFooter} from "./message-footer";
import {assertAutomatedContact} from "./automated-contact";
import {blocksAutomatedText} from "./ai-sms-recipients";
import {hasContactPermission} from "./contact-permission";
import {appendCommunication,cleanCommunications,type StoredCommunication} from "./communications";
import {personalizeAutomationMessage} from "./ai-outreach"; // PACIFICA_DYNAMIC_OUTREACH_V1
import {logError,logEvent} from "./observability";
import {inboundReplyAddress,outboundEmailStatus,sendOutboundEmail} from "./outbound-email";
import {outboundSmsStatus,sendOutboundSms} from "./outbound-sms";
import {renderCommunicationTemplate,starterCommunicationTemplates} from "./message-templates";
import {deduplicateCsvLeads,type CsvManagedLead} from "./csv-lead-merge";
import {queuedProviderLeads} from "./provider-inbox";
import {mergeProviderLeads,type ProviderLeadRecord,type ProviderManagedLead} from "./provider-lead-merge";
import {automationWorkspaces,workspaceRedis,saveWorkspaceChanges} from "./workspace-storage";
import type {AutomationChannel,AutomationSequence,AutomationStep,WorkspaceProfile} from "./workspace-profile";

export type FollowUpLead={
  deletedAt?:string;id:number;name:string;phone:string;email?:string;city?:string;product:string;stage:string;outcome:string;source?:string;doNotCall:boolean;received?:string;importedAt?:string;followUp?:string;importedFields?:Record<string,unknown>;extraFields?:Record<string,unknown>;vehicle?:string;brand?:string;state?:string;territory?:string;
  smsConsent?:boolean;smsOptOut?:boolean;lastSmsAt?:string;emailConsent?:boolean;emailOptOut?:boolean;lastEmailAt?:string;communications?:StoredCommunication[];
  automationEnabled?:boolean;automationSequenceId?:string;automationStep?:number;automationNextAt?:string;automationStatus?:string;automationDeliveryFailures?:number;automationLastError?:string;automationDeadLetterAt?:string;automationUpdatedAt?:string;lastInboundAt?:string;
};

export type AutomationRun={ok:true;startedAt:string;completedAt:string;workspaces:number;changed:number;duplicatesRemoved:number;due:number;sent:number;smsSent:number;emailSent:number;tasksCreated:number;fallbacks:number;retried:number;blocked:number;deadLettered:number;failed:number};

const retryDelays=[5,15,60,240,720];
const closedOutcomes=new Set(["not interested","wrong number","sold / won"]);
const finalAutomationStatuses=new Set(["complete","needs attention","opted out"]);

function timestamp(value?:string){const result=new Date(value||"").getTime();return Number.isFinite(result)?result:Number.NaN}
function isoAfter(minutes:number,now=Date.now()){return new Date(now+Math.max(0,minutes)*60_000).toISOString()}
function leadArrival(lead:FollowUpLead){const received=timestamp(lead.received);if(Number.isFinite(received))return received;const imported=timestamp(lead.importedAt);return Number.isFinite(imported)?imported:Date.now()}
function triggerFor(lead:FollowUpLead){const outcome=lead.outcome.toLowerCase();return outcome==="no answer"||outcome==="voicemail"?"no-answer":outcome==="interested"?"interested":"new-lead"}
function sequenceFor(lead:FollowUpLead,profile:WorkspaceProfile){return lead.automationSequenceId?profile.automationSequences.find(sequence=>sequence.id===lead.automationSequenceId&&sequence.active):profile.automationSequences.find(sequence=>sequence.trigger===triggerFor(lead)&&sequence.active)}
function enabledSteps(sequence:AutomationSequence){return sequence.steps.filter(step=>step.enabled)}
function stopped(lead:FollowUpLead,sequence?:AutomationSequence){return blocksAutomatedText(lead)||Boolean(lead.deletedAt)||!sequence||lead.doNotCall||lead.stage==="Closed"||closedOutcomes.has(lead.outcome.toLowerCase())||(sequence.stopOnReply&&Boolean(lead.lastInboundAt))}

export function prepareAutomationLead(lead:FollowUpLead,profile:WorkspaceProfile,now=Date.now()):FollowUpLead{
  if(finalAutomationStatuses.has(String(lead.automationStatus||"").toLowerCase()))return {...lead,automationNextAt:""};
  const sequence=sequenceFor(lead,profile);
  if(stopped(lead,sequence))return {...lead,automationStatus:lead.lastInboundAt?"replied":"paused",automationNextAt:""};
  const steps=enabledSteps(sequence!);const stepIndex=Math.max(0,Math.round(Number(lead.automationStep)||0));
  if(stepIndex>=steps.length)return {...lead,automationStatus:"complete",automationNextAt:""};
  const existing=timestamp(lead.automationNextAt);
  const nextAt=Number.isFinite(existing)?new Date(existing).toISOString():new Date(leadArrival(lead)+steps[stepIndex].delayMinutes*60_000).toISOString();
  return {...lead,automationEnabled:true,automationSequenceId:sequence!.id,automationStep:stepIndex,automationNextAt:nextAt,automationStatus:timestamp(nextAt)<=now?"action due":"scheduled"};
}

function templateFor(step:AutomationStep,profile:WorkspaceProfile){return profile.communicationTemplates.find(template=>template.id===step.templateId)||starterCommunicationTemplates.find(template=>template.id===step.templateId)}
function compliant(lead:FollowUpLead,channel:AutomationChannel,profile:WorkspaceProfile){
  if(channel==="sms")return Boolean(hasContactPermission(lead,profile,"sms")&&lead.phone);
  if(channel==="email")return Boolean(lead.email&&hasContactPermission(lead,profile,"email"));
  return true;
}
function bodyFor(step:AutomationStep,lead:FollowUpLead,profile:WorkspaceProfile){
  const template=templateFor(step,profile);if(!template)throw new Error(`Automation template ${step.templateId||"is missing"}`);
  const templateLead={...lead,name:lead.name,product:lead.product,city:lead.city||""};
  return {subject:renderCommunicationTemplate(template.subject,templateLead,profile),body:renderCommunicationTemplate(template.body,templateLead,profile)};
}
function communication(input:Partial<StoredCommunication>&Pick<StoredCommunication,"channel"|"direction"|"body"|"status"|"sentAt"|"provider">):StoredCommunication{return {id:crypto.randomUUID(),...input}}
function providerBlocked(message:string){return /A2P|assigned|registered|configured|mailing address|consent|permission|adapter|template/i.test(message)}
function automationDay(value:string|number|Date,timeZone:string){try{return new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value))}catch{return new Date(value).toISOString().slice(0,10)}}
function automatedTouchesToday(lead:FollowUpLead,timeZone:string,now=Date.now()){const today=automationDay(now,timeZone);return cleanCommunications(lead.communications).filter(item=>item.direction==="outbound"&&!/fail|blocked|error/i.test(item.status)&&automationDay(item.sentAt,timeZone)===today).length}

async function deliver(workspaceId:string,lead:FollowUpLead,profile:WorkspaceProfile,channel:"sms"|"email",step:AutomationStep){
  const fallbackTemplate=channel==="email"?"starter-email-follow-up":"starter-gentle-follow-up";
  const deliveryStep=channel===step.channel?step:{...step,channel,templateId:fallbackTemplate};
  const baseRendered=bodyFor(deliveryStep,lead,profile);
  const rendered=await personalizeAutomationMessage({profile,lead:lead as unknown as Record<string,unknown>,channel,subject:baseRendered.subject,body:baseRendered.body});
  const sentAt=new Date().toISOString();
  if(channel==="sms"){
    const result=await sendOutboundSms({workspaceId,to:lead.phone,body:rendered.body,automated:true,scheduled:true});
    return {channel,communication:communication({channel,direction:"outbound",body:rendered.body,status:result.status,sentAt,provider:result.provider,providerId:result.id})};
  }
  if(!profile.businessAddress)throw new Error("Business mailing address is required for automated email");
  const text=emailWithComplianceFooter(rendered.body,profile);
  await assertAutomatedContact(workspaceId,lead.email||"","email",true);
  const result=await sendOutboundEmail({to:lead.email||"",subject:rendered.subject||`Following up about your ${lead.product||"request"}`,text,fromName:profile.businessName||profile.agentName,replyTo:inboundReplyAddress(workspaceId)||profile.replyToEmail,idempotencyKey:`auto:${workspaceId}:${lead.id}:${lead.automationSequenceId}:${lead.automationStep}`});
  return {channel,communication:communication({channel,direction:"outbound",subject:rendered.subject,body:text,status:"sent",sentAt,provider:result.provider,providerId:result.id})};
}

async function availableChannels(workspaceId:string,lead:FollowUpLead,profile:WorkspaceProfile,preferred:AutomationChannel){
  const emailReady=outboundEmailStatus().configured&&Boolean(profile.businessAddress);
  const smsReady=(await outboundSmsStatus(workspaceId)).configured;
  const allowed=(channel:"sms"|"email")=>compliant(lead,channel,profile)&&(channel==="sms"?smsReady:emailReady);
  const candidates:Array<"sms"|"email">=[];
  if(preferred!=="task"&&allowed(preferred))candidates.push(preferred);
  if(profile.providerFallbackEnabled){const alternate=preferred==="sms"?"email":"sms";if(allowed(alternate)&&!candidates.includes(alternate))candidates.push(alternate)}
  return candidates;
}

function nextState(lead:FollowUpLead,sequence:AutomationSequence,now=Date.now()){
  const steps=enabledSteps(sequence);const nextStep=(lead.automationStep||0)+1;
  if(nextStep>=steps.length)return {...lead,automationStep:nextStep,automationStatus:"complete",automationNextAt:"",automationDeliveryFailures:0,automationLastError:"",automationUpdatedAt:new Date(now).toISOString()};
  return {...lead,automationStep:nextStep,automationStatus:"scheduled",automationNextAt:isoAfter(steps[nextStep].delayMinutes,now),automationDeliveryFailures:0,automationLastError:"",automationUpdatedAt:new Date(now).toISOString()};
}

function createProviderLead(item:ProviderLeadRecord,index:number):FollowUpLead&ProviderManagedLead&Record<string,unknown>{const candidate=item.received||item.createdAt;const arrived=Number.isFinite(Date.parse(candidate||""))?new Date(candidate!).toISOString():new Date().toISOString();const line:"life"|"home-auto"=item.line==="home-auto"?"home-auto":"life";return {id:Date.now()*1000+(index%1000),vendorId:item.vendorId||item.id,name:item.name,phone:item.phone,email:item.email||"",city:item.city||"Imported",status:"Ready",stage:"New lead",outcome:"Not contacted",notes:item.notes||"",followUp:"",doNotCall:false,lastContact:"Never",line,source:item.source||"Lead provider",leadCost:Number(item.cost)||0,product:item.product||"Service inquiry",sourceDisposition:item.disposition||"",importedAt:item.createdAt||arrived,providerUpdatedAt:new Date().toISOString(),address:item.address||"",state:item.state||"",zip:item.zip||"",territory:item.territory||"",brand:item.brand||"",profileName:item.profileName||"",received:arrived,returnStatus:item.returnStatus||"",employeeCount:item.employeeCount||"",searchPro:item.searchPro||"",extraFields:item.extraFields||{},smsConsent:false,emailConsent:false,automationEnabled:true,automationSequenceId:"speed-to-lead",automationStep:0,automationNextAt:new Date(new Date(arrived).getTime()+5*60_000).toISOString(),automationStatus:"scheduled"}}

function assignRoundRobin<T extends {assignedTo?:string;stage?:string;doNotCall?:boolean}>(leads:T[],profile:WorkspaceProfile){
  if(profile.assignmentStrategy!=="round-robin")return leads;const members=profile.teamRoster.filter(member=>member.active);if(!members.length)return leads;
  const counts=new Map(members.map(member=>[member.name,leads.filter(lead=>lead.assignedTo===member.name&&lead.stage!=="Closed").length]));let changed=false;
  const assigned=leads.map(lead=>{if(lead.assignedTo||lead.stage==="Closed"||lead.doNotCall)return lead;const member=members.toSorted((left,right)=>(counts.get(left.name)||0)-(counts.get(right.name)||0)||left.name.localeCompare(right.name))[0];counts.set(member.name,(counts.get(member.name)||0)+1);changed=true;return {...lead,assignedTo:member.name}});
  return changed?assigned:leads;
}

export async function runFollowUpAutomation(options:{workspaceId?:string;workspaceLimit?:number;sendLimit?:number;deadline?:number}={}):Promise<AutomationRun>{
  const startedAt=new Date().toISOString();let workspaces=0,changed=0,duplicatesRemoved=0,due=0,attempted=0,sent=0,smsSent=0,emailSent=0,tasksCreated=0,fallbacks=0,retried=0,blocked=0,deadLettered=0,failed=0;
  const records=await automationWorkspaces(options);
  for(const record of records){
    if(Date.now()>(options.deadline??Infinity)-7000)break;
    if(!await workspaceAutomationAccess(record.workspaceId))continue;
    workspaces++;const profile=record.workspace.profile;
    let workspaceChanged=false;let currentLeads=record.workspace.leads as Array<FollowUpLead&ProviderManagedLead>;
    try{const incoming=await queuedProviderLeads(record.workspaceId);if(incoming.length){const merged=mergeProviderLeads(currentLeads,incoming,createProviderLead);if(merged.added||merged.updated){currentLeads=merged.leads as Array<FollowUpLead&ProviderManagedLead>;workspaceChanged=true}}}catch(error){logError("provider_inbox_merge_failed",error,{workspaceId:record.workspaceId})}
    const deduplicated=deduplicateCsvLeads(currentLeads as unknown as CsvManagedLead[]);if(deduplicated.removed){currentLeads=deduplicated.leads as unknown as Array<FollowUpLead&ProviderManagedLead>;duplicatesRemoved+=deduplicated.removed;workspaceChanged=true}
    const assigned=assignRoundRobin(currentLeads,profile);if(assigned!==currentLeads){currentLeads=assigned;workspaceChanged=true}
    const control=cleanAiControl(record.workspace.aiControl);
    if(!(control.salesEnabled??profile.serverAutomationEnabled)){if(workspaceChanged){await saveWorkspaceChanges(record.workspaceId,record.workspace,{...record.workspace,leads:currentLeads});changed++}continue}
    if(cleanWarming(profile.leadWarming).enabled){if(workspaceChanged)await saveWorkspaceChanges(record.workspaceId,record.workspace,{...record.workspace,leads:currentLeads});continue;}
    const leads=currentLeads.map(raw=>{const prepared=prepareAutomationLead(raw,profile);if(JSON.stringify(prepared)!==JSON.stringify(raw))workspaceChanged=true;return prepared});
    for(let index=0;index<leads.length&&Date.now()<(options.deadline??Infinity)-7000&&attempted<(options.sendLimit||250);index++){
      const lead=leads[index];if(lead.automationStatus!=="action due")continue;due++;
      const sequence=sequenceFor(lead,profile);if(!sequence){blocked++;continue}const steps=enabledSteps(sequence);const step=steps[lead.automationStep||0];if(!step){leads[index]={...lead,automationStatus:"complete",automationNextAt:""};workspaceChanged=true;continue}
      if(step.channel==="task"){
        attempted++;
        const taskNote=`Pacifica automation task: personally follow up with ${lead.name}.`;
        leads[index]=nextState({...lead,followUp:new Date().toISOString(),communications:appendCommunication(lead.communications,communication({channel:"email",direction:"outbound",subject:"Sales task",body:taskNote,status:"task",sentAt:new Date().toISOString(),provider:"pacifica"}))},sequence);
        tasksCreated++;workspaceChanged=true;continue;
      }
      if(control.rules[step.channel]?.dailyAt)continue; // Daily rules are processed by the recurring engine.
      if(!matchesOutreach(lead,control.rules[step.channel])||!inOutreachWindow(control.rules[step.channel])){blocked++;continue}
      const dailyLimit=Math.min(3,Math.max(1,Number(profile.maxAutomatedTouchesPerLeadPerDay)||1));
      if(automatedTouchesToday(lead,profile.automationTimezone)>=dailyLimit){
        leads[index]={...lead,automationStatus:"scheduled",automationNextAt:isoAfter(1440),automationUpdatedAt:new Date().toISOString()};workspaceChanged=true;continue;
      }
      attempted++;
      const candidates=await availableChannels(record.workspaceId,lead,profile,step.channel);
      if(!candidates.length){blocked++;leads[index]={...lead,automationStatus:"blocked",automationLastError:"No consented, configured delivery channel is ready",automationNextAt:isoAfter(60),automationUpdatedAt:new Date().toISOString()};workspaceChanged=true;continue}
      let delivered=false;let lastError="";
      for(const channel of candidates){
        if(control.rules[channel]?.dailyAt)continue;
        if(!matchesOutreach(lead,control.rules[channel])||!inOutreachWindow(control.rules[channel]))continue;
        try{
          const result=await deliver(record.workspaceId,lead,profile,channel,step);
          if(channel!==step.channel)fallbacks++;
          leads[index]=nextState({...lead,...(channel==="sms"?{lastSmsAt:result.communication.sentAt}:{lastEmailAt:result.communication.sentAt}),communications:appendCommunication(lead.communications,result.communication)},sequence);
          sent++;if(channel==="sms")smsSent++;else emailSent++;delivered=true;workspaceChanged=true;break;
        }catch(error){lastError=error instanceof Error?error.message:"Delivery failed";logError("follow_up_delivery_failed",error,{workspaceId:record.workspaceId,leadId:lead.id,channel})}
      }
      if(delivered){await saveWorkspaceChanges(record.workspaceId,record.workspace,{...record.workspace,leads:[...leads]});continue;}
      const failures=(lead.automationDeliveryFailures||0)+1;
      if(failures>=retryDelays.length){deadLettered++;leads[index]={...lead,automationDeliveryFailures:failures,automationLastError:lastError,automationDeadLetterAt:new Date().toISOString(),automationStatus:"needs attention",automationNextAt:"",automationUpdatedAt:new Date().toISOString()}}
      else {if(providerBlocked(lastError))blocked++;else failed++;retried++;leads[index]={...lead,automationDeliveryFailures:failures,automationLastError:lastError,automationStatus:"retry scheduled",automationNextAt:isoAfter(retryDelays[failures-1]),automationUpdatedAt:new Date().toISOString()}}
      workspaceChanged=true;
    }
    if(workspaceChanged){await saveWorkspaceChanges(record.workspaceId,record.workspace,{...record.workspace,leads});changed++}
  }
  const run:AutomationRun={ok:true,startedAt,completedAt:new Date().toISOString(),workspaces,changed,duplicatesRemoved,due,sent,smsSent,emailSent,tasksCreated,fallbacks,retried,blocked,deadLettered,failed};
  await workspaceRedis(["SET","pacifica:v2:automation:last-run",JSON.stringify(run)]).catch(()=>null);
  logEvent("follow_up_automation_complete",run);
  return run;
}
