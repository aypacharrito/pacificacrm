import {createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID} from 'node:crypto';
import {workspaceRedis, workspaceRedisConfig} from '../workspace-redis';
import {ConnectedError, defaultPreferences, type Event, type Grant, type Identity, type Message, type Owner, type Preferences, type Provider} from './types';

const prefix = 'pacifica:connected:v1:';
const jobs = prefix + 'jobs';
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('base64url');
const ownerKey = (owner: Owner) => prefix + digest([owner.workspace, owner.member]);
const accountKey = (owner: Owner, id: string) => ownerKey(owner) + ':' + id;
const jobKey = (owner: Owner, id: string) => JSON.stringify([owner.workspace, owner.member, id]);
const runtimeKey = () => process.env.PACIFICA_CONNECTED_ENCRYPTION_KEY?.trim() || '';
const validId = (value: string) => /^[A-Za-z0-9_-]{20,80}$/.test(value);
export const sameOwner = (a: Owner, b: Owner) => a.member === b.member && a.workspace === b.workspace;
export const connectionId = (owner: Owner, provider: Provider, identity: Identity) =>
  digest([owner.workspace, owner.member, provider, identity.tenant, identity.subject]);
export const isConnectedConfigured = () => {
  const {url, token} = workspaceRedisConfig();
  return Boolean(url && token && /^[a-f0-9]{64}$/i.test(runtimeKey()));
};

