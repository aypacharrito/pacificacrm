import {cleanWarming,hasInbound,outboundHistory,phoneKey,type WarmingLead} from './lead-warming-policy';
import {blocksAutomatedText} from './ai-sms-recipients';
import {hasContactPermission} from './contact-permission';
import type {WorkspaceProfile} from './workspace-profile';
/** Recovery is one bounded attempt for a real overdue task, never a new cold list. */
export function missedFollowUp(leads:WarmingLead[],profile:WorkspaceProfile,now=Date.now()):string|null{
 const settings=cleanWarming(profile.leadWarming);
 if(!settings.enabled||!settings.recoverMissedFollowUps||!leads.length||phoneKey(leads[0].phone).length!==10)return null;
 if(leads.some(l=>blocksAutomatedText(l)||l.deletedAt||l.doNotCall||l.smsOptOut||hasInbound(l)||['review','closed','interested'].includes(l.nurture?.phase||'')||(Date.parse(l.nurture?.resumeAt||'')||0)>now))return null;
 if(!leads.some(l=>hasContactPermission(l,profile,'sms')))return null;
 const history=outboundHistory(leads,'sms');if(history.length>=settings.maxUnansweredTexts)return null;
 const due=leads.map(l=>Date.parse(String(l.followUp||''))).filter(t=>Number.isFinite(t)&&t<=now-86400000&&t>=now-365*86400000).sort((a,b)=>a-b)[0];
 if(!due)return null;
 const last=Math.max(0,...history.map(m=>Date.parse(m.sentAt)||0));
 if(last>=due||last&&now-last<settings.gapHours*3600000)return null;
 const key=`recovery:${phoneKey(leads[0].phone)}:${new Date(due).toISOString()}`;
 if(leads.some(l=>l.nurture?.actions?.[key]))return null;
 return key;
}
