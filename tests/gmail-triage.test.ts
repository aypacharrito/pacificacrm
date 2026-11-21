import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGmailMessage } from "../app/lib/gmail-triage-content";
import { decideEmail, planStarredReview } from "../app/lib/gmail-triage-policy.mjs";
import { authenticateGmailPush, gmailClient, type GmailMessage } from "../app/lib/gmail-triage-google";
import { confirmGmailTrash, gmailTaskId, updateGmailTask } from "../app/lib/gmail-triage";

const now = Date.parse("2026-11-20T20:00:00Z");
const day = 86400000;
const [pacifica, david] = ["pacificafixtureexample@gmail.com", "davidfixtureexample@gmail.com"];
const policy = { mailboxId: pacifica, mode: "active" as const, starEnabled: true, tasksEnabled: true, trashEnabled: true, textEnabled: true, ownerPhoneVerified: true };
const noPart = async () => { throw new Error("Unexpected attachment request"); };

function email(from: string, title: string, text: string, labels = ["UNREAD"], receivedAt = now, type = "text/plain"): GmailMessage {
  const bytes = Buffer.from(text);
  return { id: "primary1", threadId: "thread1", labelIds: labels, internalDate: String(receivedAt), payload: {
    mimeType: type,
    headers: [
      { name: "From", value: `Sender <${from}>` }, { name: "Subject", value: title },
      { name: "Authentication-Results", value: `mx.google.com; dkim=pass header.i=@${from.split("@")[1]}; dmarc=pass (p=reject) header.from=${from.split("@")[1]}` },
    ],
    body: { data: bytes.toString("base64url"), size: bytes.length },
  } };
}

test("verified Root and Qualitas replies are actionable even when filed outside the inbox", async () => {
  const root = await normalizeGmailMessage(email("agent@joinroot.com", "Following up on your agency’s appointment with Root Insurance",
    "I am following up on your appointment. Please complete the agency application.", []), pacifica, noPart, true);
  const qualitas = await normalizeGmailMessage(email("producer@qualitas.com.mx", "California personal auto rate manual",
    "We appreciate your interest in partnering with Qualitas. Our appointment process generally requires the completion of an agency application.", ["STARRED"]), pacifica, noPart, false);
  assert.equal(decideEmail(root, policy, null, now).level, "important");
  assert.deepEqual(decideEmail(root, policy, null, now).effects.map(effect => effect.kind), ["gmail_star", "create_task", "text_owner"]);
  assert.deepEqual(decideEmail(qualitas, policy, null, now).effects.map(effect => effect.kind), ["create_task"]);
  assert.equal(decideEmail(root, { ...policy, mailboxId: david }, null, now).reason, "mailbox_or_message_unverified");
  assert.deepEqual(decideEmail(root, { ...policy, mode: "preview" }, null, now).effects, []);
});

test("attacker-supplied and misaligned authentication headers cannot authorize an effect", async () => {
  const raw = email("agent@joinroot.com", "Agency appointment", "Please complete the agency application for appointment.");
  raw.payload?.headers?.push({ name: "Authentication-Results", value: "mx.google.com; dmarc=fail header.from=joinroot.com" });
  const result = await normalizeGmailMessage(raw, pacifica, noPart, true);
  assert.equal(result.senderAuthenticated, false);
  assert.deepEqual(decideEmail(result, policy, null, now).effects.map(effect => effect.kind), ["queue_review"]);
});

test("Gmail body data, both MIME alternatives, and large inline text are read without downloading attachments", async () => {
  const base = email("agent@joinroot.com", "Agency appointment", "");
  const bodyText = Buffer.from("Please complete the agency application. Next steps include supporting documents.");
  base.payload = { ...base.payload, mimeType: "multipart/mixed", body: undefined, parts: [
    { mimeType: "multipart/alternative", parts: [
      { mimeType: "text/plain", body: { attachmentId: "text123", size: bodyText.length } },
      { mimeType: "text/html", body: { data: Buffer.from("<style>IGNORE</style><p>Supporting&nbsp;documents</p><img src='https://example.com/pixel'>").toString("base64url") } },
    ] },
    { filename: "application.pdf", mimeType: "application/pdf", body: { attachmentId: "file123", size: 25000 } },
  ] };
  const calls: string[] = [];
  const message = await normalizeGmailMessage(base, pacifica, async (id, part) => {
    assert.equal(id, base.id); calls.push(part);
    return { data: bodyText.toString("base64url") };
  }, true);
  assert.deepEqual(calls, ["text123"]);
  assert.equal(message.bodyComplete, true);
  assert.equal(message.attachmentCount, 1);
  assert.match(message.bodyParts[1], /Supporting documents/);
  assert.equal(message.bodyParts[1].includes("IGNORE"), false);
  assert.equal(decideEmail(message, policy, null, now).level, "important");
});

