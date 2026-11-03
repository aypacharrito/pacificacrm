import {createHash} from 'node:crypto';
import {cleanCommunications} from './communications';
import {cleanOfficeItems,type OfficeItem} from './office-schedule';
export {cleanConversationCalendar,type ConversationCalendar} from './conversation-calendar-state';
export type ConversationLead=Record<string,unknown>&{id:number;name:string;phone:string};
export const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const eligible=(l:ConversationLead)=>!l.deletedAt&&!l.doNotCall&&!['Closed'].includes(String(l.stage))&&!['Not interested','Wrong number','Sold / Won'].includes(String(l.outcome));
export function thread(l:ConversationLead,now=Date.now()){
 const messages:Array<{id:string;channel:string;direction:string;body:string;sentAt:string;status:string}>=cleanCommunications(l.communications).filter(m=>Date.parse(m.sentAt)>now-30*86400000&&Date.parse(m.sentAt)<=now&&!['failed','undelivered','draft','queued','sending'].includes(m.status)&&(m.direction==='inbound'||['sent','delivered','read'].includes(m.status))).sort((a,b)=>Date.parse(a.sentAt)-Date.parse(b.sentAt)).slice(-30);
 const notes=String(l.notes||'').trim().slice(-16000),updated=String(l.notesUpdatedAt||'');
 if(notes)messages.push({id:'note:'+hash([notes,updated]),channel:'note',direction:'internal',body:notes,sentAt:Number.isFinite(Date.parse(updated))?updated:'',status:'saved'});
 return messages;
}
export const calendarReviewVersion='v4:';
export function definiteNoteSchedule(quote:string,sourceAt:string){
 const hasDate=/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(quote);
 const relative=/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(quote);
 return (hasDate&&(Number.isFinite(Date.parse(sourceAt))||/\b20\d{2}\b/.test(quote))||(relative&&Number.isFinite(Date.parse(sourceAt))))&&/appoint|\bappt\b|schedul|booked|agreed|callback|call\b|meeting|\bcita\b/i.test(quote)&&!/maybe|tentative|might|cancel|could we|can we|ask (?:if|whether)/i.test(quote);
}
export type Candidate={kind?:'appointment'|'renewal';leadId:number;dueAt:string;interestId:string;interestQuote:string;scheduleId:string;scheduleQuote:string};
export function applyCandidates(leads:ConversationLead[],raw:unknown,candidates:Candidate[],remembered:string[],now=Date.now()){
 const items=cleanOfficeItems(raw),seen=new Set(remembered);let added=0;
 const phone=(l:ConversationLead)=>String(l.phone||'').replace(/\D/g,'').slice(-10);
 for(const c of candidates.slice(0,20)){
  const lead=leads.find(l=>l.id===c.leadId);if(!lead||!eligible(lead))continue;
  if(c.kind==='renewal'){
   const messages=thread(lead,now),source=messages.find(m=>m.id===c.scheduleId&&m.direction==='inbound');
   const date=Date.parse(c.dueAt+'T12:00:00Z');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(c.dueAt)||!Number.isFinite(date)||new Date(date).toISOString().slice(0,10)!==c.dueAt||date<now-86400000||date>now+400*86400000||!source||!c.scheduleQuote||!source.body.includes(c.scheduleQuote)||!/renew|expir|renova|vence/i.test(c.scheduleQuote))continue;
   const key=hash(['renewal',phone(lead)||lead.id,c.dueAt]);if(seen.has(key))continue;
   if(items.some(x=>(x.leadId===lead.id||Boolean(phone(lead)&&leads.some(l=>l.id===x.leadId&&phone(l)===phone(lead))))&&(x.allDayDate===c.dueAt||(x.dueAt.startsWith(c.dueAt)&&/renew|expir/i.test(x.title))))){seen.add(key);continue;}
   if(items.length>=500)continue;
   items.push({id:`renewal-calendar:${key}`,leadId:lead.id,kind:'appointment',title:`Insurance renewal · ${lead.name}`,allDayDate:c.dueAt,dueAt:new Date(date).toISOString(),amount:0,status:'open',reminderAt:'',reminderState:'off',createdAt:new Date(now).toISOString(),staffReminderMinutes:-1});seen.add(key);added++;continue;
  }
  const messages=thread(lead,now),schedule=messages.find(m=>m.id===c.scheduleId),note=schedule?.channel==='note'&&c.interestId===c.scheduleId&&definiteNoteSchedule(c.scheduleQuote,schedule.sentAt),interest=messages.find(m=>m.id===c.interestId&&(m.direction==='inbound'||note&&m.channel==='note'));
  if(schedule?.channel==='note'&&!note)continue;
  const allDay=note&&/^\d{4}-\d{2}-\d{2}$/.test(c.dueAt),date=Date.parse(allDay?c.dueAt+'T12:00:00Z':c.dueAt);
  if((!allDay&&!/(Z|[+-]\d\d:\d\d)$/.test(c.dueAt))||!Number.isFinite(date)||date<=(allDay?now-86400000:now)||date>now+180*86400000||allDay&&new Date(date).toISOString().slice(0,10)!==c.dueAt)continue;
  if(!interest||!schedule||!c.interestQuote||!c.scheduleQuote||!interest.body.includes(c.interestQuote)||!schedule.body.includes(c.scheduleQuote))continue;
  const key=hash([phone(lead)||lead.id,Math.floor(date/60000)]);if(seen.has(key))continue;
  const same=(x:OfficeItem)=>x.leadId===lead.id||Boolean(phone(lead)&&leads.some(l=>l.id===x.leadId&&phone(l)===phone(lead)))||Boolean(x.leadId===0&&lead.name.length>3&&x.title.toLowerCase().includes(lead.name.toLowerCase()));
  if(items.some(x=>x.kind==='appointment'&&same(x)&&(allDay&&x.allDayDate===c.dueAt||Math.abs(Date.parse(x.dueAt)-date)<15*60000))){seen.add(key);continue}
  // Reschedules need review; do not leave two different AI appointments for one conversation.
  if(items.length>=500||items.some(x=>same(x)&&x.id.startsWith('sms-calendar:')&&x.status==='open'&&Date.parse(x.dueAt)>now))continue;
  items.push({id:`sms-calendar:${key}`,leadId:lead.id,kind:'appointment',title:`${note?'Appointment':'Interested callback'} · ${lead.name}`,...(allDay?{allDayDate:c.dueAt}:{}),dueAt:new Date(date).toISOString(),amount:0,status:'open',reminderAt:'',reminderState:'off',createdAt:new Date(now).toISOString(),durationMinutes:30,staffReminderMinutes:allDay?-1:15});seen.add(key);added++;
 }
 return {items,remembered:[...seen].slice(-5000),added};
}

export function pendingConversationThreads(leads:ConversationLead[],checked:Record<string,string>,now=Date.now()){
 return leads.filter(eligible).map(l=>({leadId:l.id,messages:thread(l,now)})).filter(t=>t.messages.some(m=>m.direction==='inbound'||m.channel==='note')&&checked[t.leadId]!==calendarReviewVersion+hash(t.messages)).sort((a,b)=>Number(b.messages.some(m=>m.channel==='note'&&/appoint|\bappt\b|\bcita\b/i.test(m.body)))-Number(a.messages.some(m=>m.channel==='note'&&/appoint|\bappt\b|\bcita\b/i.test(m.body)))||Number(Boolean(checked[a.leadId]))-Number(Boolean(checked[b.leadId])));
}
export function conversationBatch(pending:ReturnType<typeof pendingConversationThreads>){
 let budget=0;
 return pending.filter(t=>{const size=JSON.stringify(t).length;if(size+budget>48000)return false;budget+=size;return true}).slice(0,20);
}
