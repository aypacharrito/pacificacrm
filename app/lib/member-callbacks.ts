import {createHash} from 'node:crypto';
import {workspaceRedis} from './workspace-storage';
import type {OfficeItem} from './office-schedule';
import type {StoredWorkspace} from './workspace-storage';
import {eligible,thread} from './conversation-calendar';
import {agentAssignedLead} from './ai-workspace-scope';

export type MemberOwner={workspace:string;member:string;role:string};
export type PrivateCallback=OfficeItem&{sourceMessageId:string;timezone:string;privateMemberId:string};
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const prefix=(owner:MemberOwner)=>'pacifica:member-callback:v1:'+digest([owner.workspace,owner.member]);
const key=(owner:MemberOwner,messageId:string)=>prefix(owner)+':'+digest(messageId);
const index=(owner:MemberOwner)=>prefix(owner)+':index';
const parsed=(raw:unknown):PrivateCallback|null=>{
  try{const item=JSON.parse(String(raw)) as PrivateCallback;return item?.id?.startsWith('member-callback:')&&item.privateMemberId&&item.kind==='appointment'&&Number.isFinite(Date.parse(item.dueAt))?item:null}catch{return null}
};
export async function memberCallbacks(owner:MemberOwner){
  const ids=await workspaceRedis(['SMEMBERS',index(owner)]);
  if(!Array.isArray(ids))return [];
  const rows=await Promise.all(ids.slice(0,200).filter((id):id is string=>typeof id==='string'&&/^[0-9a-f]{64}$/.test(id)).map(async id=>parsed(await workspaceRedis(['GET',prefix(owner)+':'+id]))));
  return rows.filter((v):v is PrivateCallback=>Boolean(v&&v.privateMemberId===owner.member));
}
export function callbackLead(workspace:StoredWorkspace,owner:MemberOwner,leadId:number,messageId:string,now=Date.now()){
  const lead=(workspace.leads as Array<Record<string,unknown>&{id:number;name:string;phone:string}>).find(row=>row.id===leadId);
  if(!lead||!eligible(lead)||!Number.isSafeInteger(leadId))return null;
  if(owner.role==='agent'){
    if(!agentAssignedLead(workspace,owner.member,lead))return null;
  }
  const messages=thread(lead,now);
  const source=messages.find(row=>row.id===messageId&&row.channel==='sms'&&row.direction==='inbound');
  if(!source||!/(?:\bcall\s+me\b|\bll[aá]mame\b|\bme\s+(?:puede|puedes)\s+llamar\b|\bque\s+(?:le|me)\s+llamara\b)/i.test(source.body))return null;
  if(!/interested|interesa|quiero|s[ií],?\s*(?:me\s+)?interesa/i.test(source.body)&&String(lead.outcome).toLowerCase()!=='interested')return null;
  if(messages.some(row=>row.channel==='sms'&&row.direction==='outbound'&&Date.parse(row.sentAt)>Date.parse(source.sentAt)))return null;
  return {lead,source};
}

/** A wall time must resolve to exactly one instant in the workspace's time zone. */
export function resolveCallbackTime(local:string,timezone:string,now=Date.now()){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw Error('Choose an exact date and time.');
  let formatter:Intl.DateTimeFormat;
  try{formatter=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}catch{throw Error('Choose a valid workspace time zone.')}
  const wall=Date.parse(local+'Z');if(!Number.isFinite(wall)||new Date(wall).toISOString().slice(0,16)!==local)throw Error('Choose a valid date and time.');
  const matches:number[]=[];
  for(let offset=-14*60;offset<=14*60;offset+=15){const instant=wall-offset*60_000;const parts=Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
    if(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`===local)matches.push(instant)}
  if(matches.length!==1)throw Error(matches.length?'This local time occurs twice. Choose an unambiguous time.':'This local time does not exist in the workspace time zone.');
  if(matches[0]<=now||matches[0]>now+180*86_400_000)throw Error('Choose a future time within 180 days.');
  return new Date(matches[0]).toISOString();
}

export function callbackConflicts(workspace:StoredWorkspace,privateItems:PrivateCallback[],dueAt:string){
  const at=Date.parse(dueAt),overlaps=(item:OfficeItem)=>item.status==='open'&&item.kind==='appointment'&&Math.abs(Date.parse(item.dueAt)-at)<30*60_000;
  return [...(workspace.officeItems||[]).filter(overlaps),...privateItems.filter(overlaps)].map(item=>({id:item.id,title:item.title,dueAt:item.dueAt})).sort((a,b)=>a.id.localeCompare(b.id));
}
export function callbackFingerprint(leadId:number,messageId:string,dueAt:string,conflicts:ReturnType<typeof callbackConflicts>){return digest([leadId,messageId,dueAt,conflicts.map(item=>item.id)]);}
export async function saveMemberCallback(owner:MemberOwner,leadId:number,name:string,messageId:string,dueAt:string,timezone:string){
  const id='member-callback:'+digest([owner.workspace,owner.member,messageId]);
  const item:PrivateCallback={id,leadId,kind:'appointment',title:'Callback · '+name.slice(0,80),dueAt,amount:0,status:'open',reminderAt:'',reminderState:'off',createdAt:new Date().toISOString(),durationMinutes:30,staffReminderMinutes:-1,sourceMessageId:messageId,timezone,privateMemberId:owner.member};
  const stored=await workspaceRedis(['SET',key(owner,messageId),JSON.stringify(item),'NX']);
  if(stored!=='OK'){
    const existing=parsed(await workspaceRedis(['GET',key(owner,messageId)]));
    if(!existing)throw Error('Callback storage is unavailable. Try again.');
    await workspaceRedis(['SADD',index(owner),digest(messageId)]);
    return {item:existing,created:false};
  }
  await workspaceRedis(['SADD',index(owner),digest(messageId)]);
  return {item,created:true};
}
export async function completeMemberCallback(owner:MemberOwner,id:string){
  const item=(await memberCallbacks(owner)).find(row=>row.id===id);
  if(!item)throw Error('This private callback is no longer available.');
  if(item.status==='done')return item;
  const next={...item,status:'done' as const};
  if(await workspaceRedis(['SET',key(owner,item.sourceMessageId),JSON.stringify(next)])!=='OK')throw Error('Private callback could not be completed.');
  return next;
}
