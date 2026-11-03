import { getPacificaAccess } from "../../../lib/clerk-access";
import { isClerkConfigured } from "../../../lib/clerk-config";
import { phoneAssignmentForWorkspace } from "../../../lib/phone-assignments";
import { twilioClientIdentity } from "../../../lib/twilio-workspaces";
import { createVoiceRouteToken } from "../../../lib/voice-route-token";

import {createVoiceAccessToken} from "../../../lib/voice-access-token";
export const runtime = "nodejs";

export async function GET(request:Request) {
  const access=isClerkConfigured()?await getPacificaAccess():{allowed:!process.env.VERCEL,userId:"local",email:"local"};
  if(!access.allowed||!access.userId)return Response.json({error:"An active Pacifica subscription is required."},{status:403});
  const accountSid = (process.env.TWILIO_ACCOUNT_SID || "").trim();
  const apiKeySid = (process.env.TWILIO_API_KEY_SID || "").trim();
  const apiKeySecret = (process.env.TWILIO_API_KEY_SECRET || "").trim();
  const appSid = (process.env.TWILIO_TWIML_APP_SID || "").trim();
  if (!accountSid || !apiKeySid || !apiKeySecret || !appSid) {
    return Response.json({ error: "Twilio calling is waiting for its secure API key configuration." }, { status: 503 });
  }
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid) || !/^SK[a-f0-9]{32}$/i.test(apiKeySid) || !/^AP[a-f0-9]{32}$/i.test(appSid)) {
    return Response.json({ error: "One or more Twilio SIDs has the wrong format. Open Phone setup for details." }, { status: 503 });
  }
  try {
    const identity=twilioClientIdentity(access.userId);
    const nativeAndroid=Boolean(request&&new URL(request.url).searchParams.get("platform")==="android");
    const pushCredentialSid=nativeAndroid?(process.env.TWILIO_ANDROID_PUSH_CREDENTIAL_SID||"").trim():"";
    if(nativeAndroid&&!/^CR[a-f0-9]{32}$/i.test(pushCredentialSid))return Response.json({error:"Android incoming calls need the Pacifica Firebase and Twilio push configuration."},{status:503});
    const assignment=await phoneAssignmentForWorkspace(access.userId,access.email);
    if(!assignment)return Response.json({error:"This workspace does not have a phone number yet. Ask the Pacifica platform owner to assign one in Phone Number Center."},{status:409});
    if(assignment&&assignment.provider!=="twilio")return Response.json({error:`This workspace uses ${assignment.provider}. Its browser calling adapter is not connected yet.`},{status:409});
    const phoneNumber=assignment.phoneNumber;
    const [token,routeToken]=await Promise.all([
      createVoiceAccessToken({secret:apiKeySecret,accountSid,apiKeySid,appSid,identity,pushCredentialSid:pushCredentialSid||undefined}),
      createVoiceRouteToken({workspaceId:access.userId,identity,phoneNumber},apiKeySecret),
    ]);
    return Response.json({ token,routeToken, identity, provider:"twilio",phoneNumber, incomingEnabled:Boolean(phoneNumber), expiresIn: 3600 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[twilio/token] token generation failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Twilio token generation failed. Check the API key secret and redeploy." }, { status: 500 });
  }
}
