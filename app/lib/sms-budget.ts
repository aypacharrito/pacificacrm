import {missedFollowUp} from './missed-followups';
import {updateStoredWorkspace,type StoredWorkspace} from './workspace-storage';
import {cleanWarming,hasInbound,latestInbound,localDay,outboundHistory,phoneKey,renewalReady,smsSegments,type WarmingLead} from './lead-warming-policy';
import {backupReplyCandidate} from './backup-reply-policy';
export class SmsBudgetError extends Error {constructor(readonly reason:'budget'|'cooldown'|'cap'|'segments',message:string){super(message);this.name='SmsBudgetError'}}
export type SmsClaim={id:string;key?:string;phone:string;day:string;month:string;at:string;cents:number;segments:number;automated:boolean;state:'reserved'|'submitted'|'rejected';providerId?:string;actualCents?:number};
export type SmsLedger={claims:SmsClaim[]};
export function cleanSmsLedger(value:unknown):SmsLedger{const v=value as SmsLedger|undefined;return {claims:Array.isArray(v?.claims)?v.claims.filter(c=>c&&typeof c.id==='string'&&typeof c.phone==='string'&&Number.isFinite(c.cents)&&c.cents>=0&&typeof c.day==='string').slice(-20000):[]};}
export function weekStart(day:string){const date=new Date(day+'T00:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);}
export function budgetTotals(ledger:SmsLedger,day:string){const claims=ledger.claims.filter(c=>c.state!=='rejected'),week=weekStart(day);return {dayCents:claims.filter(c=>c.day===day).reduce((n,c)=>n+Math.max(c.cents,c.actualCents||0),0),weekCents:claims.filter(c=>c.day>=week&&c.day<=day).reduce((n,c)=>n+Math.max(c.cents,c.actualCents||0),0),monthCents:claims.filter(c=>c.month===day.slice(0,7)).reduce((n,c)=>n+Math.max(c.cents,c.actualCents||0),0)};}
/** Pure reservation: updateStoredWorkspace commits this with compare-and-swap before any provider call. */
export function reserveBudget(current:StoredWorkspace,input:{id:string;to:string;body:string;automated?:boolean;key?:string;replyId?:string;mms?:boolean;purpose?:'unanswered-reply'},now=new Date()):StoredWorkspace{
 const settings=cleanWarming(current.profile.leadWarming),ledger=cleanSmsLedger(current.smsLedger),day=localDay(now,current.profile.automationTimezone),phone=phoneKey(input.to),segments=smsSegments(input.body).segments;
 if(ledger.claims.some(c=>c.id===input.id||input.key&&c.key===input.key))throw Error('This message is already reserved or submitted. Review its status before retrying.');
 const leads=(current.leads as WarmingLead[]).filter(l=>phoneKey(l.phone)===phone),live=ledger.claims.filter(c=>c.phone===phone&&c.state!=='rejected');
 if(input.automated){
  if(input.key?.startsWith('recovery:')){
   // Atomic workspace-wide pacing, shared by all concurrent workers.
   const task=missedFollowUp(leads,current.profile,now.getTime());
   // The engine claimed this exact action before reaching the budget reservation.
   const withoutClaim=leads.map(l=>({...l,nurture:l.nurture?{...l.nurture,actions:Object.fromEntries(Object.entries(l.nurture.actions||{}).filter(([key])=>key!==input.key))}:undefined}));
   if((task||missedFollowUp(withoutClaim,current.profile,now.getTime()))!==input.key)throw Error('This overdue follow-up no longer qualifies for recovery.');
   if(ledger.claims.filter(c=>c.state!=='rejected'&&c.day===day&&c.key?.startsWith('recovery:')).length>=3)throw new SmsBudgetError('budget','Today’s three-contact recovery limit is reached. Remaining follow-ups wait for another business day.');
  }
  if(input.purpose==='unanswered-reply'){
   const pending=backupReplyCandidate(leads,current.profile,now);
   if(!pending||!input.replyId||(pending.providerId||pending.id)!==input.replyId)throw Error('This reply no longer needs a backup response.');
   if(live.some(c=>Date.parse(c.at)>=Date.parse(pending.sentAt)))throw Error('A text is already being sent or needs delivery review.');
   const recent=live.filter(c=>c.automated&&c.key?.startsWith('backup-reply:'));
   if(recent.some(c=>c.day===day)||recent.filter(c=>c.day>=weekStart(day)&&c.day<=day).length>=2)throw new SmsBudgetError('cooldown','Backup replies are limited to one per contact per day and two per week.');
  }
  const reply=latestInbound(leads),isReply=Boolean(input.replyId&&reply&&(reply.providerId||reply.id)===input.replyId);
  if(input.replyId&&!isReply)throw Error('A newer reply arrived. Review it before sending.');
  if(leads.some(l=>hasInbound(l)&&!renewalReady(l,now.getTime()))&&!isReply)throw Error('A reply is waiting or has been reviewed. Generic AI texts are paused.');
  if(!input.mms&&segments>settings.maxSegments)throw new SmsBudgetError('segments',`Automatic text exceeds the ${settings.maxSegments}-segment limit. Shorten the final message.`);
  const history=outboundHistory(leads,'sms'),ids=new Set(history.map(m=>m.providerId||m.id));
  const unrecorded=live.filter(c=>!c.providerId||!ids.has(c.providerId));
  if(isReply&&live.filter(c=>c.automated&&c.day===day).length>=2)throw Error('Daily automatic conversation limit reached. A person should continue this conversation.');
  const latestReply=leads.reduce((n,l)=>Math.max(n,Date.parse(String(l.nurture?.reviewedAt||''))||0),0);
  const touches=history.filter(m=>Date.parse(m.sentAt)>latestReply),claims=unrecorded.filter(c=>Date.parse(c.at)>latestReply);
  if(!isReply&&touches.length+claims.length>=settings.maxUnansweredTexts)throw new SmsBudgetError('cap','Unanswered text limit reached. Lead remains available for calls or email.');
  const last=Math.max(0,...history.map(m=>Date.parse(m.sentAt)||0),...live.map(c=>Date.parse(c.at)||0));
  if(!isReply&&last&&now.getTime()-last<settings.gapHours*3600000)throw new SmsBudgetError('cooldown','This phone is cooling down before another automatic text.');
 }
 const cents=input.mms?Math.max(10,settings.reserveCentsPerSegment*segments):settings.reserveCentsPerSegment*segments;
 const totals=budgetTotals(ledger,day);
 if(totals.dayCents+cents>settings.dailyBudgetCents||totals.weekCents+cents>settings.weeklyBudgetCents||totals.monthCents+cents>settings.monthlyBudgetCents)throw new SmsBudgetError('budget','Estimated daily, weekly or monthly SMS budget reached. Sending is paused; adjust limits in Settings.');
 if(ledger.claims.length>=20000)throw Error('SMS budget ledger is full. Archive old usage before sending.');
 const claim:SmsClaim={id:input.id,key:input.key,phone,day,month:day.slice(0,7),at:now.toISOString(),cents,segments,automated:Boolean(input.automated),state:'reserved'};
 return {...current,smsLedger:{claims:[...ledger.claims,claim]}};
}
export async function reserveSms(workspaceId:string,input:Omit<Parameters<typeof reserveBudget>[1],'id'>){const id=crypto.randomUUID();await updateStoredWorkspace(workspaceId,w=>reserveBudget(w,{...input,id}));return id;}
export async function settleSms(workspaceId:string,id:string,patch:Partial<Pick<SmsClaim,'state'|'providerId'|'actualCents'>>){await updateStoredWorkspace(workspaceId,w=>({...w,smsLedger:{claims:cleanSmsLedger(w.smsLedger).claims.map(c=>c.id===id||c.providerId===id?{...c,...patch}:c)}}));}
