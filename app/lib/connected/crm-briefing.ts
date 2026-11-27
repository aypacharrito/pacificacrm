import type {StoredWorkspace} from '../workspace-storage';
import type {ConnectedSource} from './assistant';
import {agentAssignedLead} from '../ai-workspace-scope';

type Row=Record<string,unknown>;
type Member={id:string;role:string};
const callRequest=/(?:\b(?:call|phone|ring)\s+me\b|\b(?:give|return)\s+me\s+a\s+call\b|\b(?:ll[aá]mame|me\s+(?:puede|puedes)\s+llamar|que\s+(?:le|me)\s+llamara|devu[eé]lveme\s+la\s+llamada)\b)/i;
const time=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):NaN;
const visible=(workspace:StoredWorkspace,lead:Row,member:Member)=>!lead.deletedAt&&lead.stage!=='Closed'&&Number.isSafeInteger(lead.id)&&Number(lead.id)>0&&
  (member.role!=='agent'||agentAssignedLead(workspace,member.id,lead));
const leadLink=(id:number)=>'/dashboard?crmLead='+id;
const messageLink=(id:number,message:string)=>'/dashboard?crmLead='+id+'&crmMessage='+encodeURIComponent(message);

/** Server-owned CRM records. IDs link to the exact contact and saved inbound message. */
export function crmBriefing(workspace:StoredWorkspace|null,member:Member,kind:'callback'|'needsToday',start:number,end:number,now=Date.now()):ConnectedSource[]{
  if(!workspace)return [];
  const leads=(workspace.leads as Row[]).filter(lead=>visible(workspace,lead,member));
  const sources: Array<ConnectedSource&{at:number}>=[];
  for(const lead of leads){
    const id=Number(lead.id),name=String(lead.name||'Contact').slice(0,100);
    const messages=Array.isArray(lead.communications)?lead.communications as Row[]:[];
    if(kind==='callback'){
      for(const message of messages){
        const at=time(message.sentAt),messageId=String(message.id||message.providerId||'');
        if(message.direction!=='inbound'||message.channel!=='sms'||!messageId||!Number.isFinite(at)||at<now-30*86_400_000||at>now+60_000||!callRequest.test(String(message.body||'')))continue;
        // A later outbound text may already have answered the request; do not call it outstanding.
        if(messages.some(other=>other.channel==='sms'&&other.direction==='outbound'&&time(other.sentAt)>at))continue;
        sources.push({label:name,detail:'SMS callback request · '+new Date(at).toLocaleString()+(lead.doNotCall?' · Review only (DNC)':''),href:messageLink(id,messageId),at});
      }
    }else{
      const due=time(lead.followUp);
      if(Number.isFinite(due)&&due>=start-7*86_400_000&&due<end&&lead.doNotCall!==true){
        sources.push({label:name,detail:'CRM follow-up · '+new Date(due).toLocaleString(),href:leadLink(id),at:due});
      }
    }
  }
  if(kind==='needsToday')for(const raw of workspace.officeItems||[]){
    const item=raw as Row,lead=leads.find(row=>row.id===item.leadId);
    if(!lead||item.status!=='open'||item.kind!=='appointment')continue;
    const due=time(item.dueAt);
    if(!Number.isFinite(due)||due<start||due>=end)continue;
    sources.push({label:String(item.title||lead.name||'Appointment').slice(0,120),detail:'CRM appointment · '+new Date(due).toLocaleString(),href:'/dashboard?calendar=1&day='+new Date(due).toISOString().slice(0,10)+'&appointment='+encodeURIComponent(String(item.id)),at:due});
  }
  return sources.sort((a,b)=>kind==='callback'?b.at-a.at:a.at-b.at).slice(0,12).map(source=>({label:source.label,detail:source.detail,href:source.href}));
}
