import { isGmailId, type GmailAddress, type GmailClient, type GmailHeader, type GmailMessage, type GmailPart } from "./gmail-triage-google";
import type { TriageMessage } from "./gmail-triage-policy.mjs";

const maxBodyBytes = 192 * 1024;
const carrierDomains = new Set([
  "joinroot.com", "rootinsurance.com", "qualitas.com.mx", "qualitasinsurance.com", "qualitasins.com",
  "mercuryinsurance.com", "ngic.com", "nationalgeneral.com", "progressive.com", "foremost.com",
  "bristolwest.com", "hagerty.com", "getethos.com", "farmers.com", "chubb.com", "grundy.com",
]);
const securitySenders = new Set([
  "no-reply@accounts.google.com", "no-reply@google.com", "security@stripe.com", "support@stripe.com",
  "notifications@stripe.com", "no-reply@stripe.com", "notify@stripe.com",
]);
const riskyNotice = /\b(?:suspicious|unrecognized|unexpected|unauthori[sz]ed|compromised|breach|exposure|fraud|blocked|investigat\w*)\b|was this you\?/iu;
const actionOrRecord = /\b(?:task|appointment|application|agent access|carrier|agency|quote|renewal|claim|policy|insur\w*|invoice|receipt|contract|audit|due by|deadline|your subscription|your account|your workspace|your data|project|action required|please (?:reply|send|submit|complete|review|confirm)|security|pacifica)\b/iu;
const technicalImpact = /\b(?:production|customer|suspension|outage|access|authentication|password|credential|data|deployment|pricing|price change|migration|breaking change|status update|incident|back up|downtime|deprecat\w*|service status)\b/iu;

export function gmailHeader(headers: GmailHeader[], name: string) {
  return headers.find(header => header.name.toLowerCase() === name)?.value || "";
}

function sender(headers: GmailHeader[]) {
  const from = headers.filter(header => header.name.toLowerCase() === "from");
  if (from.length !== 1) return "";
  const value = from[0].value.trim().toLowerCase();
  return (value.match(/<([^<>]+)>$/)?.[1] || value).match(/^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z0-9.-]+$/)?.[0] || "";
}

function authenticated(headers: GmailHeader[], address: string) {
  const domain = address.split("@")[1];
  const results = headers.filter(header => header.name.toLowerCase() === "authentication-results" &&
    /^\s*mx\.google\.com\s*;/i.test(header.value));
  if (!domain || results.length !== 1) return false;
  return results[0].value.split(";").some(part => /^\s*dmarc=pass\b/i.test(part) &&
    part.match(/\bheader\.from=([a-z0-9.-]+)(?:\s|$)/i)?.[1].toLowerCase() === domain);
}

function htmlText(html: string) {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", copy: "©", bull: "•" };
  return html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? match;
      const hex = entity[1].toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
}

async function body(message: GmailMessage, getPart: GmailClient["textPart"]) {
  const bodyParts: string[] = [];
  let attachmentCount = 0, complete = Boolean(message.payload), bytes = 0, parts = 0;
  async function read(part: GmailPart, depth: number): Promise<void> {
    if (depth > 16 || ++parts > 160) { complete = false; return; }
    const type = part.mimeType?.toLowerCase() || "";
    const headers = part.headers || [];
    if (part.filename || /^\s*attachment\b/i.test(gmailHeader(headers, "content-disposition")) ||
        (type && !type.startsWith("multipart/") && !["text/plain", "text/html"].includes(type))) {
      attachmentCount++;
      return;
    }
    if (type.startsWith("multipart/")) {
      if (!part.parts?.length) complete = false;
      for (const child of part.parts || []) await read(child, depth + 1);
      return;
    }
    const data = part.body;
    if (!["text/plain", "text/html"].includes(type) || !data || (data.size || 0) > maxBodyBytes - bytes) {
      complete = false;
      return;
    }
    const encoded = data.data ?? (data.attachmentId && isGmailId(message.id) ? (await getPart(message.id, data.attachmentId)).data : undefined);
    if (encoded === undefined && data.size === 0) return;
    if (typeof encoded !== "string" || !/^[\w-]*={0,2}$/.test(encoded) || encoded.length > Math.ceil((maxBodyBytes - bytes) * 4 / 3) + 4) {
      complete = false;
      return;
    }
    const raw = Buffer.from(encoded, "base64url");
    bytes += raw.length;
    if (bytes > maxBodyBytes || (typeof data.size === "number" && raw.length !== data.size)) { complete = false; return; }
    const charset = gmailHeader(headers, "content-type").match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || "utf-8";
    try {
      const decoded = new TextDecoder(charset, { fatal: true }).decode(raw);
      bodyParts.push(type === "text/html" ? htmlText(decoded) : decoded);
    } catch { complete = false; }
  }
  if (message.payload) await read(message.payload, 0);
  return { bodyComplete: complete && bodyParts.some(text => text.trim()), bodyParts, attachmentCount };
}

