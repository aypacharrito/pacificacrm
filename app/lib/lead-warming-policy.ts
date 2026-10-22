import {cleanCommunications,type StoredCommunication} from './communications';
export type WarmingSettings={enabled:boolean;dailyBudgetCents:number;monthlyBudgetCents:number;reserveCentsPerSegment:number;maxUnansweredTexts:number;maxSegments:number;gapHours:number;maxLeadAgeDays:number};
export const defaultWarming:WarmingSettings={enabled:true,dailyBudgetCents:300,monthlyBudgetCents:5000,reserveCentsPerSegment:3,maxUnansweredTexts:2,maxSegments:1,gapHours:72,maxLeadAgeDays:30};
export function cleanWarming(value:unknown):WarmingSettings{
 const v=(value&&typeof value==='object'?value:{}) as Partial<WarmingSettings>;
 const num=(key:keyof WarmingSettings,min:number,max:number)=>Number.isFinite(Number(v[key]))?Math.min(max,Math.max(min,Math.round(Number(v[key])))):Number(defaultWarming[key]);
 return {enabled:v.enabled!==false,dailyBudgetCents:num('dailyBudgetCents',0,100000),monthlyBudgetCents:num('monthlyBudgetCents',0,1000000),reserveCentsPerSegment:num('reserveCentsPerSegment',2,100),maxUnansweredTexts:num('maxUnansweredTexts',0,5),maxSegments:num('maxSegments',1,3),gapHours:num('gapHours',24,720),maxLeadAgeDays:num('maxLeadAgeDays',1,365)};
}
export type NurtureState={smsRetryAt?:string;smsExhausted?:boolean;actions?:Record<string,{token:string;state:'sending'|'sent'|'review';at:string;error?:string}>;phase:'new'|'waiting'|'review'|'interested'|'snoozed'|'renewal'|'closed'|'resting';reviewedReplyId?:string;reviewedAt?:string;retryAt?:string;summary?:string;nextAction?:string;language?:'en'|'es';renewalDate?:string;renewalMonth?:string;resumeAt?:string;resumePermission?:boolean;lastActionKey?:string;lastActionAt?:string};
export type WarmingLead=Record<string,unknown>&{id:number;phone?:string;email?:string;stage?:string;status?:string;outcome?:string;sourceDisposition?:string;automationEnabled?:boolean;smsConsent?:boolean;smsOptOut?:boolean;emailConsent?:boolean;emailOptOut?:boolean;source?:string;nurture?:NurtureState};
export const phoneKey=(v:unknown)=>String(v||'').replace(/\D/g,'').slice(-10);
export function latestInbound(leads:WarmingLead[]){return cleanCommunications(leads.flatMap(l=>cleanCommunications(l.communications))).filter(m=>m.direction==='inbound').sort((a,b)=>Date.parse(b.sentAt)-Date.parse(a.sentAt))[0];}
export function hasInbound(lead:Record<string,unknown>){return Boolean(lead.lastInboundAt)||cleanCommunications(lead.communications).some(m=>m.direction==='inbound');}
export function renewalReady(lead:Record<string,unknown>,now=Date.now()){
 const n=lead.nurture as NurtureState|undefined,reply=latestInbound([lead as WarmingLead]);
 if(!n?.reviewedReplyId||reply&&(reply.providerId||reply.id)!==n.reviewedReplyId||(Date.parse(String(lead.lastInboundAt||''))||0)>(Date.parse(n.reviewedAt||'')||0))return false;
 return Boolean(n&&['snoozed','renewal'].includes(n.phase)&&n.resumePermission&&n.resumeAt&&Date.parse(n.resumeAt)<=now);
}
export function localDay(now:Date,tz:string){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function warmingWindow(now:Date,tz:string){try{const parts=new Intl.DateTimeFormat('en-US',{timeZone:tz,hour:'numeric',hourCycle:'h23',weekday:'short'}).formatToParts(now),hour=Number(parts.find(p=>p.type==='hour')?.value);return hour>=9&&hour<18&&!['Sat','Sun'].includes(parts.find(p=>p.type==='weekday')?.value||'')}catch{return false}}
const basic=new Set(Array.from('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'));
const extended=new Set(Array.from('^{}\\[~]|€\f'));
export function smsSegments(body:string){let length=0;for(const c of body){if(basic.has(c))length++;else if(extended.has(c))length+=2;else return {encoding:'UCS-2' as const,units:body.length,segments:body.length<=70?1:Math.ceil(body.length/67)};}return {encoding:'GSM-7' as const,units:length,segments:length<=160?1:Math.ceil(length/153)};}
export function outboundHistory(leads:WarmingLead[],channel:'sms'|'email'):StoredCommunication[]{const unique=new Map<string,StoredCommunication>();for(const l of leads)for(const m of cleanCommunications(l.communications))if(m.channel===channel&&m.direction==='outbound'&&m.status!=='task')unique.set(m.providerId||m.id,m);return [...unique.values()].sort((a,b)=>Date.parse(a.sentAt)-Date.parse(b.sentAt));}
