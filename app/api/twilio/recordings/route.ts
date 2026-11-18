import { isHostedRuntime } from "../../../lib/hosted-runtime";
import {recordingPlaybackPath} from "../../../lib/recording-playback";
import {getPacificaAccess} from "../../../lib/clerk-access";
import {isClerkConfigured} from "../../../lib/clerk-config";
import {phoneAssignmentForWorkspace} from "../../../lib/phone-assignments";
import {twilioAccountConfig,twilioApiErrorMessage,twilioApiRequest,type TwilioApiError} from "../../../lib/twilio-rest";
import {twilioClientIdentity} from "../../../lib/twilio-workspaces";
import {readStoredWorkspace,saveWorkspaceChanges} from "../../../lib/workspace-storage";

export const runtime="nodejs";

type TwilioCall=TwilioApiError&{sid?:string;from?:string;to?:string;status?:string};
type TwilioRecording=TwilioApiError&{sid?:string;status?:string};

async function access(){const result=isClerkConfigured()?await getPacificaAccess():{allowed:!isHostedRuntime(),userId:"local",email:"local"};return result.allowed?result:null}
function callSid(value:string){return /^CA[a-f0-9]{32}$/i.test(value)?value:""}
function recordingSid(value:string){return /^RE[a-f0-9]{32}$/i.test(value)?value:""}
function callbackUrl(workspaceId:string,leadId:number){const base=(process.env.TWILIO_WEBHOOK_BASE_URL||"https://pacificacrm.com").trim().replace(/\/$/,"");return `${base}/api/twilio/recordings/status?workspace=${encodeURIComponent(workspaceId)}&lead=${leadId}`}

async function ownedCall(workspaceId:string,sid:string){
  const {accountSid,credentials}=twilioAccountConfig();const result=await twilioApiRequest<TwilioCall>(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${sid}.json`,{},credentials);
  if(!result.response.ok)throw new Error(twilioApiErrorMessage(result.data,"Twilio could not find this call"));
  const assignment=await phoneAssignmentForWorkspace(workspaceId);const identity=`client:${twilioClientIdentity(workspaceId)}`;const endpoints=[result.data.from,result.data.to];
  if(!endpoints.includes(identity)&&!endpoints.includes(assignment?.phoneNumber))throw new Error("This call does not belong to the signed-in workspace");
  return {accountSid,credentials,call:result.data};
}

export async function POST(request:Request){
  const workspace=await access();if(!workspace)return Response.json({error:"Workspace access required"},{status:403});
  try{
    const body=await request.json() as {action?:"start"|"stop"|"sync";callSid?:string;recordingSid?:string;recordingSids?:string[];leadId?:number;consentConfirmed?:boolean};
    if(body.action==="sync"){
      const stored=await readStoredWorkspace(workspace.userId);if(!stored)return Response.json({ok:true,callLogs:[]});
      const allowed=new Set(stored.callLogs.map(raw=>recordingSid(String((raw as Record<string,unknown>).recordingSid||""))).filter(Boolean));
      const requested=Array.from(new Set((body.recordingSids||[]).map(value=>recordingSid(String(value))).filter(value=>value&&allowed.has(value)))).slice(0,20);
      if(!requested.length)return Response.json({ok:true,callLogs:stored.callLogs});
      const {accountSid,credentials}=twilioAccountConfig();
      const results=await Promise.all(requested.map(async sid=>{const result=await twilioApiRequest<TwilioRecording>(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.json`,{},credentials);return result.response.ok?{sid,status:String(result.data.status||"")}:null}));
      const statuses=new Map(results.filter((item):item is {sid:string;status:string}=>Boolean(item)).map(item=>[item.sid,item.status]));let changed=false;
      const callLogs=stored.callLogs.map(raw=>{const log=raw as Record<string,unknown>;const sid=recordingSid(String(log.recordingSid||""));const status=statuses.get(sid);if(!status)return log;const recordingUrl=status==="completed"?`/api/twilio/recordings?sid=${sid}`:String(log.recordingUrl||"");if(log.recordingStatus===status&&String(log.recordingUrl||"")===recordingUrl)return log;changed=true;return {...log,recordingStatus:status,...(recordingUrl?{recordingUrl}:{})}});
      if(changed)await saveWorkspaceChanges(workspace.userId,stored,{...stored,callLogs});return Response.json({ok:true,callLogs});
    }
    const sid=callSid(String(body.callSid||""));if(!sid)return Response.json({error:"A live Twilio Call SID is required"},{status:400});
    const {accountSid,credentials}=await ownedCall(workspace.userId,sid);
    if(body.action==="stop"){
      const recording=recordingSid(String(body.recordingSid||""));if(!recording)return Response.json({error:"Recording SID is required"},{status:400});
      const form=new URLSearchParams({Status:"stopped"});const result=await twilioApiRequest<TwilioRecording>(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${sid}/Recordings/${recording}.json`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form.toString()},credentials);
      if(!result.response.ok)throw new Error(twilioApiErrorMessage(result.data,"Twilio could not stop recording"));return Response.json({ok:true,status:result.data.status||"stopped"});
    }
    if(body.consentConfirmed!==true)return Response.json({error:"Confirm that every participant received the legally required recording disclosure"},{status:400});
    const leadId=Math.max(0,Number(body.leadId)||0);const form=new URLSearchParams({RecordingChannels:"dual",RecordingTrack:"both",RecordingStatusCallback:callbackUrl(workspace.userId,leadId),RecordingStatusCallbackMethod:"POST",RecordingStatusCallbackEvent:"completed absent"});
    const result=await twilioApiRequest<TwilioRecording>(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${sid}/Recordings.json`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form.toString()},credentials);
    if(!result.response.ok||!result.data.sid)throw new Error(twilioApiErrorMessage(result.data,"Twilio could not start recording"));return Response.json({ok:true,recordingSid:result.data.sid,status:result.data.status||"in-progress"});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Recording request failed"},{status:500})}
}

export async function GET(request:Request){
  const workspace=await access();if(!workspace)return Response.json({error:"Workspace access required"},{status:403});
  try{
    const sid=recordingSid(new URL(request.url).searchParams.get("sid")||"");if(!sid)return Response.json({error:"Recording SID is invalid"},{status:400});
    const stored=await readStoredWorkspace(workspace.userId);const allowed=stored?.callLogs.some(raw=>recordingPlaybackPath((raw as {recordingSid?:string}).recordingSid,(raw as {recordingUrl?:string}).recordingUrl)===`/api/twilio/recordings?sid=${sid}`);if(!allowed)return Response.json({error:"Recording not found in this workspace"},{status:404});
    const {accountSid,credentials}=twilioAccountConfig();let response:Response|null=null;for(const credential of credentials){response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${sid}.mp3`,{headers:{Authorization:credential.authorization},cache:"no-store"});if(response.ok)break;if(response.status!==401&&response.status!==403)break}
    if(!response?.ok)return Response.json({error:"Twilio recording audio is unavailable"},{status:502});return new Response(response.body,{headers:{"Content-Type":"audio/mpeg","Cache-Control":"private, max-age=300","Content-Disposition":`inline; filename="${sid}.mp3"`}});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Recording unavailable"},{status:500})}
}
