import {clientDates,isActiveClient} from './client-portfolio';
import {exactDate,type QuoteRequestEvidence,type QuoteSubmission} from './quote-intake';
export type OpportunityLead={id:number;name:string;phone:string;email?:string;product?:string;address?:string;city?:string;state?:string;zip?:string;dateOfBirth?:string;vin?:string;renewalDate?:string;policyExpirationDate?:string;stage?:string;outcome?:string;sourceDisposition?:string;source?:string;deletedAt?:string;doNotCall?:boolean;smsOptOut?:boolean;emailOptOut?:boolean;followUp?:string;clientStatus?:'active'|'inactive';closedRevenue?:number;quoteRequests?:QuoteRequestEvidence[];quoteDetailsUpdatedAt?:string;importedFields?:Record<string,string>;extraFields?:Record<string,string>};
export function opportunityFor(lead:OpportunityLead,now=Date.now()){
 if(lead.deletedAt||lead.doNotCall||lead.smsOptOut||/not interested|wrong number|lost/i.test([lead.outcome,lead.sourceDisposition].join(' ')))return null;
 const recorded=clientDates(lead).renewalDate;
 const date=exactDate(recorded)?recorded:'';
 // Policy renewal is a recorded date, not a birthday-style annual prediction.
 const today=new Date(now);today.setHours(0,0,0,0);
 const days=date?Math.round((new Date(date+'T00:00:00').getTime()-today.getTime())/86400000):null;
 const renewal=days!==null&&days>=0&&days<=45;
 const requests=(lead.quoteRequests||[]).filter(x=>Date.parse(x.requestedAt)<=now&&now-Date.parse(x.requestedAt)<=30*86400000).sort((a,b)=>Date.parse(b.requestedAt)-Date.parse(a.requestedAt));
 const client=isActiveClient(lead);
 if(client)return renewal?{kind:'renewal' as const,label:'Client renewal',detail:`Recorded renewal: ${date} · ${days} days`,score:60-days!,date,warm:false}:null;
 if(lead.stage==='Closed')return null;
 if(requests.length)return {kind:'request' as const,label:'Quote requested',detail:`Requested ${new Date(requests[0].requestedAt).toLocaleDateString()} · ${requests[0].source}`,score:120,date:requests[0].requestedAt,warm:true};
 if(/^(Interested|Appointment set)$/i.test(lead.outcome||'')||lead.stage==='Appointment'||/^(Interested - Working|Interested - Future Prospect)$/i.test(lead.sourceDisposition||''))return {kind:'conversation' as const,label:lead.stage==='Appointment'?'Appointment':'Interested contact',detail:lead.followUp?`Follow-up: ${lead.followUp}`:'Personal follow-up needed',score:90,date:lead.followUp||'',warm:true};
 return renewal?{kind:'renewal' as const,label:'Renewal to confirm',detail:`Recorded renewal: ${date} · ${days} days. Interest is not confirmed.`,score:50-days!,date,warm:false}:null;
}
export function rankOpportunities<T extends OpportunityLead>(leads:T[],now=Date.now()){
 return leads.flatMap(lead=>{const signal=opportunityFor(lead,now);return signal?[{lead,signal}]:[]}).sort((a,b)=>b.signal.score-a.signal.score||Date.parse(b.signal.date)-Date.parse(a.signal.date)||a.lead.id-b.lead.id);
}
export function revenuePlan(goal:number,commission:number,closeRate:number){
 if(!Number.isFinite(goal)||!Number.isFinite(commission)||!Number.isFinite(closeRate)||goal<=0||commission<=0||closeRate<=0||closeRate>100)return null;
 const policies=Math.ceil(goal/commission),requests=Math.ceil(policies/(closeRate/100));return {policies,requests,monthlyRequests:Math.ceil(requests/12)};
}
/** Agent-approved, fill-empty-only import; a submitted request never cancels STOP or DNC. */
export function acceptQuoteSubmission(leads:Record<string,unknown>[],submission:QuoteSubmission,now=new Date()){
 const details=submission.details;
 const key=(phone:unknown)=>String(phone||'').replace(/\D/g,'').slice(-10);
 const phone=key(details.phone);  // an empty phone must not match every contact without one
 const matches=submission.leadId!==null?leads.filter(l=>l.id===submission.leadId):leads.filter(l=>Boolean(phone&&key(l.phone)===phone)||Boolean(details.email&&String(l.email||'').toLowerCase()===details.email));
 if(matches.length>1)throw Error('Multiple contacts match this request. Resolve the duplicate contacts before accepting.');
 if(submission.leadId!==null&&!matches.length)throw Error('The original contact is no longer available.');
 const previous=matches[0];
 if(previous&&(previous.deletedAt||previous.doNotCall||previous.smsOptOut||previous.emailOptOut))throw Error('This contact is deleted or has contact restrictions. Review their contact record first.');
 if(previous&&Array.isArray(previous.quoteRequests)&&previous.quoteRequests.some(x=>x.id===submission.id))return {leads,leadId:Number(previous.id)};
 const id=previous?Number(previous.id):Math.max(now.getTime(),...leads.map(l=>Number(l.id)||0))+1;
 const date=now.toISOString();
 const lead:Record<string,unknown>=previous?{...previous}:{id,name:details.name,phone:details.phone,email:details.email,product:details.product,address:details.address,city:details.city,state:details.state,zip:details.zip,source:submission.source,leadCost:0,stage:'New lead',status:'Ready',outcome:'Interested',sourceDisposition:'Quote requested',line:/life/i.test(details.product)?'life':'home-auto',importedAt:date,received:submission.submittedAt,notes:'',followUp:'',lastContact:'Never',doNotCall:false,smsConsent:false,emailConsent:false};
 for(const field of ['name','phone','email','product','address','city','state','zip','dateOfBirth','renewalDate','vin'] as const)if(!String(lead[field]||'').trim()&&details[field])lead[field]=details[field];
 if(details.currentCarrier)lead.extraFields={...(lead.extraFields as Record<string,string>||{}),'Prospect-reported carrier':details.currentCarrier};
 if(submission.requestNotes)lead.extraFields={...(lead.extraFields as Record<string,string>||{}),'Requested coverage':submission.requestNotes};
 lead.quoteDetailsUpdatedAt=date;
 lead.quoteRequests=[...(Array.isArray(lead.quoteRequests)?lead.quoteRequests:[]),{id:submission.id,requestedAt:submission.submittedAt,source:submission.source}].slice(-30);
 lead.automationEnabled=false;lead.automationNextAt='';lead.automationStatus='personal-follow-up';lead.automationUpdatedAt=date;
 return {leads:previous?leads.map(l=>l.id===id?lead:l):[lead,...leads],leadId:id};
}
