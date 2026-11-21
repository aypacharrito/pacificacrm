const classificationLevels = new Set(["urgent", "important", "action", "record", "digest", "disposable", "unknown"]);
const trashKinds = new Set(["marketing", "generic_update", "expired_code", "resolved_notice", "routine_duplicate"]);
const urgencyKinds = new Set(["hard_deadline", "time_sensitive_quote", "active_incident", "security_incident"]);
const priorityKinds = new Set([
  "carrier_appointment", "carrier_next_step", "material_carrier_reply", "quote_or_binding",
  "license_or_contract", "commission_or_coverage", "service_or_billing_deadline",
]);
const securityNoticeKinds = new Set([
  "security_alert", "sign_in", "password_change", "passkey_change",
  "email_verification", "app_connection", "verification_code",
]);
const securityRetentionMs = 7 * 24 * 60 * 60 * 1000;
const embeddedInstructions = /\b(?:ignore (?:all|earlier|prior|previous) instructions|override (?:all|your|the) instructions|new system prompt)\b/iu;

const recordLanguage = [
  /\b(?:quote request|request(?:ed)? a quote|bind coverage|binder|proof of insurance|policy (?:number|renewal|cancellation)|underwriting|claim (?:number|status)|notice of nonrenewal|cotizaci[oó]n|renovaci[oó]n de p[oó]liza|reclamo de seguro)\b/iu,
  /\b(?:invoice|receipt|payment (?:failed|due|confirmed)|commission statement|banking information|factura|pago rechazado|recibo de pago)\b/iu,
  /\b(?:court (?:order|hearing)|filing deadline|legal notice|tax form|audit request|fecha l[ií]mite|audiencia judicial|aviso legal)\b/iu,
];
const otherProtectedLanguage = [
  /\b(?:Pacifica CRM|production (?:database|deployment|incident|outage)|service suspension|database (?:suspended|recovery)|system outage|failed deployment)\b/iu,
  /\b(?:unexpected sign[ -]in|unrecognized (?:device|sign[ -]in)|suspicious (?:sign[ -]in|activity)|unauthori[sz]ed access|data (?:breach|exposure)|password (?:changed|reset)|passkey (?:added|created)|account recovery)\b/iu,
];

export const policyVersion = "pacifica-email-triage-2";

function clean(value) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function validId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function evidenceInMessage(assessment, sections) {
  const evidence = assessment?.evidence;
  if (!classificationLevels.has(assessment?.level) || !Number.isInteger(evidence?.section) ||
      typeof evidence?.quote !== "string" || !sections[evidence.section]) {
    return false;
  }
  const quote = clean(evidence.quote);
  return quote.length >= 5 && quote.length <= 240 && sections[evidence.section].includes(quote);
}

function decision(message, policy, level, reason, proposedActions, extra) {
  const effects = [];
  if (policy?.mode === "active") {
    for (const kind of proposedActions) {
      if (kind === "gmail_trash" && policy.trashEnabled !== true) continue;
      if (kind === "gmail_star" && (policy.starEnabled !== true || message.labels.includes("STARRED"))) continue;
      if (kind === "create_task" && policy.tasksEnabled !== true) continue;
      if (kind === "text_owner" &&
          (policy.textEnabled !== true || policy.ownerPhoneVerified !== true || message.isNewArrival !== true)) continue;

      let identity = message.id;
      if (kind === "create_task") identity = message.threadId;
      if (kind === "text_owner") {
        const incident = level === "urgent" ? message.urgency?.incidentId : message.priority?.incidentId;
        if (validId(incident)) identity = incident;
      }
      effects.push({
        kind,
        mailboxId: message.mailboxId,
        messageId: message.id,
        idempotencyKey: JSON.stringify([message.mailboxId, kind, identity]),
      });
    }
  }
  return { policyVersion, level, reason, proposedActions, effects, ...extra };
}

function routineSecurityNotice(message, now, result, reason, codeExpiry = 0) {
  const receipt = message.receivedAtMs;
  if (!Number.isSafeInteger(receipt) || receipt <= 0 || !Number.isFinite(now) || receipt > now) {
    return result("review", "security_notice_age_unverified", ["queue_review"]);
  }
  const dueAt = new Date(Math.max(receipt + securityRetentionMs, codeExpiry));
  if (!Number.isFinite(dueAt.getTime())) {
    return result("review", "security_notice_age_unverified", ["queue_review"]);
  }
  if (dueAt.getTime() > now) {
    return result("keep", "security_notice_retention", [], { recheckAt: dueAt.toISOString() });
  }
  if (message.threadReviewed !== true || message.threadProtected !== false) {
    return result("review", "security_notice_thread_unverified", ["queue_review"]);
  }
  return result("trash", reason, ["gmail_trash"]);
}

/**
 * Evaluate one decoded email. Supply Gmail and CRM facts in message and mailbox
 * policy in policy. Supply the tool-free model's response in assessment.
 * Dispatch returned effects only through the CRM's revalidation and outbox.
 */
