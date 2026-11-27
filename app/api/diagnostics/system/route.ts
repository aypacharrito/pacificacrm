import {deployInfo, isHostedRuntime} from "../../../lib/hosted-runtime";
import {getPacificaAccess} from "../../../lib/clerk-access";
import {isClerkConfigured} from "../../../lib/clerk-config";
import {outboundEmailStatus, inboundReplyAddress} from "../../../lib/outbound-email";
import {outboundSmsStatus} from "../../../lib/outbound-sms";
import {phoneAssignmentForWorkspace} from "../../../lib/phone-assignments";
import {readStoredWorkspace, workspaceRedisConfig} from "../../../lib/workspace-storage";
import {workspaceCapabilityEvidence, type CapabilityEvidence} from "../../../lib/system-health-evidence";
import {readHealthRuns} from "../../../lib/workspace-health-runs";

export const runtime = "nodejs";

function check(configured: boolean, evidence: CapabilityEvidence | null, reason: string, nextAction: string, current = true) {
  const ready = configured && Boolean(evidence) && current;
  const detail = ready && evidence ? evidence.reason : reason;
  return {ready, configured, observedAt: evidence?.at ?? null, reason: detail, detail,
    nextAction: ready ? "Refresh to review newer activity." : nextAction};
}

export async function GET() {
  const access = isClerkConfigured() ? await getPacificaAccess() : {allowed: !isHostedRuntime(), userId: "local", email: ""};
  if (!access.allowed) return Response.json({error: "Workspace access required"}, {status: 403});
  const [workspaceRead, assignmentRead, smsRead, runsRead] = await Promise.allSettled([
    readStoredWorkspace(access.userId), phoneAssignmentForWorkspace(access.userId, access.email),
    outboundSmsStatus(access.userId, access.email), readHealthRuns(access.userId),
  ]);
  const workspace = workspaceRead.status === "fulfilled" ? workspaceRead.value : null;
  const assignment = assignmentRead.status === "fulfilled" ? assignmentRead.value : null;
  const sms = smsRead.status === "fulfilled" ? smsRead.value : null;
  const runs = runsRead.status === "fulfilled" ? runsRead.value : null;
  const email = outboundEmailStatus(), storage = workspaceRedisConfig(), replyAddress = inboundReplyAddress(access.userId);
  const observed = workspaceCapabilityEvidence(workspace, {smsFrom: sms?.from, emailProvider: email.provider, replyAddress});
  const checkedAt = new Date().toISOString();
  const voiceConfigured = Boolean(assignment?.provider === "twilio" && assignment.phoneNumber &&
    process.env.TWILIO_TWIML_APP_SID && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_API_KEY_SID &&
    process.env.TWILIO_API_KEY_SECRET && process.env.TWILIO_AUTH_TOKEN);
  const replyConfigured = Boolean(process.env.RESEND_WEBHOOK_SECRET && replyAddress);
  const automationConfigured = Boolean(process.env.CRON_SECRET && workspace?.profile.serverAutomationEnabled);
  const manualStatus = runs?.manual ? " Last manual follow-up pass completed at " + runs.manual + "." : "";
  const checks = {
    storage: check(Boolean(workspace || storage.url && storage.token),
      workspace ? {at: checkedAt, reason: "Workspace read succeeded at refresh time."} : null,
      workspaceRead.status === "rejected" ? "The workspace read failed." :
        storage.url && storage.token ? "Storage is configured. This workspace has no saved record." : "Cloud storage is not configured.",
      "Reload this workspace and check its storage settings."),
    voice: check(voiceConfigured, observed.voice, voiceConfigured ? "Calling is configured. No completed call has been observed." :
      "Set up the workspace number, voice application, and signed callbacks.", "Check the result of a consented test call."),
    sms: check(Boolean(sms?.configured), observed.sms, sms?.configured ? "This number has no recorded delivery yet." :
      sms?.message || "The workspace number could not be checked.", "Review registration and delivery history for this number."),
    email: check(email.configured, observed.email, email.configured ? "The provider has yet to accept a workspace email." :
      email.message, "Check an agency email in the provider delivery history."),
    emailReplies: check(replyConfigured, observed.emailReplies, replyConfigured ? "No reply has been recorded for this address." :
      "Configure the signed inbound email webhook and reply domain.", "Review a reply in the workspace inbox."),
    automation: check(automationConfigured, runs?.scheduled ? {at: runs.scheduled, reason: "A scheduled follow-up pass checked this workspace." + manualStatus} : null,
      (automationConfigured ? "A recent scheduled follow-up pass has yet to be verified for this workspace." : "Workspace Autopilot or the scheduler is disabled.") + manualStatus,
      "Review the saved automation pause and the scheduler run history.", Boolean(runs?.scheduledRecent)),
    ai: check(Boolean(process.env.OPENAI_API_KEY), runs?.ai ? {at: runs.ai, reason: "Doxa completed a provider-backed CRM response."} : null,
      process.env.OPENAI_API_KEY ? "Doxa is configured. No provider-backed CRM result has been recorded." : "The AI provider is not configured.",
      "Ask Doxa a CRM question and check its result."),
    recording: check(voiceConfigured && Boolean(workspace?.profile.callRecordingEnabled), observed.recording,
      !voiceConfigured ? "Set up calling and its signed callbacks." : !workspace?.profile.callRecordingEnabled ?
        "Recording is turned off in this workspace." : "No completed recording callback has been recorded.",
      "With consent, review the recording in its call log."),
  };
  const ready = Object.values(checks).filter(item => item.ready).length;
  return Response.json({status: ready === Object.keys(checks).length ? "observed" : "needs verification",
    ready, total: Object.keys(checks).length, checks, checkedAt,
    lastAutomationRun: runs?.scheduled ? {completedAt: runs.scheduled, trigger: "scheduled"} : null,
    lastManualRun: runs?.manual ?? null, release: deployInfo().release}, {headers: {"Cache-Control": "no-store"}});
}