function encryptionKey() {
  const key = runtimeKey();
  if (!/^[a-f0-9]{64}$/i.test(key)) throw new ConnectedError(503, 'Connected accounts need an encryption key.');
  return Buffer.from(key, 'hex');
}
export function seal(value: unknown, context: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(prefix + context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function unseal<T>(value: string, context: string): T {
  const data = Buffer.from(value, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(prefix + context));
  decipher.setAuthTag(data.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8')) as T;
}

async function redis(command: Array<string | number>) {
  if (!isConnectedConfigured()) throw new ConnectedError(503, 'Connected accounts need server storage and encryption.');
  return workspaceRedis(command);
}

async function get<T>(key: string) {
  const raw = await redis(['GET', key]);
  return typeof raw === 'string' ? unseal<T>(raw, key) : null;
}

export function encodeSource(owner: Owner, open: string, values: string[], until?: number) {
  return seal({values, until}, ownerKey(owner) + ':' + open);
}
export function decodeSource(owner: Owner, open: string, token: string, count: number) {
  try {
    if (!/^[A-Za-z0-9_-]{20,11000}$/.test(token)) throw Error();
    const {values, until} = unseal<{values: string[]; until?: number}>(token, ownerKey(owner) + ':' + open);
    if (!Array.isArray(values) || values.length !== count || values.some(value => typeof value !== 'string' || !value || value.length > 4000) ||
        (until !== undefined && until < Date.now())) throw Error();
    return values;
  } catch {
    throw new ConnectedError(404, 'This source is unavailable. Open it again from Connected mail or Calendar.');
  }
}

export async function listGrants(owner: Owner) {
  if (!isConnectedConfigured()) return [];
  const ids = await redis(['SMEMBERS', ownerKey(owner) + ':accounts']);
  if (!Array.isArray(ids)) return [];
  const list: Grant[] = [];
  for (let offset = 0; offset < ids.length; offset += 12) {
    const keys = ids.slice(offset, offset + 12).filter((id): id is string => typeof id === 'string' && validId(id)).map(id => accountKey(owner, id));
    if (!keys.length) continue;
    const values = await redis(['MGET', ...keys]);
    if (!Array.isArray(values)) continue;
    values.forEach((raw, i) => {
      if (typeof raw !== 'string') return;
      const grant = unseal<Grant>(raw, keys[i]);
      if (sameOwner(grant.owner, owner) && keys[i] === accountKey(owner, grant.id)) list.push(grant);
    });
  }
  return list.sort((a, b) => a.since - b.since || a.id.localeCompare(b.id));
}

export async function getGrant(owner: Owner, id: string) {
  if (!validId(id)) return null;
  const row = await get<Grant>(accountKey(owner, id));
  return row?.id === id && sameOwner(owner, row.owner) ? row : null;
}
export async function requireGrant(owner: Owner, id: string) {
  const row = await getGrant(owner, id);
  if (!row) throw new ConnectedError(404, 'Connected account could not be found.');
  return row;
}

const unlock = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
export async function accountLease<T>(owner: Owner, id: string, work: (lease: string) => Promise<T>) {
  const key = accountKey(owner, id) + ':lease';
  const lease = randomUUID();
  if (await redis(['SET', key, lease, 'NX', 'PX', 110_000]) !== 'OK')
    throw new ConnectedError(409, 'This account is busy. Try again shortly.');
  try { return await work(lease); }
  finally { await redis(['EVAL', unlock, 1, key, lease]).catch(() => undefined); }
}

export type SyncCache = {
  mail: Message[]; events: Event[]; mailPage?: string; mailAfter?: number; mailAnchor?: string;
  historyPage?: string; stageAnchor?: string; watchUntil?: number; mailDiscovered?: number; calendarDiscovered?: number;
  calendars?: Array<{id: string; from: string; to: string; checked?: number; page?: string; anchor?: string; retryAt?: number}>;
};
export const emptyCache = (): SyncCache => ({mail: [], events: []});
export const loadCache = async (owner: Owner, id: string) => await get<SyncCache>(accountKey(owner, id) + ':cache') || emptyCache();

const save = [
  "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end",
  "redis.call('SET',KEYS[2],ARGV[2])",
  "redis.call('SADD',KEYS[3],ARGV[3])",
  "if ARGV[4]=='' then redis.call('ZREM',KEYS[4],ARGV[5]) else redis.call('ZADD',KEYS[4],ARGV[4],ARGV[5]) end",
  "if ARGV[6]~='' then redis.call('SET',KEYS[5],ARGV[6]) end",
  'return 1',
].join('\n');
export async function saveGrant(grant: Grant, lease: string, due?: number, cache?: SyncCache) {
  const key = accountKey(grant.owner, grant.id);
  const cacheKey = key + ':cache';
  const result = await redis(['EVAL', save, 5, key + ':lease', key, ownerKey(grant.owner) + ':accounts', jobs, cacheKey,
    lease, seal(grant, key), grant.id, due ?? (grant.state === 'reconnect' ? '' : Date.now()), jobKey(grant.owner, grant.id), cache ? seal(cache, cacheKey) : '']);
  if (result !== 1) throw new ConnectedError(409, 'Another sync has taken over this account.');
}

const remove = [
  "if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end",
  "redis.call('DEL',KEYS[2],KEYS[3])",
  "redis.call('SREM',KEYS[4],ARGV[2])",
  "redis.call('ZREM',KEYS[5],ARGV[3])",
  'return 1',
].join('\n');
export async function deleteGrant(owner: Owner, id: string, lease: string) {
  const key = accountKey(owner, id);
  if (await redis(['EVAL', remove, 5, key + ':lease', key, key + ':cache', ownerKey(owner) + ':accounts', jobs, lease, id, jobKey(owner, id)]) !== 1)
    throw new ConnectedError(409, 'This account is busy. Try again shortly.');
}
export async function dueAccounts(now = Date.now()) {
  const rows = await redis(['ZRANGEBYSCORE', jobs, 0, now, 'LIMIT', 0, 8]);
  if (!Array.isArray(rows)) return [];
  return rows.flatMap(item => {
    try {
      const [workspace, member, id] = JSON.parse(String(item)) as string[];
      return /^[A-Za-z0-9_-]{1,160}$/.test(workspace) && /^[A-Za-z0-9_-]{1,160}$/.test(member) && validId(id)
        ? [{owner: {workspace, member}, id}] : [];
    } catch { return []; }
  });
}
export async function deferJob(owner: Owner, id: string) {
  await redis(['ZADD', jobs, 'XX', Date.now() + 3_600_000, jobKey(owner, id)]);
}
const watchKey = (email: string) => prefix + 'gmail-watch:' + digest(email.toLowerCase());
export async function indexGmailWatch(grant: Grant) {
  const key = watchKey(grant.email);
  await redis(['EVAL', "redis.call('SADD',KEYS[1],ARGV[1]); return redis.call('EXPIRE',KEYS[1],691200)", 1, key, jobKey(grant.owner, grant.id)]);
}
export async function unindexGmailWatch(grant: Grant) {
  await redis(['SREM', watchKey(grant.email), jobKey(grant.owner, grant.id)]);
}
export async function signalGmail(email: string) {
  const pointers = await redis(['SMEMBERS', watchKey(email)]);
  const now = Date.now();
  if (!Array.isArray(pointers)) return;
  for (const pointer of pointers.slice(0, 500)) {
    const [workspace, member, id] = JSON.parse(String(pointer)) as string[];
    const grant = await getGrant({workspace, member}, id);
    if (grant?.provider === 'google' && grant.email.toLowerCase() === email && grant.enabled.mail && grant.granted.mail &&
        grant.state !== 'reconnect' && (grant.retryAt || 0) <= now) await redis(['ZADD', jobs, 'XX', 'LT', now, String(pointer)]);
  }
}
export async function quota(owner: Owner, operation: string, budget: number) {
  // Reads against a deployment with no configured account store return an empty list or
  // a setup error. An authenticated request cannot open a provider without the store.
  if (!isConnectedConfigured()) return;
  const key = ownerKey(owner) + ':quota:' + operation;
  const n = await redis(['EVAL', "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n", 1, key]);
  if (typeof n === 'number' && n > budget) throw new ConnectedError(429, 'Wait a minute before making another request.', Date.now() + 60_000);
}

export const loadPreferences = async (owner: Owner) =>
  (isConnectedConfigured() ? await get<Preferences>(ownerKey(owner) + ':preferences') : null) || defaultPreferences;
export async function savePreferences(owner: Owner, preferences: Preferences) {
  const key = ownerKey(owner) + ':preferences';
  await redis(['SET', key, seal(preferences, key)]);
}

export async function saveCursor(owner: Owner, value: unknown) {
  const id = randomBytes(24).toString('base64url'), key = ownerKey(owner) + ':cursor:' + id;
  await redis(['SET', key, seal(value, key), 'EX', 900]);
  return id;
}
export async function readCursor<T>(owner: Owner, id: string) {
  const value = validId(id) ? await get<T>(ownerKey(owner) + ':cursor:' + id) : null;
  if (!value) throw new ConnectedError(410, 'This inbox page expired. Refresh to start again.');
  return value;
}

export async function claimOauthState(owner: Owner, nonce: string) {
  return await redis(['SET', ownerKey(owner) + ':oauth:' + digest(nonce), '1', 'NX', 'EX', 900]) === 'OK';
}
