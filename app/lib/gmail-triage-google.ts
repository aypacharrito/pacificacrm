import { createPublicKey, verify, type JsonWebKey } from "node:crypto";
import { workspaceRedisConfig } from "./workspace-redis";

export type GmailAddress = string;
export function gmailAddresses(): GmailAddress[] {
  const values = [...new Set((process.env.GMAIL_TRIAGE_MAILBOXES || "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean))];
  return values.length <= 2 && values.every(address => /^[a-z0-9][a-z0-9.+]{0,63}@gmail\.com$/.test(address)) ? values : [];
}
export const gmailScope = "https://www.googleapis.com/auth/gmail.modify";
export const isGmailAddress = (address: unknown): address is GmailAddress => typeof address === "string" && gmailAddresses().includes(address);
export const isGmailId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,160}$/.test(id);
export const isHistoryId = (id: unknown): id is string => typeof id === "string" && /^\d{1,32}$/.test(id);

export function gmailConfig() {
  const clientId = process.env.GMAIL_TRIAGE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GMAIL_TRIAGE_CLIENT_SECRET?.trim() || "";
  const redirectUri = process.env.GMAIL_TRIAGE_REDIRECT_URI?.trim() || "";
  const encryptionKey = process.env.GMAIL_TRIAGE_ENCRYPTION_KEY?.trim() || "";
  const topic = process.env.GMAIL_TRIAGE_TOPIC?.trim() || "";
  const pushAudience = process.env.GMAIL_TRIAGE_PUSH_AUDIENCE?.trim() || "";
  const pushServiceAccount = process.env.GMAIL_TRIAGE_PUSH_SERVICE_ACCOUNT?.trim() || "";
  const subscription = process.env.GMAIL_TRIAGE_SUBSCRIPTION?.trim() || "";
  const { url, token } = workspaceRedisConfig();
  let redirectOk = false;
  try {
    const redirect = new URL(redirectUri);
    redirectOk = redirect.protocol === "https:" && !redirect.username && !redirect.password &&
      redirect.pathname === "/api/integrations/gmail/callback" && !redirect.search && !redirect.hash;
  } catch { /* The setup screen identifies a missing configuration. */ }
  const ready = Boolean(clientId && clientSecret && redirectOk && /^[a-f\d]{64}$/i.test(encryptionKey) && url && token && gmailAddresses().length);
  const pushReady = ready && /^projects\/[^/]+\/topics\/[^/]+$/.test(topic) &&
    /^projects\/[^/]+\/subscriptions\/[^/]+$/.test(subscription) && Boolean(pushAudience && pushServiceAccount);
  return { clientId, clientSecret, redirectUri, encryptionKey, ready, pushReady, topic, pushAudience, pushServiceAccount, subscription };
}

export class GmailRequestError extends Error {
  constructor(public status: number) { super(`Gmail request failed (${status})`); }
}

export type GmailHeader = { name: string; value: string };
export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};
export type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailPart;
};
export type GmailSummary = { id?: string; threadId?: string };
export type GmailHistory = {
  historyId?: string;
  nextPageToken?: string;
  history?: { messagesAdded?: { message?: GmailSummary }[] }[];
};

export async function gmailTokens(parameters: Record<string, string>) {
  const config = gmailConfig();
  if (!config.ready) throw new Error("Gmail setup is incomplete");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }),
    signal: AbortSignal.timeout(6500),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new GmailRequestError(response.status);
  const tokens = await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
  if (!tokens.access_token) throw new Error("Google did not return an access token");
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, scope: tokens.scope };
}

export function gmailClient(accessToken: string) {
  async function request<T>(path: string, options?: { method: "POST"; body?: unknown }): Promise<T> {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
      method: options?.method || "GET",
      body: options?.body === undefined ? undefined : JSON.stringify(options.body),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(6500),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) throw new GmailRequestError(response.status);
    return response.json() as Promise<T>;
  }
  const enc = encodeURIComponent;
  return {
    profile: () => request<{ emailAddress?: string; historyId?: string }>("profile"),
    watch: (topicName: string) => request<{ expiration?: string; historyId?: string }>("watch", { method: "POST", body: { topicName } }),
    history: (cursor: string, token: string) => request<GmailHistory>(`history?${new URLSearchParams({ startHistoryId: cursor, historyTypes: "messageAdded", maxResults: "50", ...(token ? { pageToken: token } : {}) })}`),
    list: (query: string, token = "", size = 50) => request<{ messages?: GmailSummary[]; nextPageToken?: string }>(`messages?${new URLSearchParams({ q: query, maxResults: String(size), ...(token ? { pageToken: token } : {}) })}`),
    message: (id: string) => request<GmailMessage>(`messages/${enc(id)}?format=full`),
    thread: (id: string) => request<{ id?: string; messages?: GmailMessage[] }>(`threads/${enc(id)}?format=full`),
    textPart: (id: string, part: string) => request<{ data?: string }>(`messages/${enc(id)}/attachments/${enc(part)}`),
    star: (id: string) => request<GmailMessage>(`messages/${enc(id)}/modify`, { method: "POST", body: { addLabelIds: ["STARRED"] } }),
    trash: (id: string) => request<GmailMessage>(`messages/${enc(id)}/trash`, { method: "POST" }),
  };
}

export type GmailClient = ReturnType<typeof gmailClient>;

let googleKeys: { keys: Array<JsonWebKey & { kid?: string }>; until: number } | undefined;

export async function authenticateGmailPush(authorization: string | null, config = gmailConfig()) {
  if (!config.pushReady || !authorization?.startsWith("Bearer ") || authorization.length > 8192) return false;
  const pieces = authorization.slice(7).split(".");
  if (pieces.length !== 3 || pieces.some(piece => !/^[\w-]+$/.test(piece))) return false;
  try {
    const header = JSON.parse(Buffer.from(pieces[0], "base64url").toString()) as { alg?: string; kid?: string };
    const claims = JSON.parse(Buffer.from(pieces[1], "base64url").toString()) as Record<string, unknown>;
    const now = Date.now() / 1000;
    if (header.alg !== "RS256" || !header.kid || !["https://accounts.google.com", "accounts.google.com"].includes(String(claims.iss)) ||
        claims.aud !== config.pushAudience || claims.email !== config.pushServiceAccount || claims.email_verified !== true ||
        typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp <= now ||
        typeof claims.iat !== "number" || !Number.isFinite(claims.iat) || claims.iat > now + 60 || claims.iat < now - 7200) return false;
    if (!googleKeys || googleKeys.until <= Date.now()) {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", { signal: AbortSignal.timeout(4500), redirect: "error" });
      if (!response.ok) return false;
      const data = await response.json() as { keys?: Array<JsonWebKey & { kid?: string }> };
      if (!Array.isArray(data.keys)) return false;
      const maxAge = Number(response.headers.get("cache-control")?.match(/(?:^|[ ,])max-age=(\d+)/)?.[1] || 300);
      googleKeys = { keys: data.keys, until: Date.now() + Math.min(maxAge, 3600) * 1000 };
    }
    const key = googleKeys.keys.find(item => item.kid === header.kid && item.kty === "RSA");
    return Boolean(key && verify("RSA-SHA256", Buffer.from(`${pieces[0]}.${pieces[1]}`),
      createPublicKey({ key, format: "jwk" }), Buffer.from(pieces[2], "base64url")));
  } catch { return false; }
}
