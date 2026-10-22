import {cleanCommunications} from './communications';
import {phoneKey,type WarmingLead} from './lead-warming-policy';
import {cleanSmsLedger,type SmsLedger} from './sms-budget';
export function warmingMetrics(leads:WarmingLead[],ledger?:SmsLedger){
 const groups=new Map<string,WarmingLead[]>();for(const l of leads){const k=phoneKey(l.phone)||l.email?.toLowerCase()||String(l.id);groups.set(k,[...(groups.get(k)||[]),l]);}
 const rows=new Map<string,{source:string;leads:number;delivered:number;positive:number;quoted:number;won:number;smsCents:number}>();
 for(const [phone,group] of groups){const source=String(group[0].source||'Unknown'),row=rows.get(source)||{source,leads:0,delivered:0,positive:0,quoted:0,won:0,smsCents:0};row.leads++;
  const states=group.flatMap(l=>[l.stage,l.status,l.outcome].map(s=>String(s||'').toLowerCase()));
  row.delivered+=Number(group.some(l=>cleanCommunications(l.communications).some(m=>m.channel==='sms'&&m.direction==='outbound'&&m.status==='delivered')));
  row.positive+=Number(states.includes('interested')||group.some(l=>l.nurture?.phase==='interested'));
  row.quoted+=Number(states.includes('quoted')||group.some(l=>l.quotedAt||l.quoteSentAt));row.won+=Number(states.some(s=>['sold / won','sold','won'].includes(s)));
  row.smsCents+=cleanSmsLedger(ledger).claims.filter(c=>c.phone===phone&&c.state!=='rejected').reduce((n,c)=>n+Math.max(c.cents,c.actualCents||0),0);rows.set(source,row);
 }return [...rows.values()].map(r=>({...r,costPerQuote:r.quoted?r.smsCents/r.quoted:null,costPerPolicy:r.won?r.smsCents/r.won:null}));
}
