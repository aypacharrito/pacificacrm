import { isHostedRuntime } from "../../../lib/hosted-runtime";
import {getPacificaAccess} from "../../../lib/clerk-access";
import {isClerkConfigured} from "../../../lib/clerk-config";
import {outboundEmailStatus,inboundReplyAddress} from "../../../lib/outbound-email";
import {outboundSmsStatus} from "../../../lib/outbound-sms";
import {phoneAssignmentForWorkspace} from "../../../lib/phone-assignments";
import {readStoredWorkspace,workspaceRedis,workspaceRedisConfig} from "../../../lib/workspace-storage";

export const runtime="nodejs";

export async function GET(){
  const access=isClerkConfigured()?await getPacificaAccess():{allowed:!isHostedRuntime(),userId:"local",role:"owner" as const};if(!access.allowed)return Response.json({error:"Workspace access required"},{status:403});
  const [workspace,assignment,sms,lastRun]=await Promise.all([readStoredWorkspace(access.userId),phoneAssignmentForWorkspace(access.userId),outboundSmsStatus(access.userId),workspaceRedis(["GET","pacifica:v2:automation:last-run"]).catch(()=>null)]);const email=outboundEmailStatus();
  const voiceReady=Boolean(assignment?.phoneNumber&&process.env.TWILIO_TWIML_APP_SID);const storage=workspaceRedisConfig();const checks={storage:{ready:Boolean(storage.url&&storage.token)||Boolean(workspace),detail:storage.url?"Cloud workspace storage connected":"Fallback storage in use"},voice:{ready:voiceReady,detail:assignment?.phoneNumber||"No number assigned"},sms:{ready:sms.configured,detail:sms.message},email:{ready:email.configured,detail:email.message},emailReplies:{ready:Boolean(process.env.RESEND_WEBHOOK_SECRET&&inboundReplyAddress(access.userId)),detail:process.env.RESEND_WEBHOOK_SECRET&&inboundReplyAddress(access.userId)?"Signed inbound email webhook ready":"Add RESEND_WEBHOOK_SECRET and PACIFICA_INBOUND_EMAIL_DOMAIN"},automation:{ready:Boolean(process.env.CRON_SECRET&&workspace?.profile.serverAutomationEnabled),detail:workspace?.profile.serverAutomationEnabled?"Five-minute checks while open + daily server backup":"Turn on Autopilot in Automation Studio"},ai:{ready:Boolean(process.env.OPENAI_API_KEY),detail:process.env.OPENAI_API_KEY?"OpenAI key configured · test the connection in Pacifica AI":"Smart fallback only"},recording:{ready:voiceReady,detail:voiceReady?workspace?.profile.callAiSummaryEnabled?"Per-call recording · AI summary enabled in settings":"Per-call recording ready after consent":"Configure Twilio Voice first"}};
  const ready=Object.values(checks).filter(check=>check.ready).length;return Response.json({status:ready===Object.keys(checks).length?"launch ready":"setup needed",ready,total:Object.keys(checks).length,checks,lastAutomationRun:typeof lastRun==="string"?JSON.parse(lastRun):null,release:process.env.VERCEL_GIT_COMMIT_SHA?.slice(0,8)||"local"},{headers:{"Cache-Control":"no-store"}});
}