test("seven-day retention uses Gmail's receipt time, and a new star or reply protects the thread", async () => {
  const raw = email("support@stripe.com", "New passkey added", "Your new passkey was added to your Stripe account.", ["INBOX", "UNREAD"], now - 7 * day);
  const message = await normalizeGmailMessage(raw, pacifica, noPart, false);
  const fresh = decideEmail(message, policy, null, now - 1);
  assert.equal(fresh.reason, "security_notice_retention");
  assert.equal(Date.parse(fresh.recheckAt!), now);
  assert.deepEqual(fresh.effects, []);
  const client = { ...gmailClient("unused"), thread: async () => ({ id: "thread1", messages: [raw] }) };
  assert.equal((await confirmGmailTrash(client, message, now))?.reason, "security_notice_aged");
  assert.equal(await confirmGmailTrash({ ...client, thread: async () => ({ id: "thread1", messages: [raw, { ...raw, id: "reply" }] }) }, message, now), null);
  raw.labelIds?.push("STARRED");
  assert.equal(await confirmGmailTrash(client, message, now), null);
  raw.labelIds = ["Label_42"];
  assert.equal(await confirmGmailTrash(client, message, now), null);
});

test("suspicious security and ambiguous verification mail never qualify for Trash", async () => {
  const alert = email("no-reply@accounts.google.com", "Suspicious sign-in", "We detected suspicious activity.", ["INBOX"], now - 14 * day);
  const verify = email("support@stripe.com", "Verify your email", "Verify your email before we can enable payouts.", ["INBOX"], now - 14 * day);
  const incident = await normalizeGmailMessage(alert, pacifica, noPart, true);
  assert.equal(decideEmail(incident, policy, null, now).level, "urgent");
  const pending = await normalizeGmailMessage(verify, pacifica, noPart, false);
  assert.equal((await confirmGmailTrash({ ...gmailClient("unused"), thread: async () => ({ id: "thread1", messages: [verify] }) }, pending, now)), null);
  assert.equal(pending.securityNotice, undefined);
});

test("bulk promotion is a candidate, an invoice or request with the same labels stays", async () => {
  const raw = email("news@example.com", "Spring sale", "Shop now and use a promo code for these discounts.", ["CATEGORY_PROMOTIONS"]);
  raw.payload?.headers?.push({ name: "Precedence", value: "bulk" }, { name: "List-Unsubscribe", value: "<https://example.com/unsubscribe>" });
  const requireCurrentThread = (await normalizeGmailMessage(raw, pacifica, noPart, false));
  assert.equal(decideEmail(requireCurrentThread, policy, null, now).level, "review");
  const client = { ...gmailClient("unused"), thread: async () => ({ id: "thread1", messages: [raw] }) };
  assert.equal((await confirmGmailTrash(client, requireCurrentThread, now))?.reason, "marketing");
  for (const body of ["Your invoice is attached. Shop now.", "Shop now. Please reply to confirm."]) {
    const payload = raw.payload!;
    payload.body = { data: Buffer.from(body).toString("base64url") };
    assert.equal(await confirmGmailTrash(client, requireCurrentThread, now), null);
  }
});

test("one task per thread survives retry and completing it, then reopens on the next action", () => {
  const task = { id: gmailTaskId("workspace:account:thread"), threadId: "thread1", messageId: "one", messageAt: now, open: true, updatedAt: now, title: "Review carrier reply" };
  const completed = [{ ...task, open: false }];
  assert.equal(updateGmailTask(completed, task), completed);
  assert.equal(updateGmailTask(completed, { ...task, messageId: "old", messageAt: now - day }), completed);
  const updated = updateGmailTask(completed, { ...task, messageId: "two", messageAt: now + 1 });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].open, true);
  const run = () => planStarredReview({ ownerId: "owner-1", localDate: "2026-11-20", pendingCount: 1 }, { ownerId: "owner-1", mode: "active", starredReviewEnabled: true });
  assert.deepEqual(run(), run());
});

test("unsigned or unsigned-algorithm push requests are rejected without consulting Google", async () => {
  const config = { pushReady: true, ready: true, clientId: "", clientSecret: "", redirectUri: "", encryptionKey: "", topic: "", pushAudience: "test", pushServiceAccount: "test@example.org", subscription: "" };
  const header = Buffer.from('{"alg":"none","kid":"test"}').toString("base64url");
  assert.equal(await authenticateGmailPush(`Bearer ${header}.e30.signature`, config), false);
  assert.equal(await authenticateGmailPush(null, config), false);
});