function priorityFor(subject: string, text: string, from: string): TriageMessage["priority"] {
  if (!carrierDomains.has(from.split("@")[1])) return;
  if (/\b(?:agency|producer)\b.{0,55}\bappointment\b|\bappointment\b.{0,55}\b(?:agency|producer)\b/iu.test(subject + " " + text) &&
      /\b(?:follow(?:ing)?[ -]up|application|next steps?|supporting documents?|required to complete)\b/iu.test(text)) {
    return { kind: "carrier_appointment", verified: true };
  }
  if (/\b(?:please (?:send|submit|provide|complete|return)|(?:we|underwriting) (?:need|require)|next steps? (?:are|include))\b/iu.test(text) &&
      /\b(?:appointment|agency|contract|carrier|underwriting|quoting|bind(?:ing)?|integrat\w*)\b/iu.test(subject + " " + text)) {
    return { kind: "carrier_next_step", verified: true };
  }
}

function noticeFor(subject: string, text: string, from: string): TriageMessage["securityNotice"] {
  if (!securitySenders.has(from) || riskyNotice.test(subject) || riskyNotice.test(text)) return;
  const type = subject.trim().replace(/[.!]$/, "");
  if (/^(?:a |new )?passkey (?:was |has been )?(?:added|created)(?: (?:to|on|for) (?:your |the )?(?:stripe |google )?account)?$/iu.test(type) ||
      /^(?:a )?new passkey(?: was)? added(?: to (?:your )?(?:stripe |google )?account)?$/iu.test(type)) {
    if (/\bpasskey\b.{0,70}\b(?:added|created)\b/iu.test(text)) return { kind: "passkey_change", verified: true, noticeOnly: true };
  }
  if (/^(?:your )?(?:stripe |google )?(?:account )?password (?:was |has been )?changed$/iu.test(type) && /\bpassword\b.{0,70}\b(?:changed|updated)\b/iu.test(text)) {
    return { kind: "password_change", verified: true, noticeOnly: true };
  }
  if (/^(?:a )?new (?:app(?:lication)?|third-party app) (?:was )?connected(?: to your (?:stripe |google )?account)?$/iu.test(type) && /\b(?:app|application)\b.{0,90}\b(?:connected|access was granted)\b/iu.test(text)) {
    return { kind: "app_connection", verified: true, noticeOnly: true };
  }
  if (/^(?:verify your email(?: address)?|(?:your )?(?:google |stripe )?verification code)$/iu.test(type) &&
      /\b(?:expires?|valid)\b.{0,45}\b(?:\d{1,2} minutes?|\d{1,2} hours?|one hour)\b/iu.test(text) &&
      !/\b(?:before (?:your|we)|required to (?:receive|continue|enable|access))\b/iu.test(text)) {
    return { kind: "email_verification", verified: true, noticeOnly: true };
  }
  if (/^(?:new sign[ -]in|security alert)$/iu.test(type) &&
      /\b(?:new sign[ -]in|signed in)\b/iu.test(text) && /\bno (?:further )?action (?:is )?(?:needed|required)\b/iu.test(text)) {
    return { kind: "sign_in", verified: true, noticeOnly: true };
  }
}