export function decideEmail(message, policy, assessment = null, now = Date.now()) {
  const result = (level, reason, actions = [], extra) => decision(message, policy, level, reason, actions, extra);

  if (!validId(message?.id) || !validId(message?.threadId) || !validId(policy?.mailboxId) ||
      message.mailboxId !== policy.mailboxId || message.mailboxVerified !== true ||
      message.direction !== "inbound" || !Array.isArray(message.labels) ||
      !message.labels.every(label => typeof label === "string")) {
    return result("review", "mailbox_or_message_unverified");
  }
  if (message.labels.some(label => ["SENT", "DRAFT", "TRASH"].includes(label))) {
    return result("keep", "outside_incoming_action_scope");
  }
  if (message.labels.includes("SPAM")) {
    return result("review", "spam_folder", ["queue_review"]);
  }
  if (message.bodyComplete !== true || typeof message.subject !== "string" ||
      !Array.isArray(message.bodyParts) || ![...message.bodyParts].every(part => typeof part === "string") ||
      !Number.isInteger(message.attachmentCount) || message.attachmentCount < 0) {
    return result("review", "incomplete_content", ["queue_review"]);
  }

  const sections = [message.subject, ...message.bodyParts].map(clean);
  const hardProtection = message.labels.includes("STARRED") || message.ownerHold === true ||
    message.attachmentCount > 0 || message.threadProtected === true || message.businessRecord === true ||
    message.securityIncidentOpen === true ||
    recordLanguage.some(pattern => sections.some(section => pattern.test(section)));
  const otherProtection = otherProtectedLanguage.some(pattern => sections.some(section => pattern.test(section)));
  const protection = hardProtection || otherProtection || message.labels.includes("IMPORTANT");

  if (sections.some(section => embeddedInstructions.test(section))) {
    return result("review", "embedded_instructions", ["queue_review"]);
  }
  const priorityActions = ["gmail_star", "create_task"];
  if (message.isNewArrival === true) priorityActions.push("text_owner");
  if (message.senderAuthenticated === true && message.urgency?.verified === true &&
      urgencyKinds.has(message.urgency.kind)) {
    return result("urgent", message.urgency.kind, priorityActions);
  }
  if (message.senderAuthenticated === true && message.priority?.verified === true &&
      priorityKinds.has(message.priority.kind)) {
    return result("important", message.priority.kind, priorityActions);
  }
  if (assessment !== null && !evidenceInMessage(assessment, sections)) {
    return result(protection ? "keep" : "review", "assessment_evidence_unverified", protection ? [] : ["queue_review"]);
  }
  if (assessment?.level === "urgent" || assessment?.level === "important") {
    return result("review", "priority_unverified", ["queue_review"]);
  }
  if (assessment?.level === "action") {
    return result("action", "actionable_message", ["create_task"]);
  }
  if (hardProtection || assessment?.level === "record") {
    return result("keep", "protected_message");
  }
  const notice = message.securityNotice;
  if (notice) {
    if (notice.actionPending === true) return result("keep", "security_action_pending");
    if (notice.verified !== true || notice.noticeOnly !== true || !securityNoticeKinds.has(notice.kind) ||
        message.senderAuthenticated !== true) {
      return result("review", "security_notice_unverified", ["queue_review"]);
    }
    return routineSecurityNotice(message, now, result, "security_notice_aged");
  }
  const match = message.templateMatch;
  if (otherProtection || (message.labels.includes("IMPORTANT") && match?.kind !== "expired_code")) {
    return result("keep", "protected_message");
  }
  if (assessment?.level === "digest") {
    return result("digest", "optional_email");
  }

  const suggestsTrash = assessment?.level === "disposable" || (assessment === null && match?.exact === true);
  if (!suggestsTrash || message.threadReviewed !== true || message.threadProtected !== false ||
      message.senderAuthenticated !== true || match?.approved !== true || !validId(match.id) ||
      !trashKinds.has(match.kind) || (match.exact !== true && match.family !== true)) {
    return result("review", "trash_evidence_insufficient", ["queue_review"]);
  }
  if (match.kind === "expired_code") {
    const expiry = typeof match.expiresAt === "string" && /(?:Z|[+-]\d{2}:\d{2})$/u.test(match.expiresAt)
      ? Date.parse(match.expiresAt)
      : NaN;
    if (!Number.isFinite(expiry)) {
      return result("review", "code_expiry_unverified", ["queue_review"]);
    }
    return routineSecurityNotice(message, now, result, "expired_code", expiry);
  }
  if (match.kind === "resolved_notice" && match.resolutionVerified !== true) {
    return result("review", "resolution_unverified", ["queue_review"]);
  }
  if (match.kind === "routine_duplicate" && match.retainedEquivalentVerified !== true) {
    return result("review", "retained_copy_unverified", ["queue_review"]);
  }
  return result("trash", match.kind, ["gmail_trash"]);
}

export function planStarredReview({ ownerId, localDate, pendingCount }, policy) {
  if (!validId(ownerId) || ownerId !== policy?.ownerId || !/^\d{4}-\d{2}-\d{2}$/.test(localDate) ||
      !Number.isSafeInteger(pendingCount) || pendingCount < 1) {
    return null;
  }
  const date = new Date(localDate + "T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== localDate) return null;

  const proposedActions = ["create_star_review_task"];
  if (policy.textStarredReviewEnabled === true) proposedActions.push("text_star_review");
  const effects = policy.mode === "active" && policy.starredReviewEnabled === true
    ? proposedActions
      .filter(kind => kind !== "text_star_review" || (policy.textEnabled === true && policy.ownerPhoneVerified === true))
      .map(kind => ({
        kind,
        ownerId,
        pendingCount,
        idempotencyKey: JSON.stringify([ownerId, kind, localDate]),
      }))
    : [];
  return { policyVersion, pendingCount, localDate, proposedActions, effects };
}
