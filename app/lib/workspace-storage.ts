import {cleanSmsLedger,type SmsLedger} from "./sms-budget";
import {cleanVoicePilot,cleanVoiceHistory,type VoicePilotRun,type VoiceCallHistory} from "./voice-pilot";
import {cleanDocumentInsights,type DocumentInsight} from "./review-context";
import {cleanMinerState,type MinerState} from "./miner-leads";
import {cleanNoteReminders,type NoteReminder,type NoteReview} from "./note-reminders";
import {cleanConversationCalendar,type ConversationCalendar} from "./conversation-calendar";
import {reconcileCallCalendar} from "./call-calendar";
import {cleanAiControl,type AiControl} from "./ai-control";
import {cleanOfficeItems,type OfficeItem} from "./office-schedule";
import {cleanQuoteIntake,type QuoteIntakeState} from "./quote-intake";
import { mergeCallDetection } from "./call-detection";
import { mergeAiCallResult } from "./voice-call-results";
import { mergeCloudContact } from "./contact-sync";
import { deletionState } from "./lead-deletion";
import {
  cleanWorkspaceProfile,
  type WorkspaceProfile,
} from "./workspace-profile";
import { applyWorkspaceChanges } from "./workspace-changes";
import {WorkspaceLoadError} from "./workspace-load";

export type StoredWorkspace = {
  smsLedger?:SmsLedger;
  voicePilot?:VoicePilotRun;
  voicePilotBlocked?:string[];
  voicePilotHistory?:VoiceCallHistory[];
  minerState?:MinerState;
  documentInsights?:DocumentInsight[];
  noteReminders?:NoteReminder[];
  noteReview?:NoteReview;
  conversationCalendar?: ConversationCalendar;
  aiControl?: AiControl;
  quoteIntake?: QuoteIntakeState;
  officeItems?: OfficeItem[];
  leads: unknown[];
  callLogs: unknown[];
  profile: WorkspaceProfile;
};
export type WorkspaceRecord = {
  workspaceId: string;
  workspace: StoredWorkspace;
};

const workspaceVersion = "v2";
export const workspaceKey = (userId: string) =>
  `pacifica:${workspaceVersion}:workspace:${userId}`;
export const workspaceDatabaseId = (userId: string) =>
  `${workspaceVersion}:${userId}`;

export function cleanWorkspacePayload(value: unknown): StoredWorkspace {
  const body =
    value && typeof value === "object"
      ? (value as Partial<StoredWorkspace>)
      : {};
  const records = (items: unknown, limit: number) =>
    Array.isArray(items)
      ? items
          .filter(
            (item) =>
              item &&
              typeof item === "object" &&
              !Array.isArray(item) &&
              ["string", "number"].includes(typeof item.id),
          )
          .slice(0, limit)
      : [];
  return {
    leads: records(body.leads, 5000),
    smsLedger:cleanSmsLedger(body.smsLedger),
    ...(Array.isArray(body.voicePilotBlocked)?{voicePilotBlocked:body.voicePilotBlocked.filter(v=>typeof v==="string"&&/^\+1\d{10}$/.test(v)).slice(-5000)}:{}),
    ...(body.voicePilot?{voicePilot:cleanVoicePilot(body.voicePilot)}:{}),
    voicePilotHistory:cleanVoiceHistory(body.voicePilotHistory),
    ...(body.minerState?{minerState:cleanMinerState(body.minerState)}:{}),
    ...(body.documentInsights?{documentInsights:cleanDocumentInsights(body.documentInsights)}:{}),
    ...(body.noteReminders?{noteReminders:cleanNoteReminders(body.noteReminders)}:{}),
    ...(body.noteReview?{noteReview:body.noteReview}:{}),
    callLogs: records(body.callLogs, 1000),
    profile: cleanWorkspaceProfile(body.profile),
    ...(body.conversationCalendar?{conversationCalendar:cleanConversationCalendar(body.conversationCalendar)}:{}),
    ...(body.aiControl?{aiControl:cleanAiControl(body.aiControl)}:{}),
    ...(body.officeItems?{officeItems:cleanOfficeItems(body.officeItems)}:{}),
    ...(body.quoteIntake?{quoteIntake:cleanQuoteIntake(body.quoteIntake)}:{}),
  };
}

