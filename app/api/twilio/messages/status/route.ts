import {settleSms} from "../../../../lib/sms-budget";
import {twilioAccountConfig,twilioApiRequest} from "../../../../lib/twilio-rest";
import { logError, logEvent } from "../../../../lib/observability";
import {
  rejectedTwilioWebhook,
  validateTwilioWebhook,
} from "../../../../lib/twilio-webhook";
import {
  readStoredWorkspace,
  updateStoredWorkspace,
} from "../../../../lib/workspace-storage";
import {
  isSmsOptOutError,
  nextSmsDeliveryStatus,
} from "../../../../lib/sms-delivery";

export const runtime = "nodejs";

function safeWorkspace(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 160);
}

export async function POST(request: Request) {
  const form = await request.formData();
  if (!(await validateTwilioWebhook(request, form)))
    return rejectedTwilioWebhook();
  const workspaceId = safeWorkspace(
    new URL(request.url).searchParams.get("workspace") || "",
  );
  const providerId = String(form.get("MessageSid") || form.get("SmsSid") || "");
  const status = String(
    form.get("MessageStatus") || form.get("SmsStatus") || "unknown",
  ).toLowerCase();
  const errorCode = String(form.get("ErrorCode") || "");
  if (!workspaceId || !providerId)
    return Response.json({ received: true, ignored: true });
  logEvent("sms_delivery_received", {
    workspaceId,
    providerId,
    status,
    errorCode: errorCode || undefined,
  });
  try {
    const workspace = await readStoredWorkspace(workspaceId);
    if (!workspace) return Response.json({ received: true, ignored: true });
    let matched = false;
    await updateStoredWorkspace(workspaceId, (current) => {
      matched = false;
      const leads = current.leads.map((raw) => {
        const lead = raw as Record<string, unknown>;
        const communications = Array.isArray(lead.communications)
          ? (lead.communications as Array<Record<string, unknown>>)
          : [];
        let leadMatched = false;
        const updated = communications.map((item) => {
          if (item.providerId !== providerId) return item;
          matched = true;
          leadMatched = true;
          const next = nextSmsDeliveryStatus(String(item.status || ""), status);
          return next === item.status
            ? item
            : {
                ...item,
                status: next,
                failureReason: errorCode ? `Twilio ${errorCode}` : undefined,
              };
        });
        if (!leadMatched) return lead;
        const optedOut = isSmsOptOutError(errorCode);
        return {
          ...lead,
          communications: updated,
          ...(optedOut
            ? {
                smsOptOut: true,
                smsConsent: false,
                automationEnabled: false,
                automationStatus: "opted out",
                automationNextAt: "",
                lastInboundAt: new Date().toISOString(),
              }
            : {}),
        };
      });
      return matched ? { ...current, leads } : current;
    });
    if(matched){
      try{const {accountSid,credentials}=twilioAccountConfig();
        const billed=await twilioApiRequest<{price?:string}>(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${encodeURIComponent(providerId)}.json`,{},credentials);
        if(billed.response.ok&&billed.data.price!=null&&Number.isFinite(Number(billed.data.price)))await settleSms(workspaceId,providerId,{actualCents:Math.ceil(Math.abs(Number(billed.data.price))*100)});
      }catch{logEvent("sms_cost_reconciliation_pending",{workspaceId,providerId});}
    }
    logEvent("sms_delivery_updated", {
      workspaceId,
      status,
      errorCode: errorCode || undefined,
      matched,
    });
    return Response.json({ received: true, matched });
  } catch (error) {
    logError("sms_delivery_callback_failed", error, { workspaceId, status });
    return Response.json(
      { error: "SMS delivery callback failed" },
      { status: 500 },
    );
  }
}
