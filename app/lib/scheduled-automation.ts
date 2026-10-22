import {runLeadWarming} from "./lead-warming-engine";
import {acquireAutomationLease,releaseAutomationLease} from './workspace-storage';
import {runDailyOutreach} from './daily-outreach';
import {runFollowUpAutomation} from './follow-up-engine';
import {runClientReminderAutomation} from './client-reminder-engine';
import {runOfficeReminders} from './office-reminder-engine';
export async function runScheduledAutomation(options:{workspaceId?:string;workspaceLimit?:number;sendLimit?:number}={}){
 const key='pacifica:v2:automation:run-lease',token=crypto.randomUUID();
 if(!await acquireAutomationLease(key,token))return {ok:true,alreadyRunning:true};
 try{
  const deadline=Date.now()+42000,settings={...options,deadline};
  const [daily,followUps,clientReminders,officeReminders,warming]=await Promise.allSettled([
   runDailyOutreach(settings),runFollowUpAutomation(settings),runClientReminderAutomation({...settings,sendLimit:10}),runOfficeReminders({...settings,sendLimit:10}),runLeadWarming(settings),
  ]);
  const result=Object.fromEntries([['daily',daily],['followUps',followUps],['clientReminders',clientReminders],['officeReminders',officeReminders],['warming',warming]].map(([name,r])=>{const value=r as PromiseSettledResult<unknown>;return [name,value.status==='fulfilled'?value.value:{error:value.reason instanceof Error?value.reason.message:'Job failed'}]}));
  return {ok:[daily,followUps,clientReminders,officeReminders,warming].every(r=>r.status==='fulfilled'),...result};
 }finally{await releaseAutomationLease(key,token)}
}
