import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { gmailConfig, type GmailAddress } from "./gmail-triage-google";
import { workspaceRedis } from "./workspace-redis";
import { acquireAutomationLease, releaseAutomationLease } from "./workspace-storage";

export const emptyGmailPreferences = {
  star: false,
  tasks: false,
  trash: false,
  sms: false,
  starredReview: false,
  model: false,
};
export type GmailPreferences = typeof emptyGmailPreferences;
export type GmailTask = {
  id: string;
  threadId?: string;
  messageId?: string;
  messageAt?: number;
  title: string;
  open: boolean;
  updatedAt: number;
};
export type GmailScan = { kind: "starred" | "recovery"; after: number; anchor: string; pageToken?: string };
export type GmailPage = { ids: string[]; nextPageToken?: string; historyId?: string };
export type GmailConnection = {
  ownerId: string;
  address: GmailAddress;
  refreshToken: string;
  connectedAt: number;
  coverageAt: number;
  cursor: string;
  historyPageToken?: string;
  scan?: GmailScan;
  page?: GmailPage;
  watchExpiresAt: number;
  preferences: GmailPreferences;
  tasks: GmailTask[];
  rechecks: Record<string, number>;
  lastRunAt?: number;
  status?: string;
  stats: Record<string, number>;
};

const sharedKey = "pacifica:gmail-triage:v1";
const connectionKey = (address: GmailAddress) => `${sharedKey}:grant:${address}`;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const seenKey = (connection: GmailConnection, kind: string, id: string) =>
  `${sharedKey}:${kind}:${digest(JSON.stringify([connection.ownerId, connection.address, connection.connectedAt, id]))}`;

export function sealGmail(value: unknown, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(gmailConfig().encryptionKey, "hex"), iv);
  cipher.setAAD(Buffer.from(`gmail-triage-v1:${context}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openGmail<T>(value: string, context: string): T {
  const data = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(gmailConfig().encryptionKey, "hex"), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(`gmail-triage-v1:${context}`));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8")) as T;
}

export async function readGmailConnection(address: GmailAddress) {
  const raw = await workspaceRedis(["GET", connectionKey(address)]);
  if (typeof raw !== "string") return null;
  const connection = openGmail<GmailConnection>(raw, address);
  if (connection.address !== address) throw new Error("Gmail grant does not match its mailbox");
  return connection;
}

export async function writeGmailConnection(connection: GmailConnection) {
  await workspaceRedis(["SET", connectionKey(connection.address), sealGmail(connection, connection.address)]);
}

export async function removeGmailConnection(address: GmailAddress) {
  await workspaceRedis(["DEL", connectionKey(address)]);
}

export async function withGmailLock<T>(address: GmailAddress, operation: () => Promise<T>): Promise<T | null> {
  const key = `${connectionKey(address)}:lease`;
  const token = randomUUID();
  if (!await acquireAutomationLease(key, token, 120)) return null;
  try { return await operation(); }
  finally { await releaseAutomationLease(key, token); }
}

export async function gmailMessageSeen(connection: GmailConnection, id: string) {
  return await workspaceRedis(["GET", seenKey(connection, "seen", id)]) === "1";
}

export async function markGmailMessageSeen(connection: GmailConnection, id: string) {
  await workspaceRedis(["SET", seenKey(connection, "seen", id), "1", "EX", 32 * 86400]);
}

export async function claimGmailText(connection: GmailConnection, key: string) {
  return await workspaceRedis(["SET", seenKey(connection, "sms", key), "1", "NX", "EX", 32 * 86400]) === "OK";
}

export async function claimGmailReview(ownerId: string, localDate: string) {
  return await workspaceRedis(["SET", `${sharedKey}:reminder:${digest(JSON.stringify([ownerId, localDate]))}`, "1", "NX", "EX", 3 * 86400]) === "OK";
}