export async function normalizeGmailMessage(raw: GmailMessage, mailboxId: GmailAddress, getPart: GmailClient["textPart"], isNewArrival: boolean, now = Date.now()): Promise<TriageMessage> {
  const labels = raw.labelIds ?? [];
  if (!isGmailId(raw.id) || !isGmailId(raw.threadId) || !Array.isArray(labels) || !labels.every(label => typeof label === "string")) {
    throw new Error("Gmail message metadata is incomplete");
  }
  const content = await body(raw, getPart);
  const headers = raw.payload?.headers || [];
  const from = sender(headers), subject = gmailHeader(headers, "subject");
  const text = content.bodyParts.join("\n").replace(/\s+/gu, " ").trim();
  const senderAuthenticated = authenticated(headers, from);
  const priority = senderAuthenticated ? priorityFor(subject, text, from) : undefined;
  const securityNotice = senderAuthenticated ? noticeFor(subject, text, from) : undefined;
  const verifiedIncident = senderAuthenticated && securitySenders.has(from) && riskyNotice.test(subject);
  const full = `${subject} ${text}`, receivedAtMs = Number(raw.internalDate);
  const unrelated = senderAuthenticated && !carrierDomains.has(from.split("@")[1]) &&
    !actionOrRecord.test(full) && !technicalImpact.test(full) && !/&[a-z]+;/i.test(text);
  const bulk = unrelated && /\b(?:bulk|list)\b/i.test(gmailHeader(headers, "precedence")) && /<[^>]+>/.test(gmailHeader(headers, "list-unsubscribe"));
  const old = Number.isSafeInteger(receivedAtMs) && receivedAtMs > 0 && now - receivedAtMs >= 7 * 86_400_000;
  let templateMatch: TriageMessage["templateMatch"];
  if (bulk && labels.includes("CATEGORY_PROMOTIONS") && /\b(?:sale|discount|save \d+|\d+% off|promo code|limited.time offer|shop now|newsletter)\b/iu.test(full)) {
    templateMatch = { id: "authenticated_bulk_promotion", kind: "marketing", approved: true, exact: true };
  } else if (bulk && old && labels.some(label => label === "CATEGORY_UPDATES" || label === "CATEGORY_SOCIAL") &&
      /^(?:weekly|monthly|daily|product) (?:digest|newsletter|roundup|update)|^(?:release notes|what.s new)(?:\s|$)/iu.test(subject)) {
    templateMatch = { id: "authenticated_stale_digest", kind: "generic_update", approved: true, exact: true };
  } else if (unrelated && old && labels.includes("CATEGORY_UPDATES") &&
      /^(?:support )?ticket (?:#[\da-z-]+ )?(?:was |has been )?(?:closed|resolved)[.!]?$/iu.test(subject.trim()) &&
      /\b(?:marked|considered) (?:closed|resolved)\b/iu.test(text) && /\bno (?:reply|further action) (?:is )?(?:needed|required)\b/iu.test(text) &&
      !/\b(?:reopen|still |unresolved|refund|dispute)\b/iu.test(text)) {
    templateMatch = { id: "authenticated_closed_notice", kind: "resolved_notice", approved: true, exact: true, resolutionVerified: true };
  }
  return {
    id: raw.id, threadId: raw.threadId, mailboxId, mailboxVerified: true, direction: "inbound", labels,
    subject, ...content, senderAuthenticated, receivedAtMs, isNewArrival,
    ownerHold: labels.some(label => label.startsWith("Label_")),
    securityIncidentOpen: verifiedIncident, priority, securityNotice,
    urgency: verifiedIncident ? { kind: "security_incident", verified: true } : undefined,
    templateMatch,
  };
}