function newer(left: unknown, right: unknown) {
  const a = new Date(String(left || "")).getTime();
  const b = new Date(String(right || "")).getTime();
  return Number.isFinite(a) && (!Number.isFinite(b) || a > b);
}
function mergeCommunications(server: unknown, client: unknown) {
  const items = [
    ...(Array.isArray(client) ? client : []),
    ...(Array.isArray(server) ? server : []),
  ];
  const unique = new Map<string, unknown>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { id?: unknown; providerId?: unknown };
    const key = String(item.providerId || item.id || JSON.stringify(raw));
    unique.set(key, raw);
  }
  return Array.from(unique.values());
}
function workspaceIdentityKeys(lead: Record<string, unknown>) {
  const phone = String(lead.phone || "")
      .replace(/\D/g, "")
      .slice(-10),
    email = String(lead.email || "")
      .trim()
      .toLowerCase(),
    vendor = String(lead.vendorId || "").trim(),
    source = String(lead.source || "")
      .trim()
      .toLowerCase();
  return [
    phone.length >= 7 ? `phone:${phone}` : "",
    email.includes("@") ? `email:${email}` : "",
    vendor ? `vendor:${source}:${vendor}` : "",
  ].filter(Boolean);
}
function workspaceDeletionTime(lead: Record<string, unknown>) {
  const time = Date.parse(
    String(lead.deletionUpdatedAt || lead.deletedAt || ""),
  );
  return Number.isFinite(time) ? time : 0;
}
function workspaceDeletionDecisions(leads: Array<Record<string, unknown>>) {
  const map = new Map<string, Record<string, unknown>>();
  for (const lead of leads) {
    if (!workspaceDeletionTime(lead)) continue;
    for (const key of workspaceIdentityKeys(lead)) {
      const previous = map.get(key);
      if (
        !previous ||
        workspaceDeletionTime(lead) >= workspaceDeletionTime(previous)
      )
        map.set(key, lead);
    }
  }
  return map;
}
function protectWorkspaceLead(
  lead: Record<string, unknown>,
  decisions: Map<string, Record<string, unknown>>,
) {
  let latest: Record<string, unknown> | undefined;
  for (const key of workspaceIdentityKeys(lead)) {
    const candidate = decisions.get(key);
    if (
      candidate &&
      (!latest ||
        workspaceDeletionTime(candidate) >= workspaceDeletionTime(latest))
    )
      latest = candidate;
  }
  return latest
    ? {
        ...lead,
        ...deletionState(
          lead as { deletedAt?: string; deletionUpdatedAt?: string },
          latest as { deletedAt?: string; deletionUpdatedAt?: string },
        ),
      }
    : lead;
}

