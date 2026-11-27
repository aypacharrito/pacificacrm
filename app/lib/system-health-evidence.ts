import type {StoredWorkspace} from "./workspace-storage";

type Row = Record<string, unknown>;
export type CapabilityEvidence = {at: string; reason: string};
type EvidenceOptions = {
  smsFrom?: string;
  emailProvider?: "resend" | "webhook" | "none";
  replyAddress?: string | null;
};

function records(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => Boolean(row) && typeof row === "object") : [];
}

function latest(rows: Row[], when: (row: Row) => unknown, reason: string): CapabilityEvidence | null {
  let newest = -Infinity;
  for (const row of rows) {
    const value = when(row);
    const time = typeof value === "string" ? Date.parse(value) : NaN;
    if (Number.isFinite(time) && time > newest) newest = time;
  }
  return Number.isFinite(newest) ? {at: new Date(newest).toISOString(), reason} : null;
}

/** Return timestamps and capability descriptions only. Message and recording contents stay in the workspace. */
export function workspaceCapabilityEvidence(
  workspace: Pick<StoredWorkspace, "leads" | "callLogs"> | null,
  {smsFrom, emailProvider, replyAddress}: EvidenceOptions = {},
) {
  const messages = records(workspace?.leads).flatMap(lead => records(lead.communications));
  const calls = records(workspace?.callLogs);
  const outbound = messages.filter(m => m.direction === "outbound" && m.providerId);
  const sms = outbound.filter(m => m.channel === "sms" && m.provider === "twilio" &&
    (!smsFrom || smsFrom === m.from) && ["delivered", "read"].includes(String(m.status)));
  const email = outbound.filter(m => m.channel === "email" &&
    (m.provider === "resend" || m.provider === "webhook") && (!emailProvider || m.provider === emailProvider) &&
    ["sent", "delivered", "opened", "clicked"].includes(String(m.status)));
  const incoming = messages.filter(m => m.direction === "inbound" && m.channel === "email" &&
    m.provider === "resend" && m.providerId && m.status === "received" && replyAddress &&
    String(m.to || "").split(",").some(to => to.trim().toLowerCase() === replyAddress.toLowerCase()));
  return {
    sms: latest(sms, m => m.sentAt, "Twilio recorded delivery for the workspace number"),
    email: latest(email, m => m.sentAt, "The configured email provider accepted a workspace message"),
    emailReplies: latest(incoming, m => m.sentAt, "An incoming reply was recorded for the workspace reply address"),
    voice: latest(calls.filter(c => c.callSid && c.detectionStatus === "completed"),
      c => c.detectionUpdatedAt || c.startedAt, "A completed call was recorded in this workspace"),
    recording: latest(calls.filter(c => c.recordingSid && c.recordingStatus === "completed"),
      c => c.startedAt, "A recording was marked complete for this call"),
  };
}
