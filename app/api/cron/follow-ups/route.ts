import {runScheduledAutomation} from "../../../lib/scheduled-automation";
import {workspaceRedis} from "../../../lib/workspace-storage";
import {logError} from "../../../lib/observability";

export const runtime="nodejs";
export const maxDuration=60;

function authorized(request:Request){
  const secret=(process.env.CRON_SECRET||"").trim();
  return Boolean(secret&&request.headers.get("authorization")===`Bearer ${secret}`);
}

export async function GET(request:Request){
  if(!authorized(request))return Response.json({error:process.env.CRON_SECRET?"Unauthorized":"CRON_SECRET is not configured"},{status:process.env.CRON_SECRET?401:503});
  const startedAt=new Date().toISOString();
  const previous=await workspaceRedis(["GET","pacifica:v2:automation:cloud-heartbeat"]);
  let previousStartedAt='';try{previousStartedAt=JSON.parse(String(previous)).startedAt||''}catch{}
  await workspaceRedis(["SET","pacifica:v2:automation:cloud-heartbeat",JSON.stringify({startedAt,previousStartedAt})]);
  try{
    const result=await runScheduledAutomation({trigger:'scheduled'});
    await workspaceRedis(["SET","pacifica:v2:automation:cloud-heartbeat",JSON.stringify({startedAt,previousStartedAt,completedAt:new Date().toISOString(),...result})]);
    return Response.json(result,{status:result.ok?200:500});
  }catch(error){logError("follow_up_automation_failed",error);return Response.json({error:error instanceof Error?error.message:"Automation run failed"},{status:500})}
}