export function mergeStoredWorkspace(
  server: StoredWorkspace | null,
  incoming: StoredWorkspace,
): StoredWorkspace {
  if (!server) return cleanWorkspacePayload({...incoming,officeItems:reconcileCallCalendar([],incoming.leads as Record<string,unknown>[],[])});
  const rawServerLeads = server.leads as Array<Record<string, unknown>>,
    rawIncomingLeads = incoming.leads as Array<Record<string, unknown>>,
    identityDecisions = workspaceDeletionDecisions([
      ...rawServerLeads,
      ...rawIncomingLeads,
    ]);
  const serverLeads = rawServerLeads.map((lead) =>
      protectWorkspaceLead(lead, identityDecisions),
    ),
    incomingLeads = rawIncomingLeads.map((lead) =>
      protectWorkspaceLead(lead, identityDecisions),
    ),
    incomingIds = new Set(incomingLeads.map((lead) => String(lead.id)));
  const byId = new Map(serverLeads.map((lead) => [String(lead.id), lead]));
  const leads = incomingLeads.map((client) => {
    const previous = byId.get(String(client.id));
    if (!previous) return client;
    const serverReplyNewer = newer(
      previous.lastInboundAt,
      client.lastInboundAt,
    );
    const serverAutomationNewer = newer(
      previous.automationUpdatedAt,
      client.automationUpdatedAt,
    );
    const reminderKeys = Array.from(
      new Set([
        ...(Array.isArray(client.clientReminderKeys)
          ? client.clientReminderKeys.map(String)
          : []),
        ...(Array.isArray(previous.clientReminderKeys)
          ? previous.clientReminderKeys.map(String)
          : []),
      ]),
    ).slice(-60);
    const providerMerged = mergeCloudContact(
      client as { id: number; phone: string },
      previous as { id: number; phone: string },
    );
    return {
      ...previous,
      ...client,
      ...providerMerged,
      ...deletionState(previous, client),
      communications: mergeCommunications(
        previous.communications,
        client.communications,
      ),
      clientReminderKeys: reminderKeys,
      dailyOutreach: previous.dailyOutreach,
      nurture:previous.nurture,
      lastInboundAt: serverReplyNewer
        ? previous.lastInboundAt
        : client.lastInboundAt || previous.lastInboundAt,
      lastSmsAt: newer(previous.lastSmsAt, client.lastSmsAt)
        ? previous.lastSmsAt
        : client.lastSmsAt || previous.lastSmsAt,
      lastEmailAt: newer(previous.lastEmailAt, client.lastEmailAt)
        ? previous.lastEmailAt
        : client.lastEmailAt || previous.lastEmailAt,
      ...(serverReplyNewer
        ? { smsOptOut: previous.smsOptOut, emailOptOut: previous.emailOptOut }
        : {}),
      ...(serverReplyNewer || serverAutomationNewer
        ? {
            automationSequenceId: previous.automationSequenceId,
            automationStep: previous.automationStep,
            automationStatus: previous.automationStatus,
            automationNextAt: previous.automationNextAt,
            automationDeliveryFailures: previous.automationDeliveryFailures,
            automationLastError: previous.automationLastError,
            automationDeadLetterAt: previous.automationDeadLetterAt,
            automationUpdatedAt: previous.automationUpdatedAt,
          }
        : {}),
    };
  });
  for (const lead of serverLeads)
    if (!incomingIds.has(String(lead.id))) leads.push(lead);
  const serverLogs = server.callLogs as Array<Record<string, unknown>>;
  const byLogId = new Map(serverLogs.map((log) => [String(log.id), log]));
  const byCallSid = new Map(
    serverLogs
      .filter((log) => log.callSid)
      .map((log) => [String(log.callSid), log]),
  );
  const matchedServerLogIds = new Set<string>();
  const callLogs = (incoming.callLogs as Array<Record<string, unknown>>).map(
    (client) => {
      const previous =
        byLogId.get(String(client.id)) ||
        (client.callSid ? byCallSid.get(String(client.callSid)) : undefined);
      if (!previous) return client;
      matchedServerLogIds.add(String(previous.id));
      return mergeAiCallResult({
        ...previous,
        ...client,
        ...mergeCallDetection(client, previous),
        recordingSid: client.recordingSid || previous.recordingSid,
        recordingUrl: client.recordingUrl || previous.recordingUrl,
        recordingStatus: client.recordingStatus || previous.recordingStatus,
        transcript: client.transcript || previous.transcript,
        aiSummary: typeof client.aiSummary === 'string' && client.aiSummary ? client.aiSummary : typeof previous.aiSummary === 'string' ? previous.aiSummary : undefined,
      },previous,true);
    },
  );
  for (const log of serverLogs)
    if (!matchedServerLogIds.has(String(log.id))) callLogs.push(log);
  const serverFeed = server.profile.minerAutoFeed,
    clientFeed = incoming.profile.minerAutoFeed;
  const profile = newer(serverFeed.lastRunAt, clientFeed.lastRunAt)
    ? {
        ...incoming.profile,
        minerAutoFeed: {
          ...clientFeed,
          lastRunAt: serverFeed.lastRunAt,
          lastRunStatus: serverFeed.lastRunStatus,
          lastAdded: serverFeed.lastAdded,
          cursor: Math.max(serverFeed.cursor, clientFeed.cursor),
        },
      }
    : incoming.profile;
  return cleanWorkspacePayload({
    leads: leads.slice(0, 5000),
    callLogs: callLogs.slice(0, 1000),
    profile,
    smsLedger:server.smsLedger,
    ...(server.aiControl?{aiControl:server.aiControl}:{}),
    minerState:server.minerState,
    voicePilot:server.voicePilot,
    voicePilotBlocked:server.voicePilotBlocked,
    voicePilotHistory:server.voicePilotHistory,
    documentInsights:server.documentInsights,
    noteReminders:server.noteReminders,noteReview:server.noteReview,
    conversationCalendar:server.conversationCalendar,
    officeItems:reconcileCallCalendar(rawServerLeads,leads,server.officeItems),
    ...(server.quoteIntake?{quoteIntake:server.quoteIntake}:{}),
  });
}

