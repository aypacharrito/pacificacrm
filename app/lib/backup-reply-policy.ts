import {cleanCommunications,type StoredCommunication} from './communications';
import {cleanWarming,phoneKey,warmingWindow,type WarmingLead} from './lead-warming-policy';
type Profile={leadWarming?:unknown;automationTimezone:string};
/** Sales AI-off and Interested are handoffs, not permission to start a sequence.
 * This separate permission allows only a response to a specific unanswered SMS. */
export function backupReplyCandidate(leads:WarmingLead[],profile:Profile,now=new Date()):StoredCommunication|null{
 const settings=cleanWarming(profile.leadWarming),since=Date.parse(settings.backupRepliesSince);
 if(!settings.backupRepliesEnabled||!Number.isFinite(since)||!warmingWindow(now,profile.automationTimezone)||!leads.length)return null;
 if(leads.some(l=>l.deletedAt||l.doNotCall||l.smsOptOut||l.backupReplyDisabled===true||[l.stage,l.status,l.outcome,l.sourceDisposition].some(v=>/^(closed|not interested|wrong number|sold(?: \/ won)?|won|lost)(?:\b|$)/i.test(String(v||'').trim()))))return null;
 const messages=cleanCommunications(leads.flatMap(l=>cleanCommunications(l.communications)));
 const inbound=messages.filter(m=>m.channel==='sms'&&m.direction==='inbound').sort((a,b)=>Date.parse(b.sentAt)-Date.parse(a.sentAt))[0];
 if(!inbound)return null;
 if(messages.some(m=>m.direction==='inbound'&&m.channel!=='sms'&&Date.parse(m.sentAt)>Date.parse(inbound.sentAt)))return null;
 const received=Date.parse(inbound.sentAt),age=now.getTime()-received;
 if(!Number.isFinite(received)||received<since||age<settings.backupReplyDelayMinutes*60000||age>7*86400000)return null;
 // Explicit opt-out phrases also block a delayed reply before webhook flags sync.
 if(/^\s*(?:stop|stopall|unsubscribe|cancel|end|quit|remove me|do not (?:call|text|contact)|don't (?:call|text|contact))\b/i.test(inbound.body))return null;
 if(messages.some(m=>m.direction==='outbound'&&Date.parse(m.sentAt)>=received&&!['draft','failed','undelivered','task'].includes(m.status)))return null;
 return inbound;
}
export function backupReplyKey(phone:string,reply:StoredCommunication){return `backup-reply:${phoneKey(phone)}:${reply.providerId||reply.id}`;}
