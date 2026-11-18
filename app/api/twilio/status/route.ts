import { isHostedRuntime } from "../../../lib/hosted-runtime";
import { applyCallDetection } from "../../../lib/call-detection";
import { reconcileVoiceStatus } from "../../../lib/voice-call-results";
import {
  readStoredWorkspace,
  updateStoredWorkspace,
} from "../../../lib/workspace-storage";
import { getPacificaAccess } from "../../../lib/clerk-access";
import { isClerkConfigured } from "../../../lib/clerk-config";
import { phoneAssignmentForWorkspace } from "../../../lib/phone-assignments";
import {
  rejectedTwilioWebhook,
  validateTwilioWebhook,
} from "../../../lib/twilio-webhook";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const access = isClerkConfigured()
    ? await getPacificaAccess()
    : { allowed: !isHostedRuntime(), userId: "local", email: "local" };
  if (!access.allowed)
    return Response.json(
      {
        configured: false,
        error: "An active Pacifica subscription is required.",
      },
      { status: 403 },
    );
  const callSid = new URL(request.url).searchParams.get("callSid");
  if (callSid) {
    if (!/^CA[a-f0-9]{32}$/i.test(callSid))
      return Response.json({ error: "Invalid call" }, { status: 400 });
    const workspace = await readStoredWorkspace(access.userId);
    const log = workspace?.callLogs.find(
      (raw) => (raw as { callSid?: string }).callSid === callSid,
    ) as Record<string, unknown> | undefined;
    return Response.json(
      {
        result: log
          ? {
              callSid: log.callSid,
              humanDetected: log.humanDetected,
              answeredBy: log.answeredBy,
              detectionStatus: log.detectionStatus,
              detectedResult: log.detectedResult,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  const assignment = await phoneAssignmentForWorkspace(
    access.userId,
    access.email,
  );
  const phoneNumber = assignment?.phoneNumber || "";
  const provider = assignment?.provider || "twilio";
  const configured =
    provider === "twilio" &&
    Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_API_KEY_SID &&
        process.env.TWILIO_API_KEY_SECRET &&
        process.env.TWILIO_TWIML_APP_SID &&
        phoneNumber,
    );
  return Response.json(
    {
      configured,
      provider,
      phoneNumber: phoneNumber || "No number assigned",
      mode: "Browser / Wi-Fi",
      assignmentSource: assignment?.assignedBy || "none",
      smsStatus: assignment?.smsStatus || "unassigned",
      error:
        provider !== "twilio"
          ? `${provider} browser calling is not connected yet.`
          : undefined,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  if (!(await validateTwilioWebhook(request, form)))
    return rejectedTwilioWebhook();
  const params = new URL(request.url).searchParams;
  const workspaceId = params.get("workspaceId") || "";
  const callSid = String(form.get("CallSid") || "");
  const parentCallSid = String(
    form.get("ParentCallSid") || params.get("parentCallSid") || "",
  );
  const startedAt = params.get("startedAt") || "";
  const phone = params.get("phone") || "";
  // The signed callback URL is constructed only after the voice route resolves its tenant.
  if (
    !workspaceId ||
    !/^CA[a-f0-9]{32}$/i.test(callSid) ||
    !/^\+[1-9]\d{7,14}$/.test(phone) ||
    !Number.isFinite(Date.parse(startedAt))
  )
    return new Response(null, { status: 204 });
  if (parentCallSid && !/^CA[a-f0-9]{32}$/i.test(parentCallSid))
    return new Response(null, { status: 400 });
  try {
    const workspace = await readStoredWorkspace(workspaceId);
    if (!workspace) return new Response(null, { status: 204 });
    await updateStoredWorkspace(workspaceId, (current) => {
     const detected={
      ...current,
      ...applyCallDetection(current, {
        callSid,
        parentCallSid,
        phone,
        startedAt,
        status: String(form.get("CallStatus") || ""),
        answeredBy: String(form.get("AnsweredBy") || ""),
        sequence: form.has("SequenceNumber")
          ? Number(form.get("SequenceNumber"))
          : -1,
        duration: Math.max(0, Number(form.get("CallDuration")) || 0),
      }),
      // AI call facts belong in the call log; existing contact fields stay untouched.
      ...(params.has('aiPilot')?{leads:current.leads}:{}),
     };
     return params.has('aiPilot')?reconcileVoiceStatus(detected,params.get('aiPilot')||'',parentCallSid||callSid,phone):detected;
    });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json(
      { error: "Unable to save call result" },
      { status: 500 },
    );
  }
}