export function workspaceRedisConfig() {
  // A URL and token must belong to the same connection; do not mix providers.
  const kvUrl=process.env.KV_REST_API_URL?.trim()||"",kvToken=process.env.KV_REST_API_TOKEN?.trim()||"";
  return kvUrl||kvToken ? {url:kvUrl,token:kvToken} : {
    url:process.env.UPSTASH_REDIS_REST_URL?.trim()||"",
    token:process.env.UPSTASH_REDIS_REST_TOKEN?.trim()||"",
  };
}

export async function workspaceRedis(command: Array<string | number>) {
  const { url, token } = workspaceRedisConfig();
  if (!url && !token) return null;
  if (!url || !token) throw new WorkspaceLoadError("STORAGE_NOT_CONFIGURED",503);
  let response:Response;
  try { response = await fetch(url, {
    method: "POST",
    signal:AbortSignal.timeout(8000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  }); } catch { throw new WorkspaceLoadError("STORAGE_UNAVAILABLE",503,"",true); }
  let data:{result?:unknown;error?:string};
  try { data=await response.json(); } catch { throw new WorkspaceLoadError("STORAGE_UNAVAILABLE",503,"",true); }
  if (!data || typeof data !== "object") throw new WorkspaceLoadError("STORAGE_UNAVAILABLE",503,"",true);
  if (!response.ok || data.error)
    throw new WorkspaceLoadError(response.status===401||response.status===403||/unauth|wrongpass|invalid.*token/i.test(data.error||"")
      ?"STORAGE_AUTH_FAILED":response.status===429||/quota|limit exceeded|too many requests/i.test(data.error||"")?"STORAGE_LIMIT":"STORAGE_UNAVAILABLE",503,"",response.status>=500);
  if (!Object.hasOwn(data,"result")) throw new WorkspaceLoadError("STORAGE_UNAVAILABLE",503,"",true);
  return data.result;
}

export async function acquireAutomationLease(key:string,token:string,seconds=90){
  const config=workspaceRedisConfig();
  if(config.url){if(!config.token)throw Error('Cloud storage credentials are incomplete.');return (await workspaceRedis(['SET',key,token,'NX','EX',seconds]))==='OK';}
  const db=await workspaceD1();
  await db.prepare('CREATE TABLE IF NOT EXISTS crm_job_leases (id TEXT PRIMARY KEY, token TEXT NOT NULL, expires_at INTEGER NOT NULL)').run();
  const result=await db.prepare('INSERT INTO crm_job_leases (id,token,expires_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE crm_job_leases.expires_at < ?').bind(key,token,Date.now()+seconds*1000,Date.now()).run();
  return result.meta.changes>0;
}
export async function releaseAutomationLease(key:string,token:string){
  if(workspaceRedisConfig().url){await workspaceRedis(['EVAL','if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end',1,key,token]);return;}
  const db=await workspaceD1();await db.prepare('DELETE FROM crm_job_leases WHERE id=? AND token=?').bind(key,token).run();
}

async function workspaceD1() {
  if(process.env.VERCEL)throw new WorkspaceLoadError("STORAGE_NOT_CONFIGURED",503);
  const { getD1 } = await import("../../db/index");
  const db = getD1();
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS crm_workspaces (user_id TEXT PRIMARY KEY, workspace_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
    )
    .run();
  return db;
}

export async function readStoredWorkspace(userId: string) {
  const stored = await workspaceRedis(["GET", workspaceKey(userId)]);
  if (typeof stored === "string")
    return parseStoredWorkspace(stored);
  if(stored!==null)throw new WorkspaceLoadError("WORKSPACE_DATA_INVALID",500);
  if (workspaceRedisConfig().url) return null;
  const db = await workspaceD1();
  const result = (await db
    .prepare(
      "SELECT workspace_json AS workspaceJson FROM crm_workspaces WHERE user_id=? LIMIT 1",
    )
    .bind(workspaceDatabaseId(userId))
    .first()) as { workspaceJson?: string } | null;
  return result?.workspaceJson
    ? parseStoredWorkspace(result.workspaceJson)
    : null;
}

function parseStoredWorkspace(raw:string):StoredWorkspace {
  try {
    const value=JSON.parse(raw);
    if(!value||typeof value!=="object"||Array.isArray(value)||!Array.isArray(value.leads)||!Array.isArray(value.callLogs))
      throw new Error("Invalid workspace data");
    return cleanWorkspacePayload(value);
  }catch{throw new WorkspaceLoadError("WORKSPACE_DATA_INVALID",500);}
}

export async function migrateLegacyStoredWorkspace(userId: string) {
  if (workspaceRedisConfig().url) return null;
  const db = await workspaceD1();
  const result = (await db
    .prepare(
      "SELECT workspace_json AS workspaceJson FROM crm_workspaces WHERE user_id=? LIMIT 1",
    )
    .bind(userId)
    .first()) as { workspaceJson?: string } | null;
  if (!result?.workspaceJson) return null;
  const workspace = cleanWorkspacePayload(JSON.parse(result.workspaceJson));
  await writeStoredWorkspace(userId, workspace);
  return workspace;
}

export async function writeStoredWorkspace(
  userId: string,
  workspace: StoredWorkspace,
) {
  const {archiveWorkspaceConversations}=await import("./conversation-history");
  const serialized = JSON.stringify(await archiveWorkspaceConversations(userId,cleanWorkspacePayload(workspace)));
  const saved = await workspaceRedis(["SET", workspaceKey(userId), serialized]);
  if (saved !== null) return;
  const db = await workspaceD1();
  await db
    .prepare(
      "INSERT INTO crm_workspaces (user_id,workspace_json,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET workspace_json=excluded.workspace_json, updated_at=excluded.updated_at",
    )
    .bind(workspaceDatabaseId(userId), serialized, new Date().toISOString())
    .run();
}

export async function listStoredWorkspaces(
  limit = 500,
): Promise<WorkspaceRecord[]> {
  if (workspaceRedisConfig().url) {
    const records: WorkspaceRecord[] = [];
    let cursor = "0";
    let passes = 0;
    do {
      const result = await workspaceRedis([
        "SCAN",
        cursor,
        "MATCH",
        `pacifica:${workspaceVersion}:workspace:*`,
        "COUNT",
        100,
      ]);
      if (!Array.isArray(result)) break;
      cursor = String(result[0] || "0");
      const keys = Array.isArray(result[1]) ? result[1].map(String) : [];
      const storedBatch = keys.length
        ? await workspaceRedis(["MGET", ...keys])
        : [];
      const values = Array.isArray(storedBatch) ? storedBatch : [];
      for (let index = 0; index < keys.length; index++) {
        const stored = values[index];
        if (typeof stored !== "string") continue;
        records.push({
          workspaceId: keys[index].slice(
            `pacifica:${workspaceVersion}:workspace:`.length,
          ),
          workspace: cleanWorkspacePayload(JSON.parse(stored)),
        });
        if (records.length >= limit) return records;
      }
      passes++;
    } while (cursor !== "0" && passes < 25);
    return records;
  }
  const db = await workspaceD1();
  const result = await db
    .prepare(
      "SELECT user_id AS userId,workspace_json AS workspaceJson FROM crm_workspaces WHERE user_id LIKE 'v2:%' LIMIT ?",
    )
    .bind(limit)
    .all();
  return (
    result.results as Array<{ userId: string; workspaceJson: string }>
  ).map((row) => ({
    workspaceId: row.userId.replace(/^v2:/, ""),
    workspace: cleanWorkspacePayload(JSON.parse(row.workspaceJson)),
  }));
}

/** A targeted run must load that tenant directly, not filter a truncated scan. */
export async function automationWorkspaces(options: {
  workspaceId?: string;
  workspaceLimit?: number;
}): Promise<WorkspaceRecord[]> {
  if (options.workspaceId) {
    const workspace = await readStoredWorkspace(options.workspaceId);
    return workspace ? [{ workspaceId: options.workspaceId, workspace }] : [];
  }
  return listStoredWorkspaces(options.workspaceLimit || 500);
}

// Apply a narrow background update without replacing edits made during enrichment.
export async function updateStoredWorkspace(
  userId: string,
  update: (current: StoredWorkspace) => StoredWorkspace,
  options: { create?: boolean } = {},
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (workspaceRedisConfig().url) {
      const raw = await workspaceRedis(["GET", workspaceKey(userId)]);
      if (typeof raw !== "string" && !options.create)
        throw new Error("Workspace not found");
      const current = cleanWorkspacePayload(
        typeof raw === "string" ? JSON.parse(raw) : {},
      );
      const updated = update(current);
      if (updated === current) return current;
      const {archiveWorkspaceConversations}=await import("./conversation-history");
      const next = await archiveWorkspaceConversations(userId,cleanWorkspacePayload(updated),current);
      const saved = await workspaceRedis([
        "EVAL",
        "local current=redis.call('GET',KEYS[1]); if (ARGV[3]=='create' and not current) or current==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end",
        1,
        workspaceKey(userId),
        typeof raw === "string" ? raw : "",
        JSON.stringify(next),
        typeof raw === "string" ? "update" : "create",
      ]);
      if (saved === 1) return next;
    } else {
      const db = await workspaceD1();
      const row = (await db
        .prepare(
          "SELECT workspace_json AS value FROM crm_workspaces WHERE user_id=?",
        )
        .bind(workspaceDatabaseId(userId))
        .first()) as { value: string } | null;
      if (!row && !options.create) throw new Error("Workspace not found");
      const current = cleanWorkspacePayload(row ? JSON.parse(row.value) : {});
      const updated = update(current);
      if (updated === current) return current;
      const {archiveWorkspaceConversations}=await import("./conversation-history");
      const next = await archiveWorkspaceConversations(userId,cleanWorkspacePayload(updated),current);
      const result = row
        ? await db
            .prepare(
              "UPDATE crm_workspaces SET workspace_json=?,updated_at=? WHERE user_id=? AND workspace_json=?",
            )
            .bind(
              JSON.stringify(next),
              new Date().toISOString(),
              workspaceDatabaseId(userId),
              row.value,
            )
            .run()
        : await db
            .prepare(
              "INSERT INTO crm_workspaces (user_id,workspace_json,updated_at) VALUES (?,?,?) ON CONFLICT(user_id) DO NOTHING",
            )
            .bind(
              workspaceDatabaseId(userId),
              JSON.stringify(next),
              new Date().toISOString(),
            )
            .run();
      if (result.meta.changes === 1) return next;
    }
  }
  throw new Error("Workspace changed during save. Please retry.");
}

/** Persist only a background job's changes, rebasing them onto the latest data.
 * The updater may retry: never send messages or perform other side effects inside it.
 */
export async function saveWorkspaceChanges(
  userId: string,
  before: StoredWorkspace,
  after: StoredWorkspace,
) {
  return updateStoredWorkspace(
    userId,
    (current) => applyWorkspaceChanges(before, after, current),
    { create: true },
  );
}
