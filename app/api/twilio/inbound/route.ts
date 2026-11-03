import {archiveInboundSmsMedia} from "../../../lib/incoming-message-media";
import { appendCommunication } from "../../../lib/communications";
import { phoneAssignmentForNumber } from "../../../lib/phone-assignments";
import { logError, logEvent } from "../../../lib/observability";
import {
  readStoredWorkspace,
  updateStoredWorkspace,
} from "../../../lib/workspace-storage";
import {
  rejectedTwilioWebhook,
  validateTwilioWebhook,
} from "../../../lib/twilio-webhook";
import { sendExpoPush } from "../../../lib/expo-push";
import { after } from "next/server";
import {isSmsStopReply,isSmsStartReply} from "../../../lib/message-inbox";

export const runtime = "nodejs";

const help = /^\s*(help|info)\s*[.!]?\s*$/i;
const digits = (value: string) => value.replace(/\D/g, "").slice(-10);

function twiml(message="") {
  const escaped=message.replace(/[<>&"']/g,value=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;","'":"&apos;"})[value]||value);
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${escaped?`<Message>${escaped}</Message>`:""}</Response>`,
    {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  if (!(await validateTwilioWebhook(request, form)))
    return rejectedTwilioWebhook();
  try {
    const to = String(form.get("To") || "");
    const from = String(form.get("From") || "");
    const body = String(form.get("Body") || "")
      .trim()
      .slice(0, 10000);
    const sid = String(
      form.get("MessageSid") || form.get("SmsSid") || crypto.randomUUID(),
    );
    const assignment = await phoneAssignmentForNumber(to);
    if (!assignment) {
      logError("inbound_sms_unassigned", new Error("No workspace assignment"), {
        toLast4: digits(to).slice(-4),
      });
      return twiml();
    }
    const workspace = await readStoredWorkspace(assignment.workspaceId);
    if (!workspace) return twiml();
    const optOutType=String(form.get("OptOutType")||"").toUpperCase();
    const isStop=optOutType==="STOP"||isSmsStopReply(body);
    const isStart=optOutType==="START"||isSmsStartReply(body);
    const isHelp=optOutType==="HELP"||help.test(body);
    const phone = digits(from);
    if (!phone) return twiml();
    const mediaCount=Math.min(10,Math.max(0,Number(form.get("NumMedia"))||0));
    const attachments=await archiveInboundSmsMedia(assignment.workspaceId,sid,mediaCount);
    let matched = false;
    let duplicate = false;
    await updateStoredWorkspace(assignment.workspaceId, (current) => {
      matched = false;
      duplicate = false;
      const leads = (current.leads as Array<Record<string, unknown>>).map(
        (raw) => {
          if (digits(String(raw.phone || "")) !== phone) return raw;
          matched = true;
          if (
            Array.isArray(raw.communications) &&
            raw.communications.some((item) => item.providerId === sid)
          ) {
            duplicate = true;
            return raw;
          }
          const sentAt = new Date().toISOString();
          const optedOut = isStop;
          const optedIn = isStart;
          return {
            ...raw,
            lastInboundAt: sentAt,
            automationEnabled: isStop?false:raw.automationEnabled,
            automationUpdatedAt: sentAt,
            lastContact: optedOut
              ? "STOP received · outreach closed"
              : "Text reply received",
            automationNextAt: "",
            automationStatus: optedOut ? "opted out" : raw.automationEnabled===false&&raw.automationStatus!=="replied"?raw.automationStatus:"replied",
            ...(optedOut
              ? {
                  smsOptOut: true,
                  smsConsent: false,
                  doNotCall: true,
                  stage: "Closed",
                  status: "Closed",
                  outcome: "Not interested",
                  sourceDisposition: "Lost - Not Interested",
                  followUp: "",
                }
              : optedIn
                ? { smsOptOut: false, smsConsent: true }
                : {}),
            communications: appendCommunication(raw.communications, {
              id: sid,
              channel: "sms",
              direction: "inbound",
              body,from,to,mediaCount,attachments,
              status: "received",
              sentAt,
              provider: "twilio",
              providerId: sid,
            }),
          };
        },
      );
      if (!matched) {
        const sentAt = new Date().toISOString(),
          optedOut = isStop;
        leads.unshift({
          id: Date.now(),
          name: `Inbound text · ${from.slice(-4)}`,
          phone: from,
          email: "",
          city: "",
          status: optedOut ? "Closed" : "Ready",
          stage: optedOut ? "Closed" : "New lead",
          outcome: optedOut ? "Not interested" : "Not contacted",
          notes: "Created automatically from an inbound text.",
          followUp: "",
          doNotCall: optedOut,
          lastContact: optedOut
            ? "STOP received · outreach closed"
            : "Text reply received",
          line: "life",
          source: "Inbound SMS",
          leadCost: 0,
          product: "Inbound inquiry",
          sourceDisposition: optedOut ? "Lost - Not Interested" : "New",
          importedAt: sentAt,
          received: sentAt,
          smsConsent: !optedOut&&!isHelp,
          smsOptOut: optedOut,
          lastInboundAt: sentAt,
          automationEnabled: false,
          automationUpdatedAt: sentAt,
          automationNextAt: "",
          automationStatus: optedOut ? "opted out" : "replied",
          communications: [
            {
              id: sid,
              channel: "sms",
              direction: "inbound",
              body,from,to,mediaCount,attachments,
              status: "received",
              sentAt,
              provider: "twilio",
              providerId: sid,
            },
          ],
        });
      }
      return { ...current, leads };
    });
    if (!duplicate)
      after(() => sendExpoPush(
        workspace.profile.expoPushToken,
        matched ? "New Pacifica message" : "New Pacifica lead",
        body,
        { channel: "sms" },
      ));
    logEvent("inbound_sms_saved", {
      workspaceId: assignment.workspaceId,
      matched,
      optedOut: isStop,
      fromLast4: phone.slice(-4),
    });
    if(isHelp&&!optOutType&&!duplicate){
      const profile=workspace.profile;
      const support=profile.callbackNumber||profile.replyToEmail||to;
      return twiml(`${profile.businessName||"Pacifica"}: For help, contact ${support}. Reply STOP to opt out. Message and data rates may apply.`);
    }
    return twiml();
  } catch (error) {
    logError("inbound_sms_failed", error);
    return new Response("Unable to save incoming message", { status: 500 });
  }
}
