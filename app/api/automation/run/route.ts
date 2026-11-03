import {runScheduledAutomation} from "../../../lib/scheduled-automation";
import {getPacificaAccess} from "../../../lib/clerk-access";
import {isClerkConfigured} from "../../../lib/clerk-config";
import {workspaceRedis,readStoredWorkspace} from "../../../lib/workspace-storage";
import {cloudAutomationHealth,cloudCheckIntervalMinutes} from "../../../lib/cloud-schedule";

export const runtime="nodejs";
export const maxDuration=60;

async function access(){
  const result=isClerkConfigured()?await getPacificaAccess():{allowed:!process.env.VERCEL,userId:"local",role:"owner" as const};
  return result.allowed?result:null;
}

export async function GET(){
  const workspace=await access();if(!workspace)return Response.json({error:"Workspace access required"},{status:403});
  const stored=await workspaceRedis(["GET","pacifica:v2:automation:cloud-heartbeat"]);
  let heartbeat=null;try{heartbeat=typeof stored==="string"?JSON.parse(stored):null}catch{}
  const {healthy}=cloudAutomationHealth(heartbeat);
  const current=await readStoredWorkspace(workspace.userId);
  const attention=(current?.leads||[]).flatMap(raw=>{const lead=raw as {id:number;name:string;dailyOutreach?:Record<string,{state:string;at:string;error?:string}>};return Object.entries(lead.dailyOutreach||{}).filter(([,r])=>r.state==='review'||r.state==='sending'&&Date.now()-Date.parse(r.at)>120000).map(([channel,r])=>({leadId:lead.id,name:lead.name,channel,error:r.error||'Delivery was not confirmed; no automatic retry was made.'}))}).slice(0,20);
  const receipts=new Map<string,{state:string}>();
  for(const raw of current?.leads||[]){const lead=raw as {dailyOutreach?:Record<string,{claim:string;state:string}>};for(const receipt of Object.values(lead.dailyOutreach||{}))receipts.set(receipt.claim,receipt);}
  const dailySummary={submitted:[...receipts.values()].filter(r=>r.state==='sent').length,review:[...receipts.values()].filter(r=>r.state==='review').length};
  return Response.json({dailySummary,attention,configured:Boolean(process.env.CRON_SECRET),healthy,browserSchedule:"Cloud automation runs independently of this app",serverSchedule:healthy?`Cloud checks run every ${cloudCheckIntervalMinutes} minutes, even when this app is closed. Daily outreach starts at your saved local time.`:"A recent cloud check was not confirmed. Check status before relying on automatic outreach.",lastRun:heartbeat?.completedAt?{completedAt:heartbeat.completedAt,ok:heartbeat.ok}:null,cloudLastStartedAt:heartbeat?.startedAt||null},{headers:{"Cache-Control":"no-store"}});
}

export async function POST(){
  const workspace=await access();if(!workspace)return Response.json({error:"Workspace access required"},{status:403});
  try{return Response.json(await runScheduledAutomation({workspaceId:workspace.userId,workspaceLimit:1,sendLimit:50}))}
  catch(error){return Response.json({error:error instanceof Error?error.message:"Automation run failed"},{status:500})}
}
